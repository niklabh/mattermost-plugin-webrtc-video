/* eslint-disable no-magic-numbers */
/* eslint-disable max-nested-callbacks */
/* eslint-disable no-shadow */
/* eslint-disable no-unused-vars */
import axios from 'axios';
import signalhub from 'signalhub';
import wrtc from 'wrtc';
import Peer from 'simple-peer';
import swarm from 'webrtc-swarm';

import {getConfig} from 'mattermost-redux/selectors/entities/general';
import {getCurrentUser, getUser} from 'mattermost-redux/selectors/entities/users';

import {cpus} from 'os';

import {id as pluginId} from 'manifest';

import ActionTypes from '../action_types';

import {id} from '../manifest';
import debug from '../utils/debug';

let gStream;
let gPeer;
let currentStream;
let cPeer;
const DEFAULT_SIGNAL_HUB_URL = 'https://baatcheet.herokuapp.com';

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

        axios.get(`/plugins/${id}/v1/config`).then((response) => {
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

export function makeVideoCall(peerId) {
    return (dispatch, getState) => {
        const user = getCurrentUser(getState());
        const config = getConfig(getState());
        const {configLoaded, signalhubURL, callIncoming, callOutgoing} = getState()[`plugins-${pluginId}`];

        if (!configLoaded) {
            return;
        }

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

        const {stunServer, turnServer, turnServerUsername, turnServerCredential} = getState()[`plugins-${pluginId}`];

        const iceServers = [
            {url: 'stun:stun.l.google.com:19302'},
            {url: 'stun:stun1.l.google.com:19302'},
            {url: 'stun:stun2.l.google.com:19302'},
            {url: 'stun:stun3.l.google.com:19302'},
            {url: 'stun:stun4.l.google.com:19302'},
            {url: 'stun:stun01.sipphone.com'},
            {url: 'stun:stun.ekiga.net'},
            {url: 'stun:stun.fwdnet.net'},
            {url: 'stun:stun.ideasip.com'},
            {url: 'stun:stun.iptel.org'},
            {url: 'stun:stun.rixtelecom.se'},
            {url: 'stun:stun.schlund.de'},
            {url: 'stun:stunserver.org'},
            {url: 'stun:stun.softjoys.com'},
            {url: 'stun:stun.voiparound.com'},
            {url: 'stun:stun.voipbuster.com'},
            {url: 'stun:stun.voipstunt.com'},
            {url: 'stun:stun.voxgratia.org'},
            {url: 'stun:stun.xten.com'},
            {
                url: 'turn:numb.viagenie.ca',
                credential: 'muazkh',
                username: 'webrtc@live.com',
            },
            {
                url: 'turn:turn.bistri.com:80',
                credential: 'homeo',
                username: 'homeo',
            },
            {
                url: 'turn:turn.anyfirewall.com:443?transport=tcp',
                credential: 'webrtc',
                username: 'webrtc',
            },
        ];

        if (stunServer) {
            iceServers.push({
                url: stunServer,
            });
        }

        if (turnServer && turnServerUsername && turnServerCredential) {
            iceServers.push({
                url: turnServer,
                username: turnServerUsername,
                credential: turnServerCredential,
            });
        }
        const callhub = signalhub(`mattermost-webrtc-video-${config.DiagnosticId}-call-${peerId}`, signalhubURL || DEFAULT_SIGNAL_HUB_URL);

        debug(`calling ${peerId}`);
        callhub.broadcast(`call-${peerId}`, user.id);

        dispatch({
            type: ActionTypes.MAKE_VIDEO_CALL,
            data: {
                peerId,
            },
        });

        listenAccept(user.id, peerId)(dispatch, getState);
    };
}

export function receiveVideoCall(peerId) {
    return (dispatch, getState) => {
        const config = getConfig(getState());
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
            },
        });
    };
}

export function listenVideoCall() {
    return (dispatch, getState) => {
        const config = getConfig(getState());
        const {configLoaded, signalhubURL, callListening} = getState()[`plugins-${pluginId}`];

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

        const callhub = signalhub(`mattermost-webrtc-video-${config.DiagnosticId}-call-${user.id}`, signalhubURL || DEFAULT_SIGNAL_HUB_URL);

        debug(`listening for calls for ${user.id} on ${signalhubURL}`);
        callhub.subscribe(`call-${user.id}`).on('data', (peerId) => {
            debug(`call from ${peerId}`);
            receiveVideoCall(peerId)(dispatch, getState);
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
        const {configLoaded, signalhubURL, callPeerId} = getState()[`plugins-${pluginId}`];
        const {stunServer, turnServer, turnServerUsername, turnServerCredential} = getState()[`plugins-${pluginId}`];

        if (!configLoaded) {
            return;
        }

        const accepthub = signalhub(`mattermost-webrtc-video-${config.DiagnosticId}`, signalhubURL || DEFAULT_SIGNAL_HUB_URL);
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

            const {stunServer, turnServer, turnServerUsername, turnServerCredential} = getState()[`plugins-${pluginId}`];

            const iceServers = [
                {url: 'stun:stun.l.google.com:19302'},
                {url: 'stun:stun1.l.google.com:19302'},
                {url: 'stun:stun2.l.google.com:19302'},
                {url: 'stun:stun3.l.google.com:19302'},
                {url: 'stun:stun4.l.google.com:19302'},
                {url: 'stun:stun01.sipphone.com'},
                {url: 'stun:stun.ekiga.net'},
                {url: 'stun:stun.fwdnet.net'},
                {url: 'stun:stun.ideasip.com'},
                {url: 'stun:stun.iptel.org'},
                {url: 'stun:stun.rixtelecom.se'},
                {url: 'stun:stun.schlund.de'},
                {url: 'stun:stunserver.org'},
                {url: 'stun:stun.softjoys.com'},
                {url: 'stun:stun.voiparound.com'},
                {url: 'stun:stun.voipbuster.com'},
                {url: 'stun:stun.voipstunt.com'},
                {url: 'stun:stun.voxgratia.org'},
                {url: 'stun:stun.xten.com'},
                {
                    url: 'turn:numb.viagenie.ca',
                    credential: 'muazkh',
                    username: 'webrtc@live.com',
                },
                {
                    url: 'turn:turn.bistri.com:80',
                    credential: 'homeo',
                    username: 'homeo',
                },
                {
                    url: 'turn:turn.anyfirewall.com:443?transport=tcp',
                    credential: 'webrtc',
                    username: 'webrtc',
                },
            ];

            if (stunServer) {
                iceServers.push({
                    url: stunServer,
                });
            }

            if (turnServer && turnServerUsername && turnServerCredential) {
                iceServers.push({
                    url: turnServer,
                    username: turnServerUsername,
                    credential: turnServerCredential,
                });
            }

            const callhub = signalhub(`mattermost-webrtc-video-${config.DiagnosticId}-call-${callPeerId}`, signalhubURL || DEFAULT_SIGNAL_HUB_URL);
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
                    wrtc,
                }
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
                    currentStream = streamObj;
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

            debug(`accepted from ${peerId}`);
        });
    };
}

export function acceptCall() {
    return (dispatch, getState) => {
        const user = getCurrentUser(getState());
        const config = getConfig(getState());
        const {signalhubURL, callPeerId, peerAccepted} = getState()[`plugins-${pluginId}`];

        const accepthub = signalhub(`mattermost-webrtc-video-${config.DiagnosticId}`, signalhubURL || DEFAULT_SIGNAL_HUB_URL);
        accepthub.subscribe('all').on('data', ({...a}) => {
            debug('HUB DATA', a);
        });
        accepthub.broadcast(`accept-${user.id}`, callPeerId);
        debug('acceptCall', peerAccepted);
        const {stunServer, turnServer, turnServerUsername, turnServerCredential} = getState()[`plugins-${pluginId}`];

        const iceServers = [
            {url: 'stun:stun.l.google.com:19302'},
            {url: 'stun:stun1.l.google.com:19302'},
            {url: 'stun:stun2.l.google.com:19302'},
            {url: 'stun:stun3.l.google.com:19302'},
            {url: 'stun:stun4.l.google.com:19302'},
            {url: 'stun:stun01.sipphone.com'},
            {url: 'stun:stun.ekiga.net'},
            {url: 'stun:stun.fwdnet.net'},
            {url: 'stun:stun.ideasip.com'},
            {url: 'stun:stun.iptel.org'},
            {url: 'stun:stun.rixtelecom.se'},
            {url: 'stun:stun.schlund.de'},
            {url: 'stun:stunserver.org'},
            {url: 'stun:stun.softjoys.com'},
            {url: 'stun:stun.voiparound.com'},
            {url: 'stun:stun.voipbuster.com'},
            {url: 'stun:stun.voipstunt.com'},
            {url: 'stun:stun.voxgratia.org'},
            {url: 'stun:stun.xten.com'},
            {
                url: 'turn:numb.viagenie.ca',
                credential: 'muazkh',
                username: 'webrtc@live.com',
            },
            {
                url: 'turn:turn.bistri.com:80',
                credential: 'homeo',
                username: 'homeo',
            },
            {
                url: 'turn:turn.anyfirewall.com:443?transport=tcp',
                credential: 'webrtc',
                username: 'webrtc',
            },
        ];

        if (stunServer) {
            iceServers.push({
                url: stunServer,
            });
        }

        if (turnServer && turnServerUsername && turnServerCredential) {
            iceServers.push({
                url: turnServer,
                username: turnServerUsername,
                credential: turnServerCredential,
            });
        }

        const callhub = signalhub(`mattermost-webrtc-video-${config.DiagnosticId}-call-${user.id}`, signalhubURL || DEFAULT_SIGNAL_HUB_URL);
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
                wrtc,
            }
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
                currentStream = streamObj;

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
    return {
        type: ActionTypes.REJECT_CALL,
    };
}

export function endCall() {
    if (gStream) {
        gStream.getTracks().forEach((track) => track.stop());
    }

    if (gPeer) {
        gPeer.destroy();
    }
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
            gStream.getAudioTracks()[0].enabled = !audioOn;
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
            gStream.getVideoTracks()[0].enabled = !videoOn;
        }

        if (cPeer) {
            cPeer.send(JSON.stringify({type: 'videoToggle', enabled: !videoOn}));
        }
        dispatch({type: ActionTypes.VIDEO_TOGGLE,
            data: !videoOn});
    };
}
