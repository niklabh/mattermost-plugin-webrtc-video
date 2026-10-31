import React from 'react';
import PropTypes from 'prop-types';
import {useDispatch, useSelector} from 'react-redux';

import {getCurrentUserId, getUser} from 'mattermost-redux/selectors/entities/users';

import {startCall} from '../call/controller';
import {isInCall} from '../selectors';

import Icon from './icons';

/** Channel header "Video call" button (rendered by registerCallButtonAction). */
export function HeaderCallButton() {
    return (
        <button
            type='button'
            className='wrtc-header-btn'
            aria-label='Start a video call'
        >
            <Icon
                name='video'
                size={16}
            />
            {'Video call'}
        </button>
    );
}

/** Entry shown when several call plugins share the header dropdown. */
export function HeaderCallDropdownItem() {
    return (
        <span className='wrtc-dropdown-item'>
            <Icon
                name='video'
                size={16}
            />
            {'Peer-to-peer video call'}
        </span>
    );
}

/** "Video call" button in the user profile popover. */
export function PopoverCallButton(props) {
    const dispatch = useDispatch();
    const targetId = props.userId || props.user_id || (props.user && props.user.id);
    const me = useSelector(getCurrentUserId);
    const target = useSelector((state) => (targetId ? getUser(state, targetId) : null));
    const busy = useSelector(isInCall);

    if (!targetId || targetId === me || (target && (target.is_bot || target.delete_at))) {
        return null;
    }

    return (
        <button
            type='button'
            className='wrtc-btn wrtc-btn--tertiary'
            style={{width: '100%', marginTop: 8}}
            disabled={busy}
            onClick={() => {
                if (props.hide) {
                    props.hide();
                }
                dispatch(startCall(targetId));
            }}
        >
            <Icon
                name='video'
                size={16}
            />
            {'Video call'}
        </button>
    );
}

PopoverCallButton.propTypes = {
    user: PropTypes.object,
    userId: PropTypes.string,
    user_id: PropTypes.string,
    hide: PropTypes.func,
};
