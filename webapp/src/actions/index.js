import axios from 'axios';
import signalhub from 'signalhub';
import wrtc from 'wrtc';
import Peer from 'simple-peer';

import {getConfig} from 'mattermost-redux/selectors/entities/general';
import {getCurrentUser} from 'mattermost-redux/selectors/entities/users';

import {id as pluginId} from 'manifest';

import ActionTypes from '../action_types';

import {id} from '../manifest';

let gStream;
let gPeer;

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

        console.log('load config'); // eslint-disable-line

        axios.get(`/plugins/${id}/v1/config`).then((response) => {
            if (response.status === 200) {
                console.log('loaded config'); // eslint-disable-line
                dispatch({
                    type: ActionTypes.LOAD_CONFIG,
                    data: response.data,
                });
                listenVideoCall()(dispatch, getState);
            } else {
                console.log(`Cannot fetch plugin configuration, server returned code ${response.status}`); // eslint-disable-line
            }
        }).catch((e) => {
            console.log(`Cannot fetch plugin configuration: ${e}`); // eslint-disable-line
        });
    };
}

export function makeVideoCall(peerId) {
    return (dispatch, getState) => {
        const user = getCurrentUser(getState());
        const config = getConfig(getState());
        const {signalhubURL, callIncoming, callOutgoing} = getState()[`plugins-${pluginId}`];

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

        const callhub = signalhub(`mattermost-webrtc-video-${config.DiagnosticId}`, signalhubURL || DEFAULT_SIGNAL_HUB_URL);

        console.log(`calling ${peerId}`) // eslint-disable-line
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
        const {signalhubURL, callListening} = getState()[`plugins-${pluginId}`];

        if (callListening) {
            return;
        }

        const user = getCurrentUser(getState());

        if (!user) {
            return;
        }

        const callhub = signalhub(`mattermost-webrtc-video-${config.DiagnosticId}`, signalhubURL || DEFAULT_SIGNAL_HUB_URL);

        console.log(`listening for calls for ${user.id} on ${signalhubURL}`) // eslint-disable-line
        callhub.subscribe(`call-${user.id}`).on('data', (peerId) => {
            console.log(`call from ${peerId}`); // eslint-disable-line
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
        const {signalhubURL} = getState()[`plugins-${pluginId}`];

        const accepthub = signalhub(`mattermost-webrtc-video-${config.DiagnosticId}`, signalhubURL || DEFAULT_SIGNAL_HUB_URL);

        accepthub.subscribe(`accept-${peerId}`).on('data', (acceptedUserId) => {
            const {peerAccepted} = getState()[`plugins-${pluginId}`];

            if (acceptedUserId !== userId) {
                return;
            }

            if (peerAccepted) {
                return;
            }

            dispatch({
                type: ActionTypes.PEER_ACCEPTED,
            });

            console.log(`accepted from ${peerId}`); // eslint-disable-line
            getUserMedia((error, stream) => {
                if (error) {
                    console.error(error); // eslint-disable-line
                    return;
                }

                gStream = stream;

                createPeer(stream, true, userId, peerId)(dispatch, getState);
            });
        });
    };
}

export function acceptCall() {
    return (dispatch, getState) => {
        const user = getCurrentUser(getState());
        const config = getConfig(getState());
        const {signalhubURL, callPeerId} = getState()[`plugins-${pluginId}`];

        const accepthub = signalhub(`mattermost-webrtc-video-${config.DiagnosticId}`, signalhubURL || DEFAULT_SIGNAL_HUB_URL);

        getUserMedia((error, stream) => {
            if (error) {
                console.error(error); // eslint-disable-line
                return;
            }

            gStream = stream;

            createPeer(stream, false, user.id, callPeerId)(dispatch, getState);
            accepthub.broadcast(`accept-${user.id}`, callPeerId);
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
        console.log(`Cannot initialize camera/microphone: ${e}`); //eslint-disable-line
        cb(e, null);
    });
}

function createPeer(stream, initiator, userId, peerId) {
    return (dispatch, getState) => {
        const config = getConfig(getState());
        const {signalhubURL, stunServer, turnServer, turnServerUsername, turnServerCredential} = getState()[`plugins-${pluginId}`];

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

        const hub = signalhub(`mattermost-webrtc-video-${config.DiagnosticId}`, signalhubURL || DEFAULT_SIGNAL_HUB_URL);

        const peer = new Peer({initiator, wrtc, iceServers, stream});
        gPeer = peer;

        hub.subscribe(userId).on('data', (signal) => {
            console.log('received signal', signal) // eslint-disable-line
            peer.signal(signal);
        });

        peer.on('signal', (signal) => {
            console.log(`signalling ${peerId}`); // eslint-disable-line
            hub.broadcast(peerId, signal);
        });

        peer.on('error', (error) => {
            console.error(error); // eslint-disable-line
            dispatch(endCall());
        });

        peer.on('connect', () => {
            console.log(`connected with ${peerId}`); // eslint-disable-line
            if (initiator) {
                peer.send(`Connected with ${userId}`);
            }
        });

        peer.on('close', () => {
            dispatch(endCall());
        });

        peer.on('data', (data) => {
            console.log(`message from ${peerId}`, data.toString()); // eslint-disable-line
        });

        peer.on('stream', (streamObj) => {
            const video = document.querySelector('#video-player');
            video.srcObject = streamObj;
            video.play();
        });
    };
}
