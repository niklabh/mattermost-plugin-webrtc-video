import {connect} from 'react-redux';
import {bindActionCreators} from 'redux';
import {getCurrentUser, getUsers} from 'mattermost-redux/selectors/entities/users';

import {acceptCall, rejectCall, endCall} from '../../../actions';

import {id as pluginId} from 'manifest';

import StartVideoCall from './start_video_call';

const getPeerName = (peer) => {
    return `${peer.first_name || ''} ${peer.last_name || ''}`.trim() || peer.username || '';
};

const mapStateToProps = (state) => {
    const currentUser = getCurrentUser(state);
    const peerId = state[`plugins-${pluginId}`].callPeerId;
    let peer = {};

    if (peerId) {
        peer = getUsers(state)[peerId];
    }

    return {
        userId: currentUser.id,
        peerId,
        peerName: getPeerName(peer),
        visible: state[`plugins-${pluginId}`].modalVisible,
        outgoing: state[`plugins-${pluginId}`].callOutgoing,
        incoming: state[`plugins-${pluginId}`].callIncoming,
        accepted: state[`plugins-${pluginId}`].callAccepted,
    };
};

const mapDispatchToProps = (dispatch) => bindActionCreators({
    acceptCall,
    rejectCall,
    endCall,
}, dispatch);

export default connect(mapStateToProps, mapDispatchToProps)(StartVideoCall);
