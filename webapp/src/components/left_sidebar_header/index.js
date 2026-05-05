import {connect} from 'react-redux';
import {bindActionCreators} from 'redux';

import {getCurrentChannelId} from 'mattermost-redux/selectors/entities/channels';

import {openVideoCallPicker} from '../../actions';

import LeftSidebarHeader from './left_sidebar_header';

const mapStateToProps = (state) => ({
    hintChannelId: getCurrentChannelId(state),
});

const mapDispatchToProps = (dispatch) => bindActionCreators({
    openVideoCallPicker,
}, dispatch);

export default connect(mapStateToProps, mapDispatchToProps)(LeftSidebarHeader);
