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
};
