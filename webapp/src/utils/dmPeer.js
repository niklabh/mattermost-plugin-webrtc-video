import General from 'mattermost-redux/constants/general';
import {getCurrentUser} from 'mattermost-redux/selectors/entities/users';

/**
 * Other user's id in a 1:1 direct message channel.
 * Mattermost desktop/web often omits `channel.teammate_id`; DM `channel.name` is two ids sorted, joined by "__".
 */
export function getDirectMessagePeerUserId(state, channel) {
    if (!channel) {
        return null;
    }
    if (channel.teammate_id) {
        return channel.teammate_id;
    }
    if (channel.type !== General.DM_CHANNEL) {
        return null;
    }
    const me = getCurrentUser(state);
    if (!me || !channel.name) {
        return null;
    }
    const ids = channel.name.split('__');
    if (ids.length !== 2) {
        return null;
    }
    const [a, b] = ids;
    if (a === me.id) {
        return b;
    }
    if (b === me.id) {
        return a;
    }
    return null;
}
