/* eslint-disable react/prop-types */
import React from 'react';
import PropTypes from 'prop-types';

import ConnectedVoiceChannel from '../modals/audio_group_call/audio_group_call';

export default class LeftSidebarHeader extends React.PureComponent {
    static propTypes = {
        theme: PropTypes.object,
        hintChannelId: PropTypes.string,
        openVideoCallPicker: PropTypes.func.isRequired,
    };

    handleVideoClick = () => {
        const id = this.props.hintChannelId || null;
        this.props.openVideoCallPicker(id);
    };

    render() {
        const {theme} = this.props;
        const t = theme || {};
        const text = t.sidebarText || '#fff';
        const subtle = t.sidebarText || '#fff';

        const row = {
            padding: '6px 10px 10px',
            borderBottom: `1px solid ${text}18`,
        };
        const btn = {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-start',
            width: '100%',
            gap: 8,
            cursor: 'pointer',
            border: 'none',
            borderRadius: 4,
            padding: '8px 10px',
            fontWeight: 600,
            fontSize: '0.9em',
            fontFamily: 'inherit',
            color: text,
            backgroundColor: `${subtle}14`,
        };

        return (
            <div>
                <div style={row}>
                    <button
                        type='button'
                        style={btn}
                        onClick={this.handleVideoClick}
                        title='Start a video call — choose who to call'
                    >
                        <i className='fa fa-video-camera'/>
                        {'Video call…'}
                    </button>
                </div>
                <ConnectedVoiceChannel/>
            </div>
        );
    }
}
