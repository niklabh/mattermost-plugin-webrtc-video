import React, {useState} from 'react';
import PropTypes from 'prop-types';

import {profileImageUrl} from '../client';
import {initials} from '../utils/users';

export default function Avatar({user, name, size = 32, status, speaking, className}) {
    const [failed, setFailed] = useState(false);
    const url = !failed && profileImageUrl(user);
    const classes = ['wrtc-avatar'];
    if (speaking) {
        classes.push('wrtc-avatar--speaking');
    }
    if (className) {
        classes.push(className);
    }

    return (
        <span
            className={classes.join(' ')}
            style={{width: size, height: size, fontSize: Math.round(size * 0.38)}}
        >
            {url ? (
                <img
                    src={url}
                    alt=''
                    onError={() => setFailed(true)}
                />
            ) : (
                <span aria-hidden='true'>{initials(name)}</span>
            )}
            {status && (
                <span
                    className={`wrtc-status wrtc-status--${status}`}
                    title={status}
                />
            )}
        </span>
    );
}

Avatar.propTypes = {
    user: PropTypes.object,
    name: PropTypes.string,
    size: PropTypes.number,
    status: PropTypes.string,
    speaking: PropTypes.bool,
    className: PropTypes.string,
};
