import {connect} from 'react-redux';
import {bindActionCreators} from 'redux';

import {closeVideoCallPicker, makeVideoCall} from '../../actions';
import {id as pluginId} from 'manifest';
import {getDirectMessagePeersForPicker, getHintedPeerId} from '../../utils/dmPickerPeers';

import VideoCallPicker from './video_call_picker';

const mapStateToProps = (state) => {
    const slice = state[`plugins-${pluginId}`];
    return {
        open: slice.videoCallPickerOpen,
        peerRows: getDirectMessagePeersForPicker(state),
        hintPeerId: getHintedPeerId(state, slice.videoCallPickerHintChannelId),
    };
};

const mapDispatchToProps = (dispatch) => bindActionCreators({
    closeVideoCallPicker,
    makeVideoCall,
}, dispatch);

export default connect(mapStateToProps, mapDispatchToProps)(VideoCallPicker);
