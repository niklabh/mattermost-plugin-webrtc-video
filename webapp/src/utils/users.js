import {getCurrentUserId, getUser, getStatusForUserId} from 'mattermost-redux/selectors/entities/users';
import {getTeammateNameDisplaySetting} from 'mattermost-redux/selectors/entities/preferences';
import {displayUsername} from 'mattermost-redux/utils/user_utils';
import {UserTypes} from 'mattermost-redux/action_types';

import {getUsersByIds} from '../client';

const DM_CHANNEL = 'D';

/** Display name honouring the viewer's "Teammate name display" preference. */
export function userDisplayName(state, user) {
    if (!user) {
        return 'Someone';
    }
    let setting;
    try {
        setting = getTeammateNameDisplaySetting(state);
    } catch (e) {
        setting = undefined;
    }
    try {
        return displayUsername(user, setting) || user.username || 'Someone';
    } catch (e) {
        const full = `${user.first_name || ''} ${user.last_name || ''}`.trim();
        return user.nickname || full || user.username || 'Someone';
    }
}

export function displayNameForId(state, userId) {
    return userDisplayName(state, getUser(state, userId));
}

export function userStatus(state, userId) {
    try {
        return getStatusForUserId(state, userId) || 'offline';
    } catch (e) {
        return 'offline';
    }
}

export function initials(name) {
    return String(name || '?').split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';
}

/** The other participant of a 1:1 DM channel (DM names are "<idA>__<idB>"). */
export function dmPeerId(channel, myUserId) {
    if (!channel || channel.type !== DM_CHANNEL) {
        return null;
    }
    if (channel.teammate_id) {
        return channel.teammate_id;
    }
    const ids = String(channel.name || '').split('__');
    if (ids.length !== 2) {
        return null;
    }
    if (ids[0] === myUserId) {
        return ids[1];
    }
    return ids[1] === myUserId ? ids[0] : null;
}

function allChannels(state) {
    const channels = state.entities && state.entities.channels && state.entities.channels.channels;
    return channels ? Object.values(channels) : [];
}

export function findDirectChannelId(state, peerId) {
    const me = getCurrentUserId(state);
    const ch = allChannels(state).find((c) => c.type === DM_CHANNEL && dmPeerId(c, me) === peerId);
    return ch ? ch.id : null;
}

/** DM peers (excluding bots, deactivated users and yourself), most recent first. */
export function recentDirectMessagePeers(state) {
    const me = getCurrentUserId(state);
    const seen = new Set();
    return allChannels(state).
        filter((c) => c.type === DM_CHANNEL).
        sort((a, b) => (b.last_post_at || 0) - (a.last_post_at || 0)).
        map((c) => dmPeerId(c, me)).
        filter((id) => {
            if (!id || id === me || seen.has(id)) {
                return false;
            }
            seen.add(id);
            const user = getUser(state, id);
            return user && !user.delete_at && !user.is_bot;
        }).
        map((id) => getUser(state, id));
}

/** Makes sure profiles are in the Redux store so names/avatars can render. */
export function ensureProfiles(userIds) {
    return async (dispatch, getState) => {
        const state = getState();
        const missing = [...new Set(userIds)].filter((id) => id && !getUser(state, id));
        if (!missing.length) {
            return;
        }
        try {
            const users = await getUsersByIds(missing);
            if (users.length) {
                dispatch({type: UserTypes.RECEIVED_PROFILES_LIST, data: users});
            }
        } catch (e) {
            // names fall back to "Someone"
        }
    };
}

export function receivedProfiles(users) {
    return {type: UserTypes.RECEIVED_PROFILES_LIST, data: users};
}
