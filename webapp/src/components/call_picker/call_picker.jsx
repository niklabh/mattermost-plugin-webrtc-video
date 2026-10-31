import React, {useEffect, useMemo, useRef, useState} from 'react';
import {useDispatch, useSelector, useStore} from 'react-redux';

import {getChannel} from 'mattermost-redux/selectors/entities/channels';
import {getCurrentUserId} from 'mattermost-redux/selectors/entities/users';

import ActionTypes from '../../action_types';
import {startCall} from '../../call/controller';
import {autocompleteUsers} from '../../client';
import {getPicker} from '../../selectors';
import {dmPeerId, receivedProfiles, recentDirectMessagePeers, userDisplayName, userStatus} from '../../utils/users';
import Avatar from '../avatar';
import Icon from '../icons';

const SEARCH_DEBOUNCE_MS = 200;
const MAX_RECENT = 12;

function matches(user, name, q) {
    return name.toLowerCase().includes(q) ||
        (user.username || '').toLowerCase().includes(q) ||
        (user.nickname || '').toLowerCase().includes(q);
}

export default function CallPicker() {
    const picker = useSelector(getPicker);
    if (!picker.open) {
        return null;
    }
    return <CallPickerDialog hintChannelId={picker.hintChannelId}/>;
}

function CallPickerDialog({hintChannelId}) { // eslint-disable-line react/prop-types
    const dispatch = useDispatch();
    const store = useStore();
    const me = useSelector(getCurrentUserId);
    const recent = useSelector(recentDirectMessagePeers, (a, b) => a.length === b.length && a.every((u, i) => u === b[i]));
    const hintPeerId = useSelector((state) => dmPeerId(hintChannelId && getChannel(state, hintChannelId), me));

    const [query, setQuery] = useState('');
    const [results, setResults] = useState(null);
    const [loading, setLoading] = useState(false);
    const [active, setActive] = useState(0);
    const listRef = useRef(null);

    const close = () => dispatch({type: ActionTypes.CLOSE_PICKER});
    const call = (user) => {
        close();
        dispatch(startCall(user.id));
    };

    // Debounced server-side search across all users.
    const q = query.trim().toLowerCase();
    useEffect(() => {
        if (!q) {
            setResults(null);
            setLoading(false);
            return undefined;
        }
        const ctrl = new AbortController();
        setLoading(true);
        const timer = setTimeout(async () => {
            try {
                const users = await autocompleteUsers(q, ctrl.signal);
                dispatch(receivedProfiles(users));
                setResults(users);
            } catch (e) {
                if (e.name !== 'AbortError') {
                    setResults([]);
                }
            } finally {
                if (!ctrl.signal.aborted) {
                    setLoading(false);
                }
            }
        }, SEARCH_DEBOUNCE_MS);
        return () => {
            clearTimeout(timer);
            ctrl.abort();
        };
    }, [q, dispatch]);

    const rows = useMemo(() => {
        const state = store.getState();
        const named = (u) => ({user: u, name: userDisplayName(state, u)});
        if (!q) {
            const list = recent.slice(0, MAX_RECENT);
            const hinted = list.findIndex((u) => u.id === hintPeerId);
            if (hinted > 0) {
                list.unshift(list.splice(hinted, 1)[0]);
            }
            return list.map(named);
        }
        const seen = new Set();
        const local = recent.map(named).filter((r) => matches(r.user, r.name, q));
        const remote = (results || []).filter((u) => !u.is_bot && !u.delete_at).map(named);
        return [...local, ...remote].filter((r) => {
            if (r.user.id === me || seen.has(r.user.id)) {
                return false;
            }
            seen.add(r.user.id);
            return true;
        });
    }, [q, recent, results, hintPeerId, me, store]);

    useEffect(() => setActive(0), [q, rows.length]);

    useEffect(() => {
        const el = listRef.current && listRef.current.children[active];
        if (el && el.scrollIntoView) {
            el.scrollIntoView({block: 'nearest'});
        }
    }, [active]);

    const onKeyDown = (e) => {
        if (e.key === 'Escape') {
            e.stopPropagation();
            close();
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((i) => Math.min(rows.length - 1, i + 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => Math.max(0, i - 1));
        } else if (e.key === 'Enter' && rows[active]) {
            e.preventDefault();
            call(rows[active].user);
        }
    };

    let empty = null;
    if (!rows.length) {
        if (q && (loading || results === null)) {
            empty = 'Searching…';
        } else if (q) {
            empty = `No one found matching “${query.trim()}”`;
        } else {
            empty = 'Search for anyone on this server to start a call.';
        }
    }

    return (
        <div
            className='wrtc-backdrop'
            onMouseDown={(e) => e.target === e.currentTarget && close()}
        >
            <div
                className='wrtc-dialog'
                role='dialog'
                aria-modal='true'
                aria-labelledby='wrtc-picker-title'
                onKeyDown={onKeyDown}
            >
                <div className='wrtc-dialog__header'>
                    <h2
                        id='wrtc-picker-title'
                        className='wrtc-dialog__title'
                    >
                        {'Start a video call'}
                    </h2>
                    <button
                        type='button'
                        className='wrtc-btn wrtc-btn--ghost wrtc-btn--icon'
                        onClick={close}
                        aria-label='Close'
                    >
                        <Icon name='close'/>
                    </button>
                </div>
                <div className='wrtc-dialog__body'>
                    <label className='wrtc-search'>
                        <Icon
                            name='search'
                            size={18}
                        />
                        <input
                            type='text'
                            autoFocus={true}
                            placeholder='Search by name or @username'
                            aria-label='Search people'
                            aria-controls='wrtc-picker-list'
                            aria-activedescendant={rows[active] ? `wrtc-pick-${rows[active].user.id}` : undefined}
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                        />
                    </label>
                    {!q && rows.length > 0 && <div className='wrtc-section-label'>{'Recent conversations'}</div>}
                    {empty ? (
                        <div className='wrtc-empty'>{empty}</div>
                    ) : (
                        <ul
                            id='wrtc-picker-list'
                            ref={listRef}
                            className='wrtc-list'
                            role='listbox'
                        >
                            {rows.map(({user, name}, i) => (
                                <li
                                    key={user.id}
                                    id={`wrtc-pick-${user.id}`}
                                    role='option'
                                    aria-selected={i === active}
                                >
                                    <button
                                        type='button'
                                        tabIndex={-1}
                                        className={i === active ? 'wrtc-row wrtc-row--active' : 'wrtc-row'}
                                        onMouseEnter={() => setActive(i)}
                                        onClick={() => call(user)}
                                    >
                                        <Avatar
                                            user={user}
                                            name={name}
                                            size={36}
                                            status={userStatus(store.getState(), user.id)}
                                        />
                                        <span className='wrtc-row__text'>
                                            <span className='wrtc-row__name'>{name}</span>
                                            <span className='wrtc-row__sub'>
                                                {'@'}{user.username}{user.position ? ` · ${user.position}` : ''}
                                            </span>
                                        </span>
                                        <span className='wrtc-row__action'>
                                            <Icon name='video'/>
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
}
