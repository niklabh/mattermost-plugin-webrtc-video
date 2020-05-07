import {id as pluginId} from '../manifest';

export default {
    LOAD_CONFIG: pluginId + '_load_config',
    MAKE_VIDEO_CALL: pluginId + '_make_video_call',
    RECEIVE_VIDEO_CALL: pluginId + '_receive_video_call',
    LISTEN_VIDEO_CALL: pluginId + '_listen_video_call',
    PEER_ACCEPTED: pluginId + '_peer_accept',
    ACCEPT_CALL: pluginId + '_accept_call',
    REJECT_CALL: pluginId + '_reject_call',
    END_CALL: pluginId + '_end_call',
    PEER_STREAM_RECEIVED: pluginId + '_peer_stream_received',
    PEER_STREAM_LOST: pluginId + '_peer_stream_lost',
    PEER_AUDIO_TOGGLE: pluginId + '_peer_audio_toggle',
    PEER_VIDEO_TOGGLE: pluginId + '_peer_video_toggle',
    PEER_RECEIVED: pluginId + '_peer_received',
    PEER_LOST: pluginId + '_peer_lost',
    SELF_STREAM_SET: pluginId + '_self_stream_set_',
    SELF_STREAM_UNSET: pluginId + '_self_stream_unset_',
    AUDIO_TOGGLE: pluginId + '_audio_toggle',
    VIDEO_TOGGLE: pluginId + '_video_toggle',
};
