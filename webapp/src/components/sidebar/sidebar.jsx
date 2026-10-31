import React from 'react';
import {useDispatch, useSelector} from 'react-redux';

import {getCurrentChannelId} from 'mattermost-redux/selectors/entities/channels';

import {openPicker} from '../../actions';
import Icon from '../icons';

import VoiceChannels from './voice_channels';

export default function Sidebar() {
    const dispatch = useDispatch();
    const channelId = useSelector(getCurrentChannelId);

    return (
        <div className='wrtc-sidebar'>
            <button
                type='button'
                className='wrtc-sidebar__call'
                onClick={() => dispatch(openPicker(channelId))}
                title='Start a video call'
            >
                <Icon
                    name='video'
                    size={18}
                />
                {'Start a video call'}
            </button>
            <VoiceChannels/>
        </div>
    );
}
