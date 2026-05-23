/* eslint-disable react/prop-types */
import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';

import {getCurrentUserId, getUser} from 'mattermost-redux/selectors/entities/users';

import {WEBRTC_INVITE_PROPS_KEY} from '../../constants/callInvite';

function parseInvite(post) {
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
    return inv && typeof inv === 'object' ? inv : null;
}

function displayName(u) {
    if (!u) {
        return 'Someone';
    }
    const n = `${u.first_name || ''} ${u.last_name || ''}`.trim();
    return n || u.username || '';
}

class WebrtcInvitePost extends React.PureComponent {
    static propTypes = {
        post: PropTypes.object.isRequired,
        theme: PropTypes.object,
        currentUserId: PropTypes.string,
        callerName: PropTypes.string.isRequired,
    };

    render() {
        const {post, theme, currentUserId, callerName} = this.props;
        const inv = parseInvite(post);
        if (!inv || !inv.caller_id || !inv.callee_id) {
            return null;
        }

        const t = theme || {};
        const border = t.centerChannelColor || '#333';
        const bg = t.centerChannelBg || '#fff';

        const box = {
            marginTop: 8,
            padding: 12,
            borderRadius: 6,
            border: `1px solid ${border}33`,
            backgroundColor: `${bg}f5`,
            maxWidth: 420,
        };

        const callee = currentUserId === inv.callee_id;
        const caller = currentUserId === inv.caller_id;

        return (
            <div
                style={box}
                className='webrtc-video-invite-post'
            >
                <div style={{fontWeight: 600, marginBottom: 8}}>
                    {'Video call'}
                </div>
                <div style={{fontSize: '0.92em'}}>
                    {callee && (
                        <span>
                            {callerName || 'Someone'}
                            {' wants to start a video call. Use the call window to accept or decline.'}
                        </span>
                    )}
                    {caller && !callee && (
                        <span>
                            {'You started a video call.'}
                        </span>
                    )}
                    {!caller && !callee && (
                        <span>
                            {'Video call between teammates.'}
                        </span>
                    )}
                </div>
            </div>
        );
    }
}

const mapStateToProps = (state, ownProps) => {
    const inv = parseInvite(ownProps.post);
    let callerName = '';
    if (inv && inv.caller_id) {
        callerName = displayName(getUser(state, inv.caller_id));
    }
    return {
        currentUserId: getCurrentUserId(state),
        callerName,
    };
};

export default connect(mapStateToProps)(WebrtcInvitePost);
