/* eslint-disable no-console */
import React, {PureComponent} from 'react';
import PropTypes from 'prop-types';
import {Modal} from 'react-bootstrap';

import ringtone from './ring.mp3';

export default class AttachIssueModal extends PureComponent {
    static propTypes = {
        userId: PropTypes.string.isRequired,
        peerId: PropTypes.string.isRequired,
        peerName: PropTypes.string.isRequired,
        visible: PropTypes.bool.isRequired,
        outgoing: PropTypes.bool.isRequired,
        incoming: PropTypes.bool.isRequired,
        accepted: PropTypes.bool.isRequired,
        acceptCall: PropTypes.func.isRequired,
        rejectCall: PropTypes.func.isRequired,
        endCall: PropTypes.func.isRequired,
    };

    acceptCall = (e) => {
        if (e && e.preventDefault) {
            e.preventDefault();
        }
        this.props.acceptCall();
    };

    endCall = (e) => {
        if (e && e.preventDefault) {
            e.preventDefault();
        }
        this.props.endCall();
    };

    rejectCall = (e) => {
        if (e && e.preventDefault) {
            e.preventDefault();
        }
        this.props.rejectCall();
    };

    render() {
        const {visible, peerName, accepted} = this.props;
        const style = getStyle();

        console.log('Render', ringtone);
        if (!visible) {
            return null;
        }

        // if (!accepted) {
        //     const aud = new Audio('https://fsa.zobj.net/download/bSTbzdq06dBdyG61KeYQWnv8--qWV7Ziw1-s_OFFxBrahjDKcFFe8Ug9ExAWOHLprccThPcujHhPwo-MAHhE9OcfxR2ACTY-7cOo_9vTsMrrtU-yEdkiH-J3B-28/?a=web&c=72&f=hangouts_video_call.mp3&special=1588657752-m%2FLbS97Dmlc%2BtHwbFSztLq7uxR1ltKMjd5B%2FLgH9kzo%3D');
        //     aud.loop = true;
        //     aud.muted = true;
        //     aud.play();
        //     aud.muted = false;
        // }

        return (
            <Modal
                dialogClassName='modal--scroll'
                show={visible}
                onHide={this.handleClose}
                onExited={this.handleClose}
                bsSize='large'
                backdrop='static'
            >
                {!accepted && (
                    <div>
                        <div style={style.profile}>
                            <h1>
                                {`${peerName} calling`}
                            </h1>
                        </div>
                        <div style={style.controls}>
                            <button
                                style={style.button}
                                className='btn btn-success'
                                onClick={this.acceptCall}
                            >
                                <i
                                    style={{...style.fa, ...style.whiteText}}
                                    className='fa fa-phone'
                                />
                            </button>
                            <button
                                style={style.button}
                                className='btn btn-danger'
                                onClick={this.rejectCall}
                            >
                                <i
                                    style={{...style.fa, ...style.inverted}}
                                    className='fa fa-phone'
                                />
                            </button>
                        </div>
                    </div>
                )}
                {accepted && (
                    <div>
                        <div style={style.container}>
                            <video
                                id='video-player'
                                style={style.player}
                            >
                                {'Your browser does not support the video tag.'}
                            </video>
                        </div>
                        <div style={style.controls}>
                            <button
                                style={style.button}
                                className='btn btn-primary'
                            >
                                <i
                                    style={style.fa}
                                    className='fa fa-video-camera'
                                />
                            </button>
                            <button
                                style={style.button}
                                className='btn btn-danger'
                                onClick={this.endCall}
                            >
                                <i
                                    style={{...style.fa, ...style.inverted}}
                                    className='fa fa-phone'
                                />
                            </button>
                            <button
                                style={style.button}
                                className='btn btn-primary'
                            >
                                <i
                                    style={style.fa}
                                    className='fa fa-microphone'
                                />
                            </button>
                        </div>
                    </div>
                )}
            </Modal>
        );
    }
}

const getStyle = () => ({
    profile: {
        minHeight: '250px',
        textAlign: 'center',
    },
    container: {
        position: 'relative',
    },
    player: {
        width: '100%',
        minHeight: '80vh',
    },
    controls: {
        position: 'absolute',
        width: '100%',
        textAlign: 'center',
        bottom: '10px',
    },
    button: {
        margin: '0 5px',
    },
    fa: {
        margin: 0,
    },
    inverted: {
        transform: 'scaleX(-1)',
    },
    whiteText: {
        color: '#fff',
    },
});
