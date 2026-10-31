/**
 * 1:1 call lifecycle.
 *
 * Call control (invite / accept / decline / cancel / busy / hangup) travels over
 * each user's private inbox topic ("inbox/<userId>"); the server stamps every
 * message with the authenticated sender, so it cannot be spoofed. Media
 * negotiation runs over a two-person Mesh on "call/<callId>", where callId is a
 * random, unguessable id, and only the two participants are accepted as peers.
 *
 * Non-serialisable resources (peer connection, mesh, timers, tracks) live in
 * `session`; Redux holds what the UI renders.
 */
import {getCurrentUser, getCurrentUserId, getUser} from 'mattermost-redux/selectors/entities/users';
import {getCurrentTeam} from 'mattermost-redux/selectors/entities/teams';

import ActionTypes from '../action_types';
import {basePath, createDirectChannel, publishSignal} from '../client';
import {getCall, getPluginConfig, isConfigLoaded, isInCall} from '../selectors';
import createHub, {randomId} from '../signal/hub';
import Mesh from '../signal/mesh';
import debug from '../utils/debug';
import {buildIceServers} from '../utils/iceServers';
import {displayNameForId, ensureProfiles, findDirectChannelId} from '../utils/users';

import {notifyIncomingCall, startRinging, stopRinging} from './alerts';
import {createInvitePost, updateInvitePost} from './invitePost';
import {getCallMedia, getScreen, stopStream} from './media';

export const OUTGOING_RING_TIMEOUT_MS = 45000;
export const INCOMING_RING_TIMEOUT_MS = 50000;
export const RECONNECT_TIMEOUT_MS = 20000;
const ENDED_DISMISS_MS = 2500;

// Reasons for which the "ended" screen dismisses itself.
const AUTO_DISMISS = new Set(['hangup', 'cancelled']);

let inbox = null;
let session = null;

function newSession(callId, peerId) {
    return {
        callId,
        peerId,
        mesh: null,
        peer: null,
        stream: null,
        cameraTrack: null,
        screenTrack: null,
        invite: null,
        timers: {},
        ended: false,
    };
}

function setTimer(s, name, ms, fn) {
    clearTimer(s, name);
    s.timers[name] = setTimeout(fn, ms);
}

function clearTimer(s, name) {
    if (s && s.timers[name]) {
        clearTimeout(s.timers[name]);
        delete s.timers[name];
    }
}

function isCurrent(s) {
    return s && session === s && !s.ended;
}

function update(dispatch, s, data) {
    dispatch({type: ActionTypes.CALL_UPDATED, data: {...data, callId: s.callId}});
}

function sendInbox(userId, message) {
    if (inbox) {
        inbox.broadcast(userId, message);
    }
}

function sendPeer(s, message) {
    if (s && s.peer && !s.peer.destroyed) {
        try {
            s.peer.send(JSON.stringify(message));
        } catch (e) {
            debug('data channel send failed', e);
        }
    }
}

function sendState(s, getState) {
    const call = getCall(getState());
    if (!call) {
        return;
    }
    sendPeer(s, {type: 'state', audio: call.audioOn, video: call.videoOn && call.hasVideo, screen: call.screenSharing});
}

function teardown(s) {
    if (!s) {
        return;
    }
    s.ended = true;
    Object.keys(s.timers).forEach((name) => clearTimer(s, name));
    if (s.mesh) {
        try {
            s.mesh.close();
        } catch (e) {
            // ignore
        }
        s.mesh = null;
    }
    s.peer = null;
    if (s.screenTrack) {
        s.screenTrack.stop();
        s.screenTrack = null;
    }
    stopStream(s.stream);
    s.stream = null;
}

/**
 * Ends the current session locally. Does not notify the peer; callers do that
 * first when appropriate.
 */
function finish(s, reason, {error, postStatus} = {}) {
    return (dispatch, getState) => {
        if (!s || s.ended) {
            return;
        }
        const call = getCall(getState());
        stopRinging();
        teardown(s);
        if (session === s) {
            session = null;
        }

        if (call && call.direction === 'outgoing' && call.postId && s.invite) {
            const status = postStatus || reason;
            const durationMs = call.startedAt ? Date.now() - call.startedAt : 0;
            updateInvitePost(call.postId, s.invite, {status: call.startedAt ? 'ended' : status, durationMs}).catch((e) => {
                debug('could not update call post', e);
            });
        }

        dispatch({type: ActionTypes.CALL_ENDED, data: {callId: s.callId, reason, error}});
        if (AUTO_DISMISS.has(reason)) {
            setTimeout(() => dispatch(dismissCall(s.callId)), ENDED_DISMISS_MS);
        }
    };
}

export function dismissCall(callId) {
    return {type: ActionTypes.CALL_DISMISSED, data: {callId}};
}

// --- Inbox ---------------------------------------------------------------

export function startInbox() {
    return (dispatch, getState) => {
        const me = getCurrentUserId(getState());
        if (inbox || !me) {
            return;
        }
        inbox = createHub('inbox');
        inbox.subscribe(me, (msg) => dispatch(handleInboxMessage(msg)));
        debug('listening for calls');
    };
}

export function stopInbox() {
    if (session) {
        teardown(session);
        session = null;
    }
    stopRinging();
    if (inbox) {
        inbox.close();
        inbox = null;
    }
}

export function handleInboxMessage(msg) {
    return (dispatch, getState) => {
        if (!msg || typeof msg !== 'object' || !msg._sender || !msg.callId) {
            return;
        }
        const from = msg._sender;
        const state = getState();
        if (from === getCurrentUserId(state)) {
            return;
        }

        if (msg.type === 'invite') {
            dispatch(receiveInvite(from, msg));
            return;
        }

        const s = session;
        const call = getCall(state);
        if (!isCurrent(s) || !call || s.callId !== msg.callId || s.peerId !== from) {
            return;
        }

        switch (msg.type) {
        case 'accept':
            if (call.direction === 'outgoing' && call.status === 'ringing') {
                clearTimer(s, 'ring');
                update(dispatch, s, {status: 'connecting'});
                dispatch(joinMesh(s));
            }
            break;
        case 'decline':
            if (call.direction === 'outgoing') {
                dispatch(finish(s, 'declined'));
            }
            break;
        case 'busy':
            if (call.direction === 'outgoing') {
                dispatch(finish(s, 'busy', {postStatus: 'missed'}));
            }
            break;
        case 'cancel':
            if (call.direction === 'incoming' && call.status === 'ringing') {
                dispatch(finish(s, 'cancelled'));
            }
            break;
        case 'hangup':
            dispatch(finish(s, 'hangup'));
            break;
        default:
            break;
        }
    };
}

function receiveInvite(from, msg) {
    return (dispatch, getState) => {
        const state = getState();
        if (isInCall(state)) {
            const call = getCall(state);
            if (!call || call.callId !== msg.callId) {
                sendInbox(from, {type: 'busy', callId: msg.callId});
            }
            return;
        }
        if (getCall(state)) {
            dispatch(dismissCall());
        }

        const s = newSession(msg.callId, from);
        session = s;
        dispatch({
            type: ActionTypes.CALL_STARTED,
            data: {callId: msg.callId, peerId: from, direction: 'incoming', status: 'ringing', peerWantsVideo: msg.video !== false},
        });
        dispatch(ensureProfiles([from])).then(() => {
            const st = getState();
            const me = getCurrentUser(st);
            const peer = getUser(st, from);
            const team = getCurrentTeam(st);
            const name = displayNameForId(st, from);
            notifyIncomingCall(dispatch, {
                title: msg.video === false ? 'Incoming voice call' : 'Incoming video call',
                body: `${name} is calling you`,
                channelId: findDirectChannelId(st, from),
                teamId: team && team.id,
                url: team && peer ? `${basePath()}/${team.name}/messages/@${peer.username}` : '',
            });
            if (isCurrent(s)) {
                startRinging(me && me.notify_props && me.notify_props.calls_notification_sound);
            }
        });

        setTimer(s, 'ring', INCOMING_RING_TIMEOUT_MS, () => {
            if (isCurrent(s)) {
                dispatch(finish(s, 'cancelled'));
            }
        });
    };
}

// --- Outgoing ------------------------------------------------------------

export function startCall(peerId) {
    return async (dispatch, getState) => {
        const state = getState();
        const me = getCurrentUser(state);
        if (!me || !peerId || peerId === me.id) {
            return;
        }
        if (!isConfigLoaded(state) || !inbox) {
            debug('call: plugin not ready');
            return;
        }
        if (isInCall(state)) {
            return;
        }
        if (getCall(state)) {
            dispatch(dismissCall());
        }

        const callId = randomId();
        const s = newSession(callId, peerId);
        session = s;
        dispatch({type: ActionTypes.CALL_STARTED, data: {callId, peerId, direction: 'outgoing', status: 'ringing'}});
        dispatch(ensureProfiles([peerId]));

        let media;
        try {
            media = await getCallMedia({video: true});
        } catch (err) {
            dispatch(finish(s, 'error', {error: err.message}));
            return;
        }
        if (!isCurrent(s)) {
            stopStream(media.stream);
            return;
        }
        s.stream = media.stream;
        s.cameraTrack = media.stream.getVideoTracks()[0] || null;
        update(dispatch, s, {localStream: media.stream, hasVideo: media.video, videoOn: media.video});

        sendInbox(peerId, {type: 'invite', callId, video: media.video});
        setTimer(s, 'ring', OUTGOING_RING_TIMEOUT_MS, () => {
            if (isCurrent(s)) {
                sendInbox(peerId, {type: 'cancel', callId});
                dispatch(finish(s, 'no_answer', {postStatus: 'missed'}));
            }
        });

        // A post in the DM records the call; failures here never block the call.
        try {
            const channelId = findDirectChannelId(getState(), peerId) || (await createDirectChannel(me.id, peerId)).id;
            const {post, invite} = await createInvitePost({channelId, caller: me, calleeId: peerId, callId, video: media.video});
            s.invite = invite;
            if (session === s) {
                update(dispatch, s, {postId: post.id, channelId});
            } else if (s.invite) {
                // Call already ended before the post existed: record the outcome.
                const call = getCall(getState());
                const status = call && call.callId === callId && call.endReason === 'declined' ? 'declined' : 'missed';
                updateInvitePost(post.id, invite, {status}).catch(() => {
                    // ignore
                });
            }
        } catch (e) {
            debug('call: invite post failed', e);
        }
    };
}

// --- Incoming ------------------------------------------------------------

export function acceptCall() {
    return async (dispatch, getState) => {
        const s = session;
        const call = getCall(getState());
        if (!isCurrent(s) || !call || call.direction !== 'incoming' || call.status !== 'ringing') {
            return;
        }
        stopRinging();
        clearTimer(s, 'ring');
        update(dispatch, s, {status: 'connecting'});

        let media;
        try {
            media = await getCallMedia({video: call.peerWantsVideo});
        } catch (err) {
            sendInbox(s.peerId, {type: 'decline', callId: s.callId});
            dispatch(finish(s, 'error', {error: err.message}));
            return;
        }
        if (!isCurrent(s)) {
            stopStream(media.stream);
            return;
        }
        s.stream = media.stream;
        s.cameraTrack = media.stream.getVideoTracks()[0] || null;
        update(dispatch, s, {localStream: media.stream, hasVideo: media.video, videoOn: media.video});

        sendInbox(s.peerId, {type: 'accept', callId: s.callId});
        dispatch(joinMesh(s));
    };
}

export function declineCall() {
    return (dispatch) => {
        const s = session;
        if (!isCurrent(s)) {
            return;
        }
        sendInbox(s.peerId, {type: 'decline', callId: s.callId});
        dispatch(finish(s, 'declined'));
        dispatch(dismissCall(s.callId));
    };
}

export function hangUp() {
    return (dispatch, getState) => {
        const s = session;
        const call = getCall(getState());
        if (!isCurrent(s) || !call) {
            if (call) {
                dispatch(dismissCall(call.callId));
            }
            return;
        }
        if (call.direction === 'incoming' && call.status === 'ringing') {
            dispatch(declineCall());
            return;
        }
        if (call.direction === 'outgoing' && call.status === 'ringing') {
            sendInbox(s.peerId, {type: 'cancel', callId: s.callId});
            dispatch(finish(s, 'cancelled', {postStatus: 'missed'}));
        } else {
            sendPeer(s, {type: 'hangup'});
            sendInbox(s.peerId, {type: 'hangup', callId: s.callId});
            dispatch(finish(s, 'hangup'));
        }
        dispatch(dismissCall(s.callId));
    };
}

/** Best effort hang-up when the tab is closing. */
export function hangUpOnUnload(state) {
    const s = session;
    if (!isCurrent(s)) {
        return;
    }
    const call = getCall(state);
    const type = call && call.status === 'ringing' ? {outgoing: 'cancel', incoming: 'decline'}[call.direction] : 'hangup';
    publishSignal(`inbox/${s.peerId}`, {type, callId: s.callId}, {keepalive: true}).catch(() => {
        // page is unloading
    });
    teardown(s);
}

// --- Media session ---------------------------------------------------------

function joinMesh(s) {
    return (dispatch, getState) => {
        const state = getState();
        const me = getCurrentUserId(state);
        const config = getPluginConfig(state);
        const iceServers = buildIceServers(config.STUNServer, config.TURNServer, config.TURNServerUsername, config.TURNServerCredential);

        const mesh = new Mesh({
            namespace: `call/${s.callId}`,
            userId: me,
            stream: s.stream,
            iceServers,
            maxPeers: 1,
            allowedUserIds: [me, s.peerId],
        });
        s.mesh = mesh;

        setTimer(s, 'connect', RECONNECT_TIMEOUT_MS + 10000, () => {
            if (isCurrent(s)) {
                dispatch(finish(s, 'connection_lost'));
            }
        });

        mesh.on('peer', (peer) => {
            if (!isCurrent(s)) {
                return;
            }
            s.peer = peer;
            clearTimer(s, 'connect');
            clearTimer(s, 'reconnect');
            const call = getCall(getState());
            update(dispatch, s, {status: 'active', startedAt: (call && call.startedAt) || Date.now()});

            const onStream = (stream) => {
                if (isCurrent(s) && s.peer === peer) {
                    update(dispatch, s, {remoteStream: stream, remoteTracks: stream.getTracks().length});
                }
            };
            peer.on('stream', onStream);
            peer.on('track', (track, stream) => onStream(stream));
            peer.remoteStreams.forEach(onStream);

            peer.on('data', (raw) => {
                let data;
                try {
                    data = JSON.parse(raw.toString());
                } catch (e) {
                    return;
                }
                if (data.type === 'state') {
                    update(dispatch, s, {peerAudioOn: data.audio !== false, peerVideoOn: data.video !== false, peerScreenSharing: Boolean(data.screen)});
                } else if (data.type === 'hangup' && isCurrent(s)) {
                    dispatch(finish(s, 'hangup'));
                }
            });

            sendState(s, getState);
        });

        mesh.on('disconnect', (peer) => {
            if (!isCurrent(s) || peer !== s.peer) {
                return;
            }
            s.peer = null;
            update(dispatch, s, {status: 'reconnecting', remoteStream: null});
            setTimer(s, 'reconnect', RECONNECT_TIMEOUT_MS, () => {
                if (isCurrent(s)) {
                    dispatch(finish(s, 'connection_lost'));
                }
            });
        });
    };
}

// --- In-call controls ------------------------------------------------------

export function toggleAudio() {
    return (dispatch, getState) => {
        const s = session;
        const call = getCall(getState());
        if (!isCurrent(s) || !s.stream || !call) {
            return;
        }
        const next = !call.audioOn;
        s.stream.getAudioTracks().forEach((t) => {
            t.enabled = next;
        });
        update(dispatch, s, {audioOn: next});
        sendState(s, getState);
    };
}

export function toggleVideo() {
    return (dispatch, getState) => {
        const s = session;
        const call = getCall(getState());
        if (!isCurrent(s) || !s.cameraTrack || !call) {
            return;
        }
        const next = !call.videoOn;
        s.cameraTrack.enabled = next;
        update(dispatch, s, {videoOn: next});
        sendState(s, getState);
    };
}

export function toggleScreenShare() {
    return async (dispatch, getState) => {
        const s = session;
        const call = getCall(getState());
        if (!isCurrent(s) || !s.peer || !call) {
            return;
        }
        if (s.screenTrack) {
            dispatch(stopScreenShare(s));
            return;
        }

        let track;
        try {
            track = await getScreen();
        } catch (e) {
            debug('screen share cancelled', e);
            return;
        }
        if (!isCurrent(s) || !s.peer) {
            track.stop();
            return;
        }
        try {
            if (s.cameraTrack) {
                await s.peer.replaceTrack(s.cameraTrack, track);
            } else {
                s.peer.addTrack(track, s.stream);
            }
        } catch (e) {
            debug('screen share failed', e);
            track.stop();
            return;
        }
        s.screenTrack = track;
        track.addEventListener('ended', () => dispatch(stopScreenShare(s)));
        update(dispatch, s, {screenSharing: true, localStream: new MediaStream([track])});
        sendState(s, getState);
    };
}

function stopScreenShare(s) {
    return async (dispatch, getState) => {
        const track = s.screenTrack;
        if (!track) {
            return;
        }
        s.screenTrack = null;
        try {
            if (s.peer && !s.peer.destroyed) {
                if (s.cameraTrack) {
                    await s.peer.replaceTrack(track, s.cameraTrack);
                } else {
                    s.peer.removeTrack(track);
                }
            }
        } catch (e) {
            debug('restoring camera failed', e);
        }
        track.stop();
        if (isCurrent(s)) {
            update(dispatch, s, {screenSharing: false, localStream: s.stream});
            sendState(s, getState);
        }
    };
}

// Exposed for tests.
export const __testing = {
    getSession: () => session,
    setInbox: (hub) => {
        inbox = hub;
    },
    reset: () => {
        if (session) {
            teardown(session);
        }
        session = null;
        inbox = null;
    },
};
