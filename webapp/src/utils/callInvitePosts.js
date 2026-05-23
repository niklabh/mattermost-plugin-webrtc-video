import {WEBRTC_INVITE_POST_TYPE, WEBRTC_INVITE_PROPS_KEY} from '../constants/callInvite';

import {mattermostApiRequest} from './mattermostApi';

function peerDisplay(peer) {
    if (!peer) {
        return 'Someone';
    }
    const n = `${peer.first_name || ''} ${peer.last_name || ''}`.trim();
    return n || peer.username || 'Someone';
}

export function newCallId() {
    return `wrtc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Post a visible DM message documenting the incoming call (accept/decline in the modal only).
 */
export async function createVideoInvitePost(channelId, callerUser, calleeId, callId) {
    const label = peerDisplay(callerUser);
    const at = callerUser.username ? `@${callerUser.username}` : label;
    const message = `**Incoming video call** — ${at} is calling you. Use the call window to accept or decline.`;

    await mattermostApiRequest({
        method: 'post',
        url: '/api/v4/posts',
        data: {
            channel_id: channelId,
            message,
            type: WEBRTC_INVITE_POST_TYPE,
            props: {
                [WEBRTC_INVITE_PROPS_KEY]: {
                    call_id: callId,
                    caller_id: callerUser.id,
                    callee_id: calleeId,
                    status: 'ringing',
                    created_at: Date.now(),
                },
            },
        },
    });
}

/**
 * Ephemeral notice visible only to the caller when the callee declines.
 */
export async function sendCallDeclinedEphemeral(channelId, callerUserId, calleeUser) {
    const label = peerDisplay(calleeUser);
    const at = calleeUser.username ? `@${calleeUser.username}` : label;
    const message = `**Video call declined** — ${at} declined the call.`;

    await mattermostApiRequest({
        method: 'post',
        url: '/api/v4/posts/ephemeral',
        data: {
            user_id: callerUserId,
            post: {
                channel_id: channelId,
                message,
            },
        },
    });
}
