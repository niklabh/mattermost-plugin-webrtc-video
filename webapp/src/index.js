import {id as pluginId} from './manifest';
import Icon from './components/icon.jsx';
import StartVideoCallModal from './components/modals/start_video_call';
import VideoCallPickerModal from './components/video_call_picker';
import PopoverVideoCallButton from './components/popover_video_call_button';
import LeftSidebarHeader from './components/left_sidebar_header';
import Reducer from './reducers';
import {loadConfig, openVideoCallPicker} from './actions';

export default class Plugin {
    // eslint-disable-next-line no-unused-vars
    initialize(registry, store) {
        registry.registerReducer(Reducer);

        const openPicker = (hintChannelId) => {
            store.dispatch(openVideoCallPicker(hintChannelId));
        };

        registry.registerMainMenuAction(
            'Start video call…',
            () => openPicker(null),
            Icon,
        );

        registry.registerChannelHeaderMenuAction(
            'Start video call…',
            (channelId) => openPicker(channelId || null),
        );

        registry.registerPopoverUserActionsComponent(PopoverVideoCallButton);

        registry.registerRootComponent(StartVideoCallModal);
        registry.registerRootComponent(VideoCallPickerModal);
        registry.registerLeftSidebarHeaderComponent(LeftSidebarHeader);
        loadConfig()(store.dispatch, store.getState);
    }
}

window.registerPlugin(pluginId, new Plugin());
