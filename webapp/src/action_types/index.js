import {id as pluginId} from '../manifest';

const t = (name) => `${pluginId}_${name}`;

export default {
    CONFIG_LOADED: t('config_loaded'),

    OPEN_PICKER: t('open_picker'),
    CLOSE_PICKER: t('close_picker'),

    CALL_STARTED: t('call_started'),
    CALL_UPDATED: t('call_updated'),
    CALL_ENDED: t('call_ended'),
    CALL_DISMISSED: t('call_dismissed'),

    VOICE_ROOMS_RECEIVED: t('voice_rooms_received'),
};
