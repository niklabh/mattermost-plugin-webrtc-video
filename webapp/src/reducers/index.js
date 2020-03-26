import {combineReducers} from 'redux';

import ActionTypes from '../action_types';

const configLoaded = (state = false, action) => {
    switch (action.type) {
    case ActionTypes.LOAD_CONFIG:
        return true;
    default:
        return state;
    }
};

const signalhubURL = (state = '', action) => {
    switch (action.type) {
    case ActionTypes.LOAD_CONFIG:
        return action.data.SignalhubURL;
    default:
        return state;
    }
};

const modalVisible = (state = false, action) => {
    switch (action.type) {
    case ActionTypes.MAKE_VIDEO_CALL:
        return true;
    case ActionTypes.RECEIVE_VIDEO_CALL:
        return true;
    case ActionTypes.REJECT_CALL:
        return false;
    case ActionTypes.END_CALL:
        return false;
    default:
        return state;
    }
};

const callListening = (state = false, action) => {
    switch (action.type) {
    case ActionTypes.LISTEN_VIDEO_CALL:
        return true;
    default:
        return state;
    }
};

const callIncoming = (state = false, action) => {
    switch (action.type) {
    case ActionTypes.RECEIVE_VIDEO_CALL:
        return true;
    case ActionTypes.REJECT_CALL:
        return false;
    case ActionTypes.END_CALL:
        return false;
    default:
        return state;
    }
};

const callOutgoing = (state = false, action) => {
    switch (action.type) {
    case ActionTypes.MAKE_VIDEO_CALL:
        return true;
    case ActionTypes.REJECT_CALL:
        return false;
    case ActionTypes.END_CALL:
        return false;
    default:
        return state;
    }
};

const callAccepted = (state = false, action) => {
    switch (action.type) {
    case ActionTypes.MAKE_VIDEO_CALL:
        return true;
    case ActionTypes.ACCEPT_CALL:
        return true;
    case ActionTypes.REJECT_CALL:
        return false;
    case ActionTypes.END_CALL:
        return false;
    default:
        return state;
    }
};

const callPeerId = (state = '', action) => {
    switch (action.type) {
    case ActionTypes.MAKE_VIDEO_CALL:
        return action.data.peerId;
    case ActionTypes.RECEIVE_VIDEO_CALL:
        return action.data.peerId;
    case ActionTypes.REJECT_CALL:
        return '';
    case ActionTypes.END_CALL:
        return '';
    default:
        return state;
    }
};

const peerAccepted = (state = false, action) => {
    switch (action.type) {
    case ActionTypes.PEER_ACCEPTED:
        return true;
    case ActionTypes.MAKE_VIDEO_CALL:
        return false;
    case ActionTypes.REJECT_CALL:
        return false;
    case ActionTypes.END_CALL:
        return false;
    default:
        return state;
    }
};

export default combineReducers({
    configLoaded,
    signalhubURL,
    modalVisible,
    callListening,
    callIncoming,
    callOutgoing,
    callAccepted,
    peerAccepted,
    callPeerId,
});
