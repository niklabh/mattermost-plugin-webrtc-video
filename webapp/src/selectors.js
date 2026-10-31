import {id as pluginId} from './manifest';

const slice = (state) => state[`plugins-${pluginId}`] || {};

export const getPluginConfig = (state) => slice(state).config || {};
export const isConfigLoaded = (state) => Boolean(getPluginConfig(state).loaded);
export const getPicker = (state) => slice(state).picker || {open: false};
export const getCall = (state) => slice(state).call || null;
export const getVoiceRooms = (state) => slice(state).voiceRooms;

/** True while a call is ringing, connecting or in progress (not merely showing "ended"). */
export const isInCall = (state) => {
    const call = getCall(state);
    return Boolean(call && call.status !== 'ended');
};
