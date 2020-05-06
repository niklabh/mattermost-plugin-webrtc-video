import {connect} from 'react-redux';
import {bindActionCreators} from 'redux';
import {getCurrentUser, getUsers} from 'mattermost-redux/selectors/entities/users';

import {acceptCall, rejectCall, endCall, audioToggle, videoToggle} from '../../../actions';

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
        peerAccepted: state[`plugins-${pluginId}`].peerAccepted,
        peerStream: state[`plugins-${pluginId}`].callPeerStream,
        callPeerAudioOn: state[`plugins-${pluginId}`].callPeerAudioOn,
        callPeerVideoOn: state[`plugins-${pluginId}`].callPeerVideoOn,
        connectedPeer: state[`plugins-${pluginId}`].connectedPeer,
        selfStream: state[`plugins-${pluginId}`].selfStream,
        audioOn: state[`plugins-${pluginId}`].audioOn,
        videoOn: state[`plugins-${pluginId}`].videoOn,

    };
};

const mapDispatchToProps = (dispatch) => bindActionCreators({
    acceptCall,
    rejectCall,
    endCall,
    audioToggle,
    videoToggle,
}, dispatch);

export default connect(mapStateToProps, mapDispatchToProps)(StartVideoCall);
