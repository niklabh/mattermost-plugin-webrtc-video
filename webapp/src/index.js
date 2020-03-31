import {id as pluginId} from './manifest';
import Icon from './components/icon.jsx';
import StartVideoCallModal from './components/modals/start_video_call';
import Reducer from './reducers';
import {loadConfig, makeVideoCall} from './actions';

export default class Plugin {
    // eslint-disable-next-line no-unused-vars
    initialize(registry, store) {
        registry.registerReducer(Reducer);
        registry.registerChannelHeaderButtonAction(
            Icon,
            (channel) => {
                makeVideoCall(channel.teammate_id)(store.dispatch, store.getState);
            },
            'Start Video Call'
        );
        registry.registerRootComponent(StartVideoCallModal);

        loadConfig()(store.dispatch, store.getState);
    }
}

window.registerPlugin(pluginId, new Plugin());
