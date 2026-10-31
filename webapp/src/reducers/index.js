import {combineReducers} from 'redux';

import ActionTypes from '../action_types';

const initialConfig = {
    loaded: false,
    STUNServer: '',
    TURNServer: '',
    TURNServerUsername: '',
    TURNServerCredential: '',
};

function config(state = initialConfig, action) {
    if (action.type === ActionTypes.CONFIG_LOADED) {
        return {...initialConfig, ...action.data, loaded: true};
    }
    return state;
}

function picker(state = {open: false, hintChannelId: null}, action) {
    switch (action.type) {
    case ActionTypes.OPEN_PICKER:
        return {open: true, hintChannelId: action.data.hintChannelId || null};
    case ActionTypes.CLOSE_PICKER:
        return {open: false, hintChannelId: null};
    default:
        return state;
    }
}

/**
 * The active 1:1 call, or null.
 *
 * status: 'ringing' | 'connecting' | 'active' | 'reconnecting' | 'ended'
 * direction: 'outgoing' | 'incoming'
 * endReason (when ended): 'declined' | 'no_answer' | 'busy' | 'cancelled' |
 *   'hangup' | 'connection_lost' | 'error'
 */
export const newCall = (data) => ({
    callId: data.callId,
    peerId: data.peerId,
    direction: data.direction,
    status: data.status,
    endReason: null,
    error: null,
    startedAt: null,
    endedAt: null,
    localStream: null,
    remoteStream: null,
    audioOn: true,
    videoOn: true,
    hasVideo: true,
    screenSharing: false,
    peerAudioOn: true,
    peerVideoOn: true,
    peerScreenSharing: false,
    peerWantsVideo: data.peerWantsVideo !== false,
    postId: null,
    channelId: null,
});

function call(state = null, action) {
    switch (action.type) {
    case ActionTypes.CALL_STARTED:
        return newCall(action.data);
    case ActionTypes.CALL_UPDATED:
        if (!state || (action.data.callId && action.data.callId !== state.callId)) {
            return state;
        }
        return {...state, ...action.data};
    case ActionTypes.CALL_ENDED:
        if (!state || state.callId !== action.data.callId) {
            return state;
        }
        return {
            ...state,
            status: 'ended',
            endReason: action.data.reason,
            error: action.data.error || null,
            endedAt: Date.now(),
            localStream: null,
            remoteStream: null,
            screenSharing: false,
        };
    case ActionTypes.CALL_DISMISSED:
        if (!state || (action.data && action.data.callId && action.data.callId !== state.callId)) {
            return state;
        }
        return null;
    default:
        return state;
    }
}

function voiceRooms(state = null, action) {
    if (action.type === ActionTypes.VOICE_ROOMS_RECEIVED) {
        return Array.isArray(action.data) ? action.data : [];
    }
    return state;
}

export default combineReducers({
    config,
    picker,
    call,
    voiceRooms,
});
