import React, {useCallback, useEffect, useRef, useState} from 'react';
import PropTypes from 'prop-types';
import {useDispatch, useSelector} from 'react-redux';

import {getUser} from 'mattermost-redux/selectors/entities/users';

import {
    acceptCall,
    declineCall,
    dismissCall,
    hangUp,
    startCall,
    toggleAudio,
    toggleScreenShare,
    toggleVideo,
} from '../../call/controller';
import {formatDuration} from '../../call/invitePost';
import {canShareScreen} from '../../call/media';
import {getCall} from '../../selectors';
import {userDisplayName} from '../../utils/users';
import Avatar from '../avatar';
import Icon from '../icons';

import StreamVideo from './stream_video';

const END_MESSAGES = {
    declined: (name) => ['Call declined', `${name} declined the call.`],
    no_answer: (name) => ['No answer', `${name} didn't pick up.`],
    busy: (name) => [`${name} is busy`, 'They are on another call. Try again later.'],
    cancelled: () => ['Call ended', ''],
    hangup: () => ['Call ended', ''],
    connection_lost: () => ['Connection lost', 'The connection dropped and could not be restored. Check your network, or ask your admin to configure a TURN server.'],
    error: () => ['Couldn’t start the call', ''],
};

const RETRYABLE = new Set(['declined', 'no_answer', 'busy', 'connection_lost', 'error']);

function useNow(enabled) {
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        if (!enabled) {
            return undefined;
        }
        const t = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(t);
    }, [enabled]);
    return now;
}

function hasLiveVideo(stream) {
    return Boolean(stream && stream.getVideoTracks().some((t) => t.readyState === 'live'));
}

function Control({icon, label, onClick, variant, disabled}) {
    return (
        <button
            type='button'
            className={variant ? `wrtc-ctl wrtc-ctl--${variant}` : 'wrtc-ctl'}
            onClick={onClick}
            disabled={disabled}
            title={label}
            aria-label={label}
        >
            <Icon
                name={icon}
                size={22}
            />
        </button>
    );
}

Control.propTypes = {
    icon: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    onClick: PropTypes.func.isRequired,
    variant: PropTypes.string,
    disabled: PropTypes.bool,
};

function cameraLabel(call) {
    if (!call.hasVideo) {
        return 'No camera available';
    }
    return call.videoOn ? 'Turn camera off' : 'Turn camera on';
}

export default function CallWindow() {
    const dispatch = useDispatch();
    const call = useSelector(getCall);
    const peer = useSelector((state) => (call ? getUser(state, call.peerId) : null));
    const name = useSelector((state) => userDisplayName(state, peer));
    const [minimized, setMinimized] = useState(false);
    const [fullscreen, setFullscreen] = useState(false);
    const rootRef = useRef(null);

    const callId = call && call.callId;
    const status = call && call.status;
    const now = useNow(status === 'active');

    useEffect(() => {
        setMinimized(false);
    }, [callId]);

    useEffect(() => {
        const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
        document.addEventListener('fullscreenchange', onChange);
        return () => document.removeEventListener('fullscreenchange', onChange);
    }, []);

    useEffect(() => {
        if (status === 'ended' && document.fullscreenElement) {
            document.exitFullscreen().catch(() => {
                // ignore
            });
        }
    }, [status]);

    const onKeyDown = useCallback((e) => {
        if (e.key === 'Escape' && !document.fullscreenElement && status !== 'ended') {
            setMinimized(true);
        }
    }, [status]);

    if (!call) {
        return null;
    }

    const toggleFullscreen = () => {
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {
                // ignore
            });
        } else if (rootRef.current && rootRef.current.requestFullscreen) {
            setMinimized(false);
            rootRef.current.requestFullscreen().catch(() => {
                // ignore
            });
        }
    };

    const isVoice = call.direction === 'incoming' ? !call.peerWantsVideo : !call.hasVideo;

    // ----- Incoming: compact, non-blocking card -----
    if (call.direction === 'incoming' && status === 'ringing') {
        return (
            <div
                className='wrtc-call wrtc-call--incoming'
                role='alertdialog'
                aria-label={`Incoming call from ${name}`}
            >
                <div className='wrtc-incoming'>
                    <span className='wrtc-call__pulse'>
                        <Avatar
                            user={peer}
                            name={name}
                            size={72}
                        />
                    </span>
                    <div className='wrtc-incoming__name'>{name}</div>
                    <div className='wrtc-incoming__kind'>{isVoice ? 'Incoming voice call' : 'Incoming video call'}</div>
                    <div className='wrtc-incoming__actions'>
                        <span className='wrtc-incoming__action'>
                            <Control
                                icon='hangup'
                                label='Decline'
                                variant='decline'
                                onClick={() => dispatch(declineCall())}
                            />
                            {'Decline'}
                        </span>
                        <span className='wrtc-incoming__action'>
                            <Control
                                icon={isVoice ? 'phone' : 'video'}
                                label='Accept'
                                variant='accept'
                                onClick={() => dispatch(acceptCall())}
                            />
                            {'Accept'}
                        </span>
                    </div>
                </div>
            </div>
        );
    }

    const ended = status === 'ended';
    const active = status === 'active';
    const mini = minimized && !ended;

    let statusText = '';
    let statusWarn = false;
    switch (status) {
    case 'ringing':
        statusText = 'Calling…';
        break;
    case 'connecting':
        statusText = 'Connecting…';
        break;
    case 'active':
        statusText = formatDuration(now - call.startedAt);
        break;
    case 'reconnecting':
        statusText = 'Reconnecting…';
        statusWarn = true;
        break;
    default:
        statusText = call.startedAt && call.endedAt ? `Ended · ${formatDuration(call.endedAt - call.startedAt)}` : 'Ended';
    }

    const remote = call.remoteStream;
    const showRemoteVideo = !ended && hasLiveVideo(remote) && (call.peerVideoOn || call.peerScreenSharing);
    const showSelfVideo = !ended && call.localStream && (call.screenSharing || (call.hasVideo && call.videoOn));

    let placeholder = null;
    if (ended) {
        const [title, sub] = (END_MESSAGES[call.endReason] || END_MESSAGES.hangup)(name);
        const canRetry = RETRYABLE.has(call.endReason);
        placeholder = (
            <div className='wrtc-call__placeholder'>
                <Avatar
                    user={peer}
                    name={name}
                    size={mini ? 40 : 88}
                />
                <div className='wrtc-call__placeholder-title'>{title}</div>
                {(call.error || sub) && <div className='wrtc-call__placeholder-sub'>{call.error || sub}</div>}
                <div className='wrtc-ended__actions'>
                    <button
                        type='button'
                        className='wrtc-btn wrtc-btn--ghost'
                        onClick={() => dispatch(dismissCall(call.callId))}
                        autoFocus={true}
                    >
                        {'Close'}
                    </button>
                    {canRetry && (
                        <button
                            type='button'
                            className='wrtc-btn wrtc-btn--primary'
                            onClick={() => dispatch(startCall(call.peerId))}
                        >
                            <Icon
                                name='video'
                                size={16}
                            />
                            {call.direction === 'outgoing' ? 'Call again' : 'Call back'}
                        </button>
                    )}
                </div>
            </div>
        );
    } else if (!showRemoteVideo) {
        let sub = '';
        if (status === 'ringing') {
            sub = 'Ringing…';
        } else if (status === 'connecting') {
            sub = 'Setting up a secure connection…';
        } else if (status === 'reconnecting') {
            sub = 'Trying to reconnect…';
        } else if (!call.peerVideoOn || !hasLiveVideo(remote)) {
            sub = 'Camera is off';
        }
        placeholder = (
            <div className='wrtc-call__placeholder'>
                <span className={status === 'ringing' ? 'wrtc-call__pulse' : ''}>
                    <Avatar
                        user={peer}
                        name={name}
                        size={mini ? 48 : 112}
                    />
                </span>
                {!mini && <div className='wrtc-call__placeholder-title'>{name}</div>}
                {sub && <div className='wrtc-call__placeholder-sub'>{sub}</div>}
            </div>
        );
    }

    const classes = ['wrtc-call', mini ? 'wrtc-call--mini' : 'wrtc-call--full'];

    return (
        <>
            {!mini && (
                <div
                    className='wrtc-call__backdrop'
                    onClick={ended ? () => dispatch(dismissCall(call.callId)) : () => setMinimized(true)}
                />
            )}
            <div
                ref={rootRef}
                className={classes.join(' ')}
                role='dialog'
                aria-label={`Call with ${name}`}
                onKeyDown={onKeyDown}
                tabIndex={-1}
            >
                <div className='wrtc-call__top'>
                    {!mini && (
                        <Avatar
                            user={peer}
                            name={name}
                            size={32}
                        />
                    )}
                    <div className='wrtc-call__who'>
                        <div className='wrtc-call__name'>{name}</div>
                        <div className={statusWarn ? 'wrtc-call__status wrtc-call__status--warn' : 'wrtc-call__status'}>
                            {statusText}
                            {active && !call.peerAudioOn && ' · muted'}
                            {active && call.peerScreenSharing && ' · sharing screen'}
                        </div>
                    </div>
                    {!ended && !mini && !fullscreen && (
                        <button
                            type='button'
                            className='wrtc-call__iconbtn'
                            onClick={() => setMinimized(true)}
                            title='Minimize (Esc)'
                            aria-label='Minimize call window'
                        >
                            <Icon
                                name='minimize'
                                size={18}
                            />
                        </button>
                    )}
                    {!ended && mini && (
                        <button
                            type='button'
                            className='wrtc-call__iconbtn'
                            onClick={() => setMinimized(false)}
                            title='Expand'
                            aria-label='Expand call window'
                        >
                            <Icon
                                name='expand'
                                size={18}
                            />
                        </button>
                    )}
                    {!ended && !mini && (
                        <button
                            type='button'
                            className='wrtc-call__iconbtn'
                            onClick={toggleFullscreen}
                            title={fullscreen ? 'Exit full screen' : 'Full screen'}
                            aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}
                        >
                            <Icon
                                name={fullscreen ? 'fullscreenExit' : 'fullscreen'}
                                size={18}
                            />
                        </button>
                    )}
                </div>

                <div
                    className='wrtc-call__stage'
                    onDoubleClick={mini ? () => setMinimized(false) : toggleFullscreen}
                >
                    {/* Always mounted while a remote stream exists so audio keeps playing. */}
                    {remote && !ended && (
                        <StreamVideo
                            stream={remote}
                            tracksVersion={call.remoteTracks}
                            className={showRemoteVideo ? `wrtc-call__remote${call.peerScreenSharing ? ' wrtc-call__remote--contain' : ''}` : 'wrtc-call__hidden'}
                        />
                    )}
                    {placeholder}

                    {!ended && call.localStream && (
                        <div className={call.screenSharing ? 'wrtc-call__self' : 'wrtc-call__self wrtc-call__self--mirror'}>
                            {showSelfVideo ? (
                                <StreamVideo
                                    stream={call.localStream}
                                    muted={true}
                                />
                            ) : (
                                <div className='wrtc-call__self-off'>
                                    <span className='wrtc-call__badge'>
                                        <Icon
                                            name='videoOff'
                                            size={14}
                                        />
                                        {'You'}
                                    </span>
                                </div>
                            )}
                        </div>
                    )}

                    {!ended && (
                        <div className='wrtc-call__bar'>
                            <Control
                                icon={call.audioOn ? 'mic' : 'micOff'}
                                label={call.audioOn ? 'Mute microphone' : 'Unmute microphone'}
                                variant={call.audioOn ? '' : 'off'}
                                onClick={() => dispatch(toggleAudio())}
                                disabled={!call.localStream}
                            />
                            <Control
                                icon={call.hasVideo && call.videoOn ? 'video' : 'videoOff'}
                                label={cameraLabel(call)}
                                variant={call.hasVideo && call.videoOn ? '' : 'off'}
                                onClick={() => dispatch(toggleVideo())}
                                disabled={!call.hasVideo || !call.localStream}
                            />
                            {!mini && canShareScreen() && (
                                <Control
                                    icon='screen'
                                    label={call.screenSharing ? 'Stop sharing' : 'Share screen'}
                                    variant={call.screenSharing ? 'on' : ''}
                                    onClick={() => dispatch(toggleScreenShare())}
                                    disabled={!active}
                                />
                            )}
                            <Control
                                icon='hangup'
                                label={status === 'ringing' ? 'Cancel call' : 'Leave call'}
                                variant='end'
                                onClick={() => dispatch(hangUp())}
                            />
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
