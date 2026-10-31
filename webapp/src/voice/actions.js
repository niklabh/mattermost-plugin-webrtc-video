import ActionTypes from '../action_types';
import {createVoiceRoom, deleteVoiceRoom, listVoiceRooms} from '../client';
import debug from '../utils/debug';

export function loadVoiceRooms() {
    return async (dispatch) => {
        try {
            const rooms = await listVoiceRooms();
            dispatch({type: ActionTypes.VOICE_ROOMS_RECEIVED, data: rooms || []});
        } catch (e) {
            debug('could not load voice channels', e);
        }
    };
}

/** WebSocket handler for "custom_<plugin id>_voice_rooms_updated". */
export function voiceRoomsUpdated(msg) {
    let rooms = msg && msg.data && msg.data.rooms;
    if (typeof rooms === 'string') {
        try {
            rooms = JSON.parse(rooms);
        } catch (e) {
            rooms = null;
        }
    }
    return {type: ActionTypes.VOICE_ROOMS_RECEIVED, data: Array.isArray(rooms) ? rooms : []};
}

export function addVoiceRoom(name) {
    return async (dispatch) => {
        const room = await createVoiceRoom(name);
        dispatch(loadVoiceRooms());
        return room;
    };
}

export function removeVoiceRoom(roomId) {
    return async (dispatch) => {
        await deleteVoiceRoom(roomId);
        dispatch(loadVoiceRooms());
    };
}
