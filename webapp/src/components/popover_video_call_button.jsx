/* eslint-disable react/prop-types */
import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import {bindActionCreators} from 'redux';

import {getCurrentUserId} from 'mattermost-redux/selectors/entities/users';

import {makeVideoCall} from '../actions';

class PopoverVideoCallButton extends React.PureComponent {
    static propTypes = {
        user_id: PropTypes.string,
        userId: PropTypes.string,
        hide: PropTypes.func,
        theme: PropTypes.object,
        makeVideoCall: PropTypes.func.isRequired,
        currentUserId: PropTypes.string,
    };

    handleClick = () => {
        const {user_id: snake, userId: camel, hide, makeVideoCall: startCall} = this.props;
        const targetId = camel || snake;
        if (hide) {
            hide();
        }
        if (targetId) {
            startCall(targetId);
        }
    };

    render() {
        const {user_id: snake, userId: camel, currentUserId, theme} = this.props;
        const targetId = camel || snake;
        if (!targetId || targetId === currentUserId) {
            return null;
        }

        const t = theme || {};
        const bg = t.buttonBg || '#166de0';
        const fg = t.buttonColor || '#fff';

        return (
            <button
                type='button'
                className='btn btn-primary'
                style={{
                    marginTop: 12,
                    width: '100%',
                    backgroundColor: bg,
                    borderColor: bg,
                    color: fg,
                }}
                onClick={this.handleClick}
            >
                <i
                    className='fa fa-video-camera'
                    style={{marginRight: 8}}
                />
                {'Video call'}
            </button>
        );
    }
}

const mapStateToProps = (state) => ({
    currentUserId: getCurrentUserId(state),
});

const mapDispatchToProps = (dispatch) => bindActionCreators({makeVideoCall}, dispatch);

export default connect(mapStateToProps, mapDispatchToProps)(PopoverVideoCallButton);
