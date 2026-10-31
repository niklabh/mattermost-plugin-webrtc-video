import {createPost, patchPost} from '../client';
import {WEBRTC_INVITE_POST_TYPE, WEBRTC_INVITE_PROPS_KEY} from '../constants/callInvite';

/** Final statuses stored on the post. */
const POST_STATUS = {
    ringing: 'ringing',
    ended: 'ended',
    declined: 'declined',
    missed: 'missed',
    no_answer: 'missed',
    busy: 'missed',
    cancelled: 'missed',
    connection_lost: 'missed',
    error: 'missed',
};

export function formatDuration(ms) {
    const total = Math.max(0, Math.round((ms || 0) / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function messageFor(invite, callerUsername) {
    const kind = invite.video === false ? 'voice call' : 'video call';
    switch (invite.status) {
    case 'ended':
        return `${kind[0].toUpperCase()}${kind.slice(1)} ended · ${formatDuration(invite.duration_ms)}`;
    case 'declined':
        return `Declined ${kind}`;
    case 'missed':
        return `Missed ${kind} from @${callerUsername}`;
    default:
        return `@${callerUsername} started a ${kind}`;
    }
}

export async function createInvitePost({channelId, caller, calleeId, callId, video}) {
    const invite = {
        call_id: callId,
        caller_id: caller.id,
        caller_username: caller.username,
        callee_id: calleeId,
        status: 'ringing',
        video: video !== false,
        created_at: Date.now(),
    };
    const post = await createPost({
        channel_id: channelId,
        type: WEBRTC_INVITE_POST_TYPE,
        message: messageFor(invite, caller.username),
        props: {[WEBRTC_INVITE_PROPS_KEY]: invite},
    });
    return {post, invite};
}

export async function updateInvitePost(postId, invite, {status, durationMs = 0}) {
    const next = {
        ...invite,
        status: POST_STATUS[status] || 'missed',
        duration_ms: durationMs,
        ended_at: Date.now(),
    };
    return patchPost(postId, {
        message: messageFor(next, invite.caller_username),
        props: {[WEBRTC_INVITE_PROPS_KEY]: next},
    });
}

export function parseInvite(post) {
    if (!post || !post.props) {
        return null;
    }
    let inv = post.props[WEBRTC_INVITE_PROPS_KEY];
    if (typeof inv === 'string') {
        try {
            inv = JSON.parse(inv);
        } catch (e) {
            return null;
        }
    }
    return inv && typeof inv === 'object' && inv.caller_id && inv.callee_id ? inv : null;
}
