import React, {useEffect, useMemo, useState} from 'react';
import PropTypes from 'prop-types';
import {useDispatch, useSelector} from 'react-redux';

import {getCurrentUser, getUser} from 'mattermost-redux/selectors/entities/users';
import {isSystemAdmin} from 'mattermost-redux/utils/user_utils';

import {getPluginConfig, getVoiceRooms} from '../../selectors';
import {buildIceServers} from '../../utils/iceServers';
import {ensureProfiles, userDisplayName} from '../../utils/users';
import {addVoiceRoom, loadVoiceRooms, removeVoiceRoom} from '../../voice/actions';
import {joinVoiceRoom, leaveVoiceRoom, useActiveVoice} from '../../voice/manager';
import {MAX_PARTICIPANTS} from '../../voice/session';
import Avatar from '../avatar';
import Icon from '../icons';

const COLLAPSE_KEY = 'webrtc-video-voice-collapsed';
const CONFIRM_TIMEOUT_MS = 4000;

function readCollapsed() {
    try {
        return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch (e) {
        return false;
    }
}

function Participant({userId, muted, speaking, isYou}) {
    const user = useSelector((state) => getUser(state, userId));
    const name = useSelector((state) => userDisplayName(state, user));
    return (
        <li className='wrtc-participant'>
            <Avatar
                user={user}
                name={name}
                size={20}
                speaking={speaking}
            />
            <span className='wrtc-participant__name'>
                {name}{isYou ? ' (you)' : ''}
            </span>
            {muted && (
                <Icon
                    name='micOff'
                    size={14}
                />
            )}
        </li>
    );
}

Participant.propTypes = {
    userId: PropTypes.string.isRequired,
    muted: PropTypes.bool,
    speaking: PropTypes.bool,
    isYou: PropTypes.bool,
};

export default function VoiceChannels() {
    const dispatch = useDispatch();
    const me = useSelector(getCurrentUser);
    const rooms = useSelector(getVoiceRooms);
    const config = useSelector(getPluginConfig);
    const active = useActiveVoice();

    const [collapsed, setCollapsed] = useState(readCollapsed);
    const [creating, setCreating] = useState(false);
    const [draft, setDraft] = useState('');
    const [error, setError] = useState('');
    const [confirmId, setConfirmId] = useState(null);

    useEffect(() => {
        if (rooms === null) {
            dispatch(loadVoiceRooms());
        }
    }, [rooms, dispatch]);

    // Leave automatically if the active room is deleted.
    useEffect(() => {
        if (active && rooms && !rooms.some((r) => r.id === active.room.id)) {
            leaveVoiceRoom();
        }
    }, [active, rooms]);

    useEffect(() => {
        if (!confirmId) {
            return undefined;
        }
        const t = setTimeout(() => setConfirmId(null), CONFIRM_TIMEOUT_MS);
        return () => clearTimeout(t);
    }, [confirmId]);

    const participants = active ? active.state.participants : {};
    const participantIds = useMemo(() => Object.values(participants).map((p) => p.userId), [participants]);
    useEffect(() => {
        if (participantIds.length) {
            dispatch(ensureProfiles(participantIds));
        }
    }, [participantIds, dispatch]);

    if (!me) {
        return null;
    }

    const toggleCollapsed = () => {
        const next = !collapsed;
        setCollapsed(next);
        try {
            localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
        } catch (e) {
            // ignore
        }
    };

    const join = (room) => {
        if (active && active.room.id === room.id) {
            return;
        }
        setError('');
        joinVoiceRoom(room, {
            userId: me.id,
            iceServers: buildIceServers(config.STUNServer, config.TURNServer, config.TURNServerUsername, config.TURNServerCredential),
        });
    };

    const create = async (e) => {
        e.preventDefault();
        const name = draft.trim();
        if (!name) {
            return;
        }
        try {
            const room = await dispatch(addVoiceRoom(name));
            setDraft('');
            setCreating(false);
            setError('');
            if (room) {
                join(room);
            }
        } catch (err) {
            setError(err.message || 'Could not create the voice channel.');
        }
    };

    const remove = async (room) => {
        if (confirmId !== room.id) {
            setConfirmId(room.id);
            return;
        }
        setConfirmId(null);
        try {
            await dispatch(removeVoiceRoom(room.id));
        } catch (err) {
            setError(err.message || 'Could not delete the voice channel.');
        }
    };

    const admin = isSystemAdmin(me.roles || '');
    const list = rooms || [];
    const showList = !collapsed || active;
    const voiceState = active && active.state;

    return (
        <div>
            <div className='wrtc-sidebar__head'>
                <button
                    type='button'
                    className='wrtc-sidebar__label'
                    onClick={toggleCollapsed}
                    aria-expanded={!collapsed}
                >
                    <Icon
                        name={collapsed ? 'chevronRight' : 'chevronDown'}
                        size={16}
                    />
                    {'Voice channels'}
                </button>
                <button
                    type='button'
                    className='wrtc-sidebar__iconbtn'
                    onClick={() => {
                        setCreating(!creating);
                        setCollapsed(false);
                        setError('');
                    }}
                    title='Create a voice channel'
                    aria-label='Create a voice channel'
                >
                    <Icon
                        name={creating ? 'close' : 'plus'}
                        size={16}
                    />
                </button>
            </div>

            {creating && (
                <form
                    className='wrtc-sidebar__form'
                    onSubmit={create}
                >
                    <input
                        className='wrtc-sidebar__input'
                        type='text'
                        maxLength={64}
                        autoFocus={true}
                        placeholder='Channel name, e.g. Standup'
                        aria-label='New voice channel name'
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => e.key === 'Escape' && setCreating(false)}
                    />
                    <button
                        type='submit'
                        className='wrtc-btn wrtc-btn--primary'
                        style={{height: 28}}
                        disabled={!draft.trim()}
                    >
                        {'Create'}
                    </button>
                </form>
            )}

            {error && <div className='wrtc-sidebar__hint wrtc-sidebar__error'>{error}</div>}

            {showList && list.map((room) => {
                const isActive = active && active.room.id === room.id;
                if (collapsed && !isActive) {
                    return null;
                }
                const canDelete = room.creator_id === me.id || admin;
                const confirming = confirmId === room.id;
                return (
                    <div key={room.id}>
                        <div
                            className={isActive ? 'wrtc-room wrtc-room--active' : 'wrtc-room'}
                            role='button'
                            tabIndex={0}
                            onClick={() => join(room)}
                            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && join(room)}
                            title={isActive ? room.name : `Join ${room.name}`}
                        >
                            <Icon
                                name='wave'
                                size={16}
                            />
                            <span className='wrtc-room__name'>{room.name}</span>
                            {canDelete && (
                                <button
                                    type='button'
                                    className='wrtc-sidebar__iconbtn wrtc-sidebar__iconbtn--danger'
                                    style={confirming ? {visibility: 'visible', width: 'auto', padding: '0 6px', color: '#ff8a8a'} : undefined}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        remove(room);
                                    }}
                                    title='Delete this voice channel for everyone'
                                    aria-label={confirming ? `Confirm deleting ${room.name}` : `Delete ${room.name}`}
                                >
                                    {confirming ? 'Delete?' : (
                                        <Icon
                                            name='trash'
                                            size={14}
                                        />
                                    )}
                                </button>
                            )}
                        </div>
                        {isActive && (
                            <ul className='wrtc-participants'>
                                <Participant
                                    userId={me.id}
                                    muted={voiceState.muted}
                                    speaking={voiceState.selfSpeaking && !voiceState.muted}
                                    isYou={true}
                                />
                                {Object.entries(voiceState.participants).map(([id, p]) => (
                                    <Participant
                                        key={id}
                                        userId={p.userId}
                                        muted={p.muted}
                                        speaking={p.speaking}
                                    />
                                ))}
                            </ul>
                        )}
                    </div>
                );
            })}

            {!collapsed && rooms && list.length === 0 && !creating && (
                <div className='wrtc-sidebar__hint'>{'No voice channels yet. Create one with +.'}</div>
            )}

            {voiceState && (
                <div className='wrtc-voicebar'>
                    <div className='wrtc-voicebar__info'>
                        <div className='wrtc-voicebar__status'>
                            {voiceState.status === 'connecting' ? 'Connecting…' : 'Voice connected'}
                        </div>
                        <div className='wrtc-voicebar__room'>{active.room.name}</div>
                    </div>
                    <button
                        type='button'
                        className={voiceState.muted ? 'wrtc-sidebar__iconbtn wrtc-sidebar__iconbtn--off' : 'wrtc-sidebar__iconbtn'}
                        onClick={() => active.session.setMuted(!voiceState.muted)}
                        disabled={Boolean(voiceState.error)}
                        title={voiceState.muted ? 'Unmute' : 'Mute'}
                        aria-label={voiceState.muted ? 'Unmute microphone' : 'Mute microphone'}
                    >
                        <Icon
                            name={voiceState.muted ? 'micOff' : 'mic'}
                            size={18}
                        />
                    </button>
                    <button
                        type='button'
                        className={voiceState.deafened ? 'wrtc-sidebar__iconbtn wrtc-sidebar__iconbtn--off' : 'wrtc-sidebar__iconbtn'}
                        onClick={() => active.session.setDeafened(!voiceState.deafened)}
                        title={voiceState.deafened ? 'Turn sound on' : 'Turn sound off'}
                        aria-label={voiceState.deafened ? 'Turn sound on' : 'Turn sound off'}
                    >
                        <Icon
                            name={voiceState.deafened ? 'volumeOff' : 'volume'}
                            size={18}
                        />
                    </button>
                    <button
                        type='button'
                        className='wrtc-sidebar__iconbtn wrtc-sidebar__iconbtn--leave'
                        onClick={leaveVoiceRoom}
                        title='Leave voice channel'
                        aria-label='Leave voice channel'
                    >
                        <Icon
                            name='hangup'
                            size={18}
                        />
                    </button>
                </div>
            )}
            {voiceState && voiceState.error && (
                <div className='wrtc-sidebar__hint wrtc-sidebar__error'>{`${voiceState.error} You can still listen.`}</div>
            )}
            {voiceState && Object.keys(voiceState.participants).length >= MAX_PARTICIPANTS - 1 && (
                <div className='wrtc-sidebar__hint'>{`Voice channels support up to ${MAX_PARTICIPANTS} people.`}</div>
            )}
        </div>
    );
}
