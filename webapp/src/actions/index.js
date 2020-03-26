import axios from 'axios';
import signalhub from 'signalhub';
import wrtc from 'wrtc';
import Peer from 'simple-peer';

import {getConfig} from 'mattermost-redux/selectors/entities/general';
import {getCurrentUser} from 'mattermost-redux/selectors/entities/users';

import {config} from '../constants';
import {id as pluginId} from 'manifest';

import ActionTypes from '../action_types';

import {id} from '../manifest';

let gStream;
let gPeer;

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
        const config2 = getConfig(getState());
        const {configLoaded, signalhubURL, callIncoming, callOutgoing} = getState()[`plugins-${pluginId}`];

        if (!configLoaded) {
            return;
        }

        if (!signalhubURL) {
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

        const callhub = signalhub(`mattermost-webrtc-video-${config2.DiagnosticId}`, signalhubURL);

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
        const config2 = getConfig(getState());
        const {signalhubURL, configLoaded, callListening} = getState()[`plugins-${pluginId}`];

        if (!configLoaded) {
            return;
        }

        if (!signalhubURL) {
            return;
        }

        if (callListening) {
            return;
        }

        const user = getCurrentUser(getState());

        if (!user) {
            return;
        }

        const callhub = signalhub(`mattermost-webrtc-video-${config2.DiagnosticId}`, signalhubURL);

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
        const config2 = getConfig(getState());
        const {configLoaded, signalhubURL} = getState()[`plugins-${pluginId}`];

        if (!configLoaded) {
            return;
        }

        if (!signalhubURL) {
            return;
        }

        const accepthub = signalhub(`mattermost-webrtc-video-${config2.DiagnosticId}`, signalhubURL);

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
        const config2 = getConfig(getState());
        const {configLoaded, signalhubURL, callPeerId} = getState()[`plugins-${pluginId}`];

        if (!configLoaded) {
            return;
        }

        if (!signalhubURL) {
            return;
        }

        const accepthub = signalhub(`mattermost-webrtc-video-${config2.DiagnosticId}`, signalhubURL);

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
    navigator.getUserMedia({video: true, audio: true}, (stream) => {
        cb(null, stream);
    }, cb);
}

function createPeer(stream, initiator, userId, peerId) {
    return (dispatch, getState) => {
        const peer = new Peer({initiator, wrtc, config, stream});
        const config2 = getConfig(getState());
        const {configLoaded, signalhubURL} = getState()[`plugins-${pluginId}`];

        if (!configLoaded) {
            return;
        }

        if (!signalhubURL) {
            return;
        }

        const hub = signalhub(`mattermost-webrtc-video-${config2.DiagnosticId}`, signalhubURL);

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
