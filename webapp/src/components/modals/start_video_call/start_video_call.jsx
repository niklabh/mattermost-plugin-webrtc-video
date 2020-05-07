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
        audioToggle: PropTypes.func.isRequired,
        videoToggle: PropTypes.func.isRequired,
        callPeerAudioOn: PropTypes.bool.isRequired,
        callPeerVideoOn: PropTypes.bool.isRequired,
        audioOn: PropTypes.bool.isRequired,
        videoOn: PropTypes.bool.isRequired,
        peerStream: PropTypes.any,
        peerAccepted: PropTypes.bool.isRequired,
    };

    componentDidUpdate() {
        if (this.streamEle) {
            const {peerStream} = this.props;
            if ('srcObject' in this.streamEle) {
                this.streamEle.srcObject = peerStream;
            } else {
                // Older browsers don't support srcObject
                this.streamEle.src = URL.createObjectURL(peerStream);
            }
        }
    }

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
        const {visible, incoming, outgoing, peerName, accepted, callPeerAudioOn, callPeerVideoOn, peerStream, peerAccepted, audioOn, videoOn} = this.props;
        const style = getStyle();
        console.log('FILHAAL@', this.props, this.state);

        console.log('Render', ringtone);
        if (!visible) {
            return null;
        }

        // if (!accepted) {
        //     const aud = new Audio(ringtone);
        //     console.log('AUDIO', aud);
        //     aud.loop = true;
        //     aud.crossOrigin = 'anonymous';
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
                {accepted && !peerStream && (
                    <div>
                        <div style={style.container}>
                            <div style={style.banner}>
                                <h1>
                                    {'connecting'}
                                </h1>
                            </div>

                        </div>
                    </div>
                )}
                {((outgoing && peerAccepted) || (incoming && accepted)) && (
                    <div>
                        <div style={style.container}>
                            {peerStream && (
                                <video
                                    id='video-player'
                                    style={style.player}
                                    autoPlay={true}
                                    ref={(ele) => {
                                        this.streamEle = ele;
                                    }}
                                >
                                    {'Your browser does not support the video tag.'}
                                </video>)}
                        </div>
                    </div>
                )}

                {((outgoing && peerAccepted) || (incoming && accepted)) && (<div>

                    <div style={style.status}>
                        {peerName}
                        {!callPeerVideoOn && (
                            <span
                                style={style.button}
                            >
                                <i
                                    style={style.faOut}
                                    className='fa fa-video-camera'
                                />

                            </span>)}
                        {!callPeerAudioOn && (
                            <span
                                style={style.button}
                                className='fa-stack'
                            >
                                <i
                                    style={style.faOut}
                                    className='fa fa-microphone-slash'
                                />
                            </span>)}
                    </div>

                </div>
                )}
                {accepted && (
                    <div>

                        <div style={style.controls}>
                            <button
                                style={style.button}
                                className={videoOn ? 'btn btn-primary' : 'btn btn-danger'}
                                onClick={this.props.videoToggle}
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
                                className={audioOn ? 'btn btn-primary' : 'btn btn-danger'}
                                onClick={this.props.audioToggle}
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
    banner: {
        minHeight: '250px',
        textAlign: 'center',
    },
    container: {
        position: 'relative',
        padding: '5px',
    },
    player: {
        width: '100%',
        minHeight: '80vh',
        margin: '5px',
    },
    controls: {
        position: 'absolute',
        width: '100%',
        textAlign: 'center',
        bottom: '10px',
    },
    status: {
        width: '100%',
        bottom: '10px',
    },
    button: {
        margin: '0 5px',
    },
    fa: {
        margin: 0,
    },
    faOut: {
        margin: 0,
        color: '#244d84',
    },
    inverted: {
        transform: 'scaleX(-1)',
    },
    whiteText: {
        color: '#fff',
    },
});
