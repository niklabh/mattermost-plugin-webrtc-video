import General from 'mattermost-redux/constants/general';
import {getChannel, getDirectChannels} from 'mattermost-redux/selectors/entities/channels';
import {getUser} from 'mattermost-redux/selectors/entities/users';

import {getDirectMessagePeerUserId} from './dmPeer';

export function userDisplayName(user) {
    if (!user) {
        return '';
    }
    const full = `${user.first_name || ''} ${user.last_name || ''}`.trim();
    return full || user.username || user.id || '';
}

/**
 * One row per 1:1 DM peer (for video call picker).
 */
export function getDirectMessagePeersForPicker(state) {
    const channels = getDirectChannels(state).filter((ch) => ch.type === General.DM_CHANNEL);
    const rows = [];
    const seen = new Set();

    for (const ch of channels) {
        const peerId = getDirectMessagePeerUserId(state, ch);
        if (!peerId || seen.has(peerId)) {
            continue;
        }
        const user = getUser(state, peerId);
        if (!user || user.delete_at) {
            continue;
        }
        if (user.is_bot) {
            continue;
        }
        seen.add(peerId);
        rows.push({channelId: ch.id, peerId, user});
    }

    return rows;
}

export function getHintedPeerId(state, hintChannelId) {
    if (!hintChannelId) {
        return null;
    }
    const channel = getChannel(state, hintChannelId);
    if (!channel || channel.type !== General.DM_CHANNEL) {
        return null;
    }
    return getDirectMessagePeerUserId(state, channel);
}
