/* eslint-disable no-magic-numbers */
/* eslint-disable max-nested-callbacks */
/* eslint-disable no-shadow */
/* eslint-disable no-unused-vars */
import axios from 'axios';
import swarm from 'webrtc-swarm';

import {getConfig} from 'mattermost-redux/selectors/entities/general';
import {getCurrentUser, getUser} from 'mattermost-redux/selectors/entities/users';

import {id as pluginId} from 'manifest';

import ActionTypes from '../action_types';

import debug from '../utils/debug';
import {buildIceServers} from '../utils/iceServers';
import pluginSignalHub from '../utils/pluginSignalHub';
import {getDirectChannelIdForPeer, ensureDirectChannelId} from '../utils/dmChannel';
import {createVideoInvitePost, sendCallDeclinedEphemeral, newCallId} from '../utils/callInvitePosts';
import {startIncomingRing, stopIncomingRing} from '../utils/callRing';
import {notifyIncomingCall} from '../utils/callBrowserNotify';
import {attachOutgoingDeclineListener, clearOutgoingDeclineListener} from '../utils/outgoingDeclineListen';

let gStream;
let cPeer;

export function openVideoCallPicker(hintChannelId = null) {
    return {
        type: ActionTypes.OPEN_VIDEO_CALL_PICKER,
        data: {hintChannelId},
    };
}

export function closeVideoCallPicker() {
    return {
        type: ActionTypes.CLOSE_VIDEO_CALL_PICKER,
    };
}

export function loadConfig() {
    return (dispatch, getState) => {
        const user = getCurrentUser(getState());

        if (!user) {
            return;
        }

        const {configLoaded} = getState()[`plugins-${pluginId}`];

        if (configLoaded) {
            return;
        }

        debug('load config');

        axios.get(`/plugins/${pluginId}/v1/config`).then((response) => {
            if (response.status === 200) {
                debug('loaded config', response.data);
                dispatch({
                    type: ActionTypes.LOAD_CONFIG,
                    data: response.data,
                });
                listenVideoCall()(dispatch, getState);
            } else {
                debug(`Cannot fetch plugin configuration, server returned code ${response.status}`);
            }
        }).catch((e) => {
            debug(`Cannot fetch plugin configuration: ${e}`);
        });
    };
}

function callerDisplayName(user) {
    if (!user) {
        return 'Someone';
    }
    const n = `${user.first_name || ''} ${user.last_name || ''}`.trim();
    return n || user.username || 'Someone';
}

function parseIncomingCallSignal(raw) {
    if (raw == null) {
        return null;
    }
    if (typeof raw === 'string') {
        return {callerId: raw, callId: null};
    }
    if (typeof raw === 'object' && raw.callerId) {
        return {callerId: raw.callerId, callId: raw.callId || null};
    }
    return null;
}

export function makeVideoCall(peerId) {
    return (dispatch, getState) => {
        const user = getCurrentUser(getState());
        const config = getConfig(getState());
        const {configLoaded, callIncoming, callOutgoing} = getState()[`plugins-${pluginId}`];

        if (!configLoaded) {
            debug('Video call: plugin config not loaded. Check Network tab for /plugins/' + pluginId + '/v1/config');
            return;
        }

        if (!peerId) {
            debug('Video call: open a 1:1 direct message (not a group or team channel).');
            return;
        }

        if (!user.id) {
            return;
        }

        if (callIncoming) {
            return;
        }

        if (callOutgoing) {
            return;
        }

        const callId = newCallId();
        const callhub = pluginSignalHub(`mattermost-webrtc-video-${config.DiagnosticId}-call-${peerId}`);
        const accepthub = pluginSignalHub(`mattermost-webrtc-video-${config.DiagnosticId}`);

        dispatch({
            type: ActionTypes.MAKE_VIDEO_CALL,
            data: {
                peerId,
                callId,
            },
        });

        listenAccept(user.id, peerId)(dispatch, getState);

        attachOutgoingDeclineListener(accepthub, user.id, peerId, () => {
            clearOutgoingDeclineListener();
            dispatch({type: ActionTypes.OUTGOING_CALL_DECLINED});
        });

        (async () => {
            try {
                let channelId = getDirectChannelIdForPeer(getState(), user.id, peerId);
                if (!channelId) {
                    channelId = await ensureDirectChannelId(user.id, peerId);
                }
                await createVideoInvitePost(channelId, user, peerId, callId);
            } catch (e) {
                debug('Video call invite post failed (call signalling still proceeds)', e);
            }
            debug(`calling ${peerId} (${callId})`);
            callhub.broadcast(`call-${peerId}`, {callerId: user.id, callId});
        })();
    };
}

export function receiveVideoCall(peerId, callId = null) {
    return (dispatch, getState) => {
        const user = getCurrentUser(getState());
        const {callIncoming, callOutgoing} = getState()[`plugins-${pluginId}`];

        if (!peerId) {
            return;
        }

        if (!user.id) {
            return;
        }

        if (callIncoming) {
            return;
        }

        if (callOutgoing) {
            return;
        }

        dispatch({
            type: ActionTypes.RECEIVE_VIDEO_CALL,
            data: {
                peerId,
                callId,
            },
        });

        const peer = getUser(getState(), peerId);
        startIncomingRing();
        notifyIncomingCall(callerDisplayName(peer));
    };
}

export function listenVideoCall() {
    return (dispatch, getState) => {
        const config = getConfig(getState());
        const {configLoaded, callListening} = getState()[`plugins-${pluginId}`];

        if (!configLoaded) {
            return;
        }

        if (callListening) {
            return;
        }

        const user = getCurrentUser(getState());

        if (!user) {
            return;
        }

        const callhub = pluginSignalHub(`mattermost-webrtc-video-${config.DiagnosticId}-call-${user.id}`);

        debug(`listening for calls for ${user.id}`);
        callhub.subscribe(`call-${user.id}`).on('data', (raw) => {
            const parsed = parseIncomingCallSignal(raw);
            if (!parsed) {
                return;
            }
            debug(`call from ${parsed.callerId}`, parsed.callId);
            receiveVideoCall(parsed.callerId, parsed.callId)(dispatch, getState);
        });

        dispatch({
            type: ActionTypes.LISTEN_VIDEO_CALL,
        });
    };
}

function listenAccept(userId, peerId) {
    return (dispatch, getState) => {
        const config = getConfig(getState());
        const user = getUser(getState(), userId);
        const {configLoaded, callPeerId} = getState()[`plugins-${pluginId}`];

        if (!configLoaded) {
            return;
        }

        const accepthub = pluginSignalHub(`mattermost-webrtc-video-${config.DiagnosticId}`);
        accepthub.subscribe('all').on('data', ({...a}) => {
            debug('HUB DATA', a);
        });

        accepthub.subscribe(`accept-${peerId}`).on('data', (acceptedUserId) => {
            const {peerAccepted} = getState()[`plugins-${pluginId}`];
            if (acceptedUserId !== userId) {
                return;
            }

            if (peerAccepted) {
                return;
            }

            const {stunServer: stun2, turnServer: turn2, turnServerUsername: tu2, turnServerCredential: tc2} = getState()[`plugins-${pluginId}`];

            const iceServers = buildIceServers(stun2, turn2, tu2, tc2);

            const callhub = pluginSignalHub(`mattermost-webrtc-video-${config.DiagnosticId}-call-${callPeerId}`);
            const sw = swarm(
                callhub,
                {
                    config: {iceServers},
                    uuid: user.id,
                    wrap: (outgoingSignalingData) => {
                        outgoingSignalingData.fromUserId = user.id;
                        outgoingSignalingData.fromUsername = user.username;
                        return outgoingSignalingData;
                    },
                },
            );

            sw.on('peer', (peer, id) => {
                debug('Peer ', peer, id);

                peer.on('data', (payload) => {
                    cPeer = peer;

                    const data = JSON.parse(payload.toString());
                    debug('received data', {id, data});

                    if (data.type === 'receivedHandshake') {
                        getUserMedia((error, stream) => {
                            if (error) {
                                debug(error);
                                return;
                            }

                            gStream = stream;
                            if (stream) {
                                peer.addStream(stream);
                            }
                            dispatch({
                                type: ActionTypes.SELF_STREAM_SET,
                                data: stream,
                            });
                        });
                    }

                    if (data.type === 'sendHandshake') {
                        peer.send(JSON.stringify({type: 'receivedHandshake'}));
                    }

                    if (data.type === 'audioToggle') {
                        debug('audio toggle', data.enabled);

                        dispatch({
                            type: ActionTypes.PEER_AUDIO_TOGGLE,
                            data: data.enabled,
                        });
                    }

                    if (data.type === 'videoToggle') {
                        debug('video toggle', data.enabled);

                        dispatch({
                            type: ActionTypes.PEER_VIDEO_TOGGLE,
                            data: data.enabled,
                        });
                    }
                });
                debug('Sending Handshake');
                peer.send(JSON.stringify({
                    type: 'sendHandshake',
                    userId: user.id,
                }));

                peer.on('stream', (streamObj) => {
                    debug('Stream', peer, id);
                    dispatch({
                        type: ActionTypes.PEER_STREAM_RECEIVED,
                        data: streamObj,
                    });
                });
            });

            sw.on('disconnect', (peer, id) => {
                debug('disconnected from a peer:', peer, id);
                cPeer = null;
                dispatch({
                    type: ActionTypes.PEER_LOST,
                });
            });

            dispatch({
                type: ActionTypes.PEER_ACCEPTED,
            });

            clearOutgoingDeclineListener();

            debug(`accepted from ${peerId}`);
        });
    };
}

export function acceptCall() {
    return (dispatch, getState) => {
        stopIncomingRing();
        const user = getCurrentUser(getState());
        const config = getConfig(getState());
        const {callPeerId, peerAccepted} = getState()[`plugins-${pluginId}`];

        const accepthub = pluginSignalHub(`mattermost-webrtc-video-${config.DiagnosticId}`);
        accepthub.subscribe('all').on('data', ({...a}) => {
            debug('HUB DATA', a);
        });
        accepthub.broadcast(`accept-${user.id}`, callPeerId);
        debug('acceptCall', peerAccepted);
        const {stunServer, turnServer, turnServerUsername, turnServerCredential} = getState()[`plugins-${pluginId}`];

        const iceServers = buildIceServers(stunServer, turnServer, turnServerUsername, turnServerCredential);

        const callhub = pluginSignalHub(`mattermost-webrtc-video-${config.DiagnosticId}-call-${user.id}`);
        const sw = swarm(
            callhub,
            {
                config: {iceServers},
                uuid: user.id,
                wrap: (outgoingSignalingData) => {
                    outgoingSignalingData.fromUserId = user.id;
                    outgoingSignalingData.fromUsername = user.username;
                    return outgoingSignalingData;
                },
            },
        );

        sw.on('peer', (peer, id) => {
            debug('Peer', typeof peer.hasOwnProperty, id);

            peer.on('data', (payload) => {
                cPeer = peer;

                const data = JSON.parse(payload.toString());

                debug('received data', {id, data});

                if (data.type === 'receivedHandshake') {
                    getUserMedia((error, stream) => {
                        if (error) {
                            debug(error);
                            return;
                        }

                        gStream = stream;
                        if (stream) {
                            peer.addStream(stream);
                        }
                        dispatch({
                            type: ActionTypes.SELF_STREAM_SET,
                            data: stream,
                        });
                    });
                }

                if (data.type === 'sendHandshake') {
                    peer.send(JSON.stringify({type: 'receivedHandshake'}));
                }

                if (data.type === 'audioToggle') {
                    debug('audio toggle', data.enabled);

                    dispatch({
                        type: ActionTypes.PEER_AUDIO_TOGGLE,
                        data: data.enabled,
                    });
                }

                if (data.type === 'videoToggle') {
                    debug('video toggle', data.enabled);

                    dispatch({
                        type: ActionTypes.PEER_VIDEO_TOGGLE,
                        data: data.enabled,
                    });
                }
            });
            debug('Sending Handshake');
            peer.send(JSON.stringify({
                type: 'sendHandshake',
                userId: user.id,
            }));

            peer.on('stream', (streamObj) => {
                debug('Stream', peer, id);
                dispatch({
                    type: ActionTypes.PEER_STREAM_RECEIVED,
                    data: streamObj,
                });
            });
        });

        sw.on('disconnect', (peer, id) => {
            debug('disconnected from a peer:', peer, id);
            cPeer = null;
            dispatch({
                type: ActionTypes.PEER_LOST,
            });
        });

        dispatch({
            type: ActionTypes.ACCEPT_CALL,
        });
    };
}

export function rejectCall() {
    return (dispatch, getState) => {
        stopIncomingRing();
        const state = getState()[`plugins-${pluginId}`];
        const user = getCurrentUser(getState());

        if (state.callIncoming && state.callPeerId && user.id) {
            const config = getConfig(getState());
            const hub = pluginSignalHub(`mattermost-webrtc-video-${config.DiagnosticId}`);
            hub.broadcast(`decline-${state.callPeerId}`, {
                calleeId: user.id,
                callId: state.activeCallId,
            });

            (async () => {
                let channelId = getDirectChannelIdForPeer(getState(), user.id, state.callPeerId);
                if (!channelId) {
                    try {
                        channelId = await ensureDirectChannelId(user.id, state.callPeerId);
                    } catch (e) {
                        debug('rejectCall: could not resolve DM for declined-call notice', e);
                        return;
                    }
                }
                sendCallDeclinedEphemeral(channelId, state.callPeerId, user).catch(() => {
                    /* ignore ephemeral errors */
                });
            })();
        }

        clearOutgoingDeclineListener();
        dispatch({
            type: ActionTypes.REJECT_CALL,
        });
    };
}

export function endCall() {
    if (gStream) {
        gStream.getTracks().forEach((track) => track.stop());
    }

    stopIncomingRing();
    clearOutgoingDeclineListener();

    return {
        type: ActionTypes.END_CALL,
    };
}

function getUserMedia(cb) {
    navigator.mediaDevices.getUserMedia({video: true, audio: true}).then((stream) => {
        cb(null, stream);
    }).catch((e) => {
        debug(`Cannot initialize camera/microphone: ${e}`); //eslint-disable-line
        cb(e, null);
    });
}

export function audioToggle() {
    return (dispatch, getState) => {
        const {audioOn} = getState()[`plugins-${pluginId}`];

        if (!cPeer) {
            return;
        }
        if (gStream) {
            const t = gStream.getAudioTracks()[0];
            if (t) {
                t.enabled = !audioOn;
            }
        }

        if (cPeer) {
            cPeer.send(JSON.stringify({type: 'audioToggle', enabled: !audioOn}));
        }
        dispatch({type: ActionTypes.AUDIO_TOGGLE,
            data: !audioOn});
    };
}

export function videoToggle() {
    return (dispatch, getState) => {
        const {videoOn} = getState()[`plugins-${pluginId}`];

        if (!cPeer) {
            return;
        }
        if (gStream) {
            const t = gStream.getVideoTracks()[0];
            if (t) {
                t.enabled = !videoOn;
            }
        }

        if (cPeer) {
            cPeer.send(JSON.stringify({type: 'videoToggle', enabled: !videoOn}));
        }
        dispatch({type: ActionTypes.VIDEO_TOGGLE,
            data: !videoOn});
    };
}
