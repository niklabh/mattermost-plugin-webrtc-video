import React from 'react';
import PropTypes from 'prop-types';
import {useDispatch, useSelector} from 'react-redux';

import {getCurrentUserId} from 'mattermost-redux/selectors/entities/users';

import {startCall} from '../call/controller';
import {formatDuration, parseInvite} from '../call/invitePost';
import {getCall, isInCall} from '../selectors';
import {displayNameForId} from '../utils/users';

import Icon from './icons';

const STALE_RINGING_MS = 2 * 60 * 1000;

function describe(inv, me, peerName, liveRinging) {
    const isCaller = inv.caller_id === me;
    const kind = inv.video === false ? 'voice call' : 'video call';
    const Kind = kind[0].toUpperCase() + kind.slice(1);

    switch (inv.status) {
    case 'ended':
        return {title: Kind, sub: `Lasted ${formatDuration(inv.duration_ms)}`, tone: ''};
    case 'declined':
        return {title: isCaller ? `${peerName} declined your ${kind}` : `You declined a ${kind}`, sub: '', tone: 'missed'};
    case 'missed':
        return {title: isCaller ? `${peerName} didn’t answer` : `Missed ${kind}`, sub: isCaller ? '' : `from ${peerName}`, tone: 'missed'};
    default:
        if (liveRinging) {
            return {title: isCaller ? `Calling ${peerName}…` : `${peerName} is calling you…`, sub: '', tone: 'ringing'};
        }
        return {title: isCaller ? `You called ${peerName}` : `${peerName} called you`, sub: '', tone: ''};
    }
}

export default function InvitePost({post}) {
    const dispatch = useDispatch();
    const inv = parseInvite(post);
    const me = useSelector(getCurrentUserId);
    const peerId = inv && (inv.caller_id === me ? inv.callee_id : inv.caller_id);
    const peerName = useSelector((state) => (peerId ? displayNameForId(state, peerId) : ''));
    const busy = useSelector(isInCall);
    const call = useSelector(getCall);

    if (!inv) {
        return null;
    }

    const participant = inv.caller_id === me || inv.callee_id === me;
    const liveRinging = inv.status === 'ringing' &&
        ((call && call.callId === inv.call_id && call.status !== 'ended') || Date.now() - (inv.created_at || post.create_at) < STALE_RINGING_MS);
    const {title, sub, tone} = describe(inv, me, peerName, liveRinging);
    const iconClass = ['wrtc-post__icon', tone && `wrtc-post__icon--${tone}`].filter(Boolean).join(' ');

    return (
        <div className='wrtc-post'>
            <span className={iconClass}>
                <Icon name={inv.video === false ? 'phone' : 'video'}/>
            </span>
            <div className='wrtc-post__text'>
                <div className='wrtc-post__title'>{title}</div>
                {sub && <div className='wrtc-post__sub'>{sub}</div>}
            </div>
            {participant && peerId && !liveRinging && (
                <button
                    type='button'
                    className='wrtc-btn wrtc-btn--tertiary'
                    disabled={busy}
                    onClick={() => dispatch(startCall(peerId))}
                >
                    <Icon
                        name='video'
                        size={16}
                    />
                    {inv.caller_id === me ? 'Call again' : 'Call back'}
                </button>
            )}
        </div>
    );
}

InvitePost.propTypes = {
    post: PropTypes.object.isRequired,
};
