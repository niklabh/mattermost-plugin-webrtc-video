import General from 'mattermost-redux/constants/general';
import {getDirectChannels} from 'mattermost-redux/selectors/entities/channels';

import {getDirectMessagePeerUserId} from './dmPeer';
import {mattermostApiRequest} from './mattermostApi';

/**
 * Find 1:1 DM channel id for current user and peer, if already in Redux.
 */
export function getDirectChannelIdForPeer(state, myUserId, peerUserId) {
    if (!myUserId || !peerUserId) {
        return null;
    }
    const channels = getDirectChannels(state);
    for (let i = 0; i < channels.length; i++) {
        const ch = channels[i];
        if (ch.type !== General.DM_CHANNEL) {
            continue;
        }
        const other = getDirectMessagePeerUserId(state, ch);
        if (other === peerUserId) {
            return ch.id;
        }
    }
    return null;
}

/**
 * Ensure a 1:1 DM exists; returns channel id (creates via API if missing).
 */
export async function ensureDirectChannelId(myUserId, peerUserId) {
    const res = await mattermostApiRequest({
        method: 'post',
        url: '/api/v4/channels/direct',
        data: [myUserId, peerUserId],
    });
    if (res.data && res.data.id) {
        return res.data.id;
    }
    throw new Error('direct channel create failed');
}
