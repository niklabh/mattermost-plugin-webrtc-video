import ActionTypes from '../action_types';
import {getPluginConfig as fetchPluginConfig} from '../client';
import debug from '../utils/debug';

const CONFIG_REFRESH_MS = 30 * 60 * 1000;

export function openPicker(hintChannelId = null) {
    return {type: ActionTypes.OPEN_PICKER, data: {hintChannelId}};
}

export function closePicker() {
    return {type: ActionTypes.CLOSE_PICKER};
}

/**
 * Loads ICE server configuration. Re-run periodically so time-limited TURN
 * credentials (TURN shared secret mode) never expire mid-session.
 */
export function loadConfig() {
    return async (dispatch) => {
        try {
            const data = await fetchPluginConfig();
            dispatch({type: ActionTypes.CONFIG_LOADED, data: data || {}});
            return true;
        } catch (e) {
            debug('could not load plugin config', e);
            return false;
        }
    };
}

export function startConfigRefresh() {
    return (dispatch) => {
        const timer = setInterval(() => dispatch(loadConfig()), CONFIG_REFRESH_MS);
        return () => clearInterval(timer);
    };
}
