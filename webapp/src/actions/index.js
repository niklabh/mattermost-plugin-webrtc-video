import signalhub from 'signalhub';
import wrtc from 'wrtc';
import Peer from 'simple-peer';

import {getCurrentUser} from 'mattermost-redux/selectors/entities/users';

import {config} from '../constants';
import {id as pluginId} from 'manifest';

import ActionTypes from '../action_types';

const callhub = signalhub('baatcheet_video', 'https://baatcheet.herokuapp.com');
const accepthub = signalhub('baatcheet_video', 'https://baatcheet.herokuapp.com');
const hub = signalhub('baatcheet_video', 'https://baatcheet.herokuapp.com');

let gStream;
let gPeer;

export function makeVideoCall(peerId) {
    return (dispatch, getState) => {
        const userId = getCurrentUser(getState()).id;
        const {callIncoming, callOutgoing} = getState()[`plugins-${pluginId}`];

        if (!peerId) {
            return;
        }

        if (!userId) {
            return;
        }

        if (callIncoming) {
            return;
        }

        if (callOutgoing) {
            return;
        }

        console.log(`calling ${peerId}`) // eslint-disable-line
        callhub.broadcast(`call-${peerId}`, userId);

        dispatch({
            type: ActionTypes.MAKE_VIDEO_CALL,
            data: {
                peerId,
            },
        });

        listenAccpet(userId, peerId)(dispatch, getState);
    };
}

export function receiveVideoCall(peerId) {
    return (dispatch, getState) => {
        const userId = getCurrentUser(getState()).id;
        const {callIncoming, callOutgoing} = getState()[`plugins-${pluginId}`];

        if (!peerId) {
            return;
        }

        if (!userId) {
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
        const state = getState()[`plugins-${pluginId}`];

        if (state.callListening) {
            return;
        }

        const user = getCurrentUser(getState());

        if (!user) {
            return;
        }

        const userId = user.id;
        console.log(`listening for calls for ${userId}`) // eslint-disable-line
        callhub.subscribe(`call-${userId}`).on('data', (peerId) => {
            console.log(`call from ${peerId}`); // eslint-disable-line
            receiveVideoCall(peerId)(dispatch, getState);
        });

        dispatch({
            type: ActionTypes.LISTEN_VIDEO_CALL,
        });
    };
}

function listenAccpet(userId, peerId) {
    return (dispatch, getState) => {
        accepthub.subscribe(`accept-${peerId}`).on('data', (acceptedUserId) => {
            const state = getState()[`plugins-${pluginId}`];

            if (acceptedUserId !== userId) {
                return;
            }

            if (state.peerAccepted) {
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
        const userId = getCurrentUser(getState()).id;
        const {callPeerId} = getState()[`plugins-${pluginId}`];

        getUserMedia((error, stream) => {
            if (error) {
                console.error(error); // eslint-disable-line
                return;
            }

            gStream = stream;

            createPeer(stream, false, userId, callPeerId)(dispatch, getState);
            accepthub.broadcast(`accept-${userId}`, callPeerId);
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
    return (dispatch) => {
        const peer = new Peer({initiator, wrtc, config, stream});

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
