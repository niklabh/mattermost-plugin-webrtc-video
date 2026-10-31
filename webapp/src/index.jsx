import React from 'react';

import {getChannel} from 'mattermost-redux/selectors/entities/channels';
import {getCurrentUserId} from 'mattermost-redux/selectors/entities/users';

import {id as pluginId} from './manifest';
import Reducer from './reducers';
import {loadConfig, openPicker, startConfigRefresh} from './actions';
import {hangUpOnUnload, startCall, startInbox, stopInbox} from './call/controller';
import {stopRinging} from './call/alerts';
import {WEBRTC_INVITE_POST_TYPE} from './constants/callInvite';
import {injectStyles, removeStyles} from './styles';
import {dmPeerId} from './utils/users';
import {loadVoiceRooms, voiceRoomsUpdated} from './voice/actions';
import {leaveVoiceRoom} from './voice/manager';
import CallWindow from './components/call_window/call_window';
import CallPicker from './components/call_picker/call_picker';
import Sidebar from './components/sidebar/sidebar';
import InvitePost from './components/invite_post';
import Icon from './components/icons';
import {HeaderCallButton, HeaderCallDropdownItem, PopoverCallButton} from './components/call_buttons';

export default class Plugin {
    async initialize(registry, store) {
        injectStyles();
        registry.registerReducer(Reducer);

        const callFromChannel = (channel) => {
            const state = store.getState();
            const ch = typeof channel === 'string' ? getChannel(state, channel) : channel;
            const peer = dmPeerId(ch, getCurrentUserId(state));
            if (peer) {
                store.dispatch(startCall(peer));
            } else {
                store.dispatch(openPicker(ch ? ch.id : null));
            }
        };

        // Entry points.
        registry.registerCallButtonAction(
            <HeaderCallButton/>,
            <HeaderCallDropdownItem/>,
            callFromChannel,
        );
        registry.registerChannelHeaderMenuAction('Start video call', callFromChannel);
        registry.registerMainMenuAction(
            'Start video call',
            () => store.dispatch(openPicker(null)),
            <Icon
                name='video'
                size={16}
            />,
        );
        registry.registerPopoverUserActionsComponent(PopoverCallButton);
        registry.registerLeftSidebarHeaderComponent(Sidebar);

        // UI.
        registry.registerRootComponent(CallWindow);
        registry.registerRootComponent(CallPicker);
        registry.registerPostTypeComponent(WEBRTC_INVITE_POST_TYPE, InvitePost);

        // Voice channel directory updates from the server.
        registry.registerWebSocketEventHandler(`custom_${pluginId}_voice_rooms_updated`, (msg) => {
            store.dispatch(voiceRoomsUpdated(msg));
        });
        registry.registerReconnectHandler(() => {
            store.dispatch(loadConfig());
            store.dispatch(loadVoiceRooms());
        });

        this.onUnload = () => {
            hangUpOnUnload(store.getState());
            leaveVoiceRoom();
        };
        window.addEventListener('pagehide', this.onUnload);

        if (await store.dispatch(loadConfig())) {
            store.dispatch(startInbox());
        }
        this.stopConfigRefresh = store.dispatch(startConfigRefresh());
    }

    uninitialize() {
        if (this.onUnload) {
            window.removeEventListener('pagehide', this.onUnload);
            this.onUnload();
        }
        if (this.stopConfigRefresh) {
            this.stopConfigRefresh();
        }
        stopInbox();
        stopRinging();
        removeStyles();
    }
}

window.registerPlugin(pluginId, new Plugin());
