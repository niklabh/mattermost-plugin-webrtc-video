import React, {PureComponent} from 'react';
import PropTypes from 'prop-types';
import {Modal} from 'react-bootstrap';

import debug from '../../../utils/debug';

export default class StartVideoCallModal extends PureComponent {
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
        peerStream: PropTypes.object,
        selfStream: PropTypes.object,
        peerAccepted: PropTypes.bool.isRequired,
    };

    componentDidMount() {
        this.attachStream(this.remoteVideoRef, this.props.peerStream, null);
        this.attachStream(this.selfVideoRef, this.props.selfStream, null);
    }

    componentDidUpdate(prevProps) {
        this.attachStream(this.remoteVideoRef, this.props.peerStream, prevProps.peerStream);
        this.attachStream(this.selfVideoRef, this.props.selfStream, prevProps.selfStream);
    }

    attachStream(el, stream, prevStream) {
        if (!el || !stream) {
            return;
        }
        if (prevStream === stream && el.srcObject === stream) {
            return;
        }
        el.srcObject = stream;
    }

    handleClose = () => {
        const {incoming, accepted, rejectCall, endCall} = this.props;
        if (incoming && !accepted) {
            rejectCall();
        } else {
            endCall();
        }
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
        const {
            visible, incoming, outgoing, peerName, accepted, callPeerAudioOn, callPeerVideoOn,
            peerStream, peerAccepted, audioOn, videoOn, selfStream,
        } = this.props;
        const s = styles;

        debug('[start_video_call] props', this.props);

        if (!visible) {
            return null;
        }

        const showActiveCall = (outgoing && peerAccepted) || (incoming && accepted);
        const initials = (peerName || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';

        return (
            <Modal
                dialogClassName='webrtc-video-modal-dialog'
                show={visible}
                onHide={this.handleClose}
                backdrop='static'
            >
                <div style={s.shell}>
                    {!accepted && incoming && (
                        <div style={s.incomingWrap}>
                            <div
                                style={s.ringPulse}
                                aria-hidden='true'
                            />
                            <div style={s.avatar}>
                                {initials}
                            </div>
                            <h2 style={s.title}>{'Incoming video call'}</h2>
                            <p style={s.subtitle}>{peerName}</p>
                            <div style={s.ringActions}>
                                <button
                                    type='button'
                                    style={{...s.fab, ...s.fabDecline}}
                                    onClick={this.rejectCall}
                                    aria-label='Decline call'
                                >
                                    <i
                                        className='fa fa-phone'
                                        style={s.fabIconFlip}
                                    />
                                </button>
                                <button
                                    type='button'
                                    style={{...s.fab, ...s.fabAccept}}
                                    onClick={this.acceptCall}
                                    aria-label='Accept call'
                                >
                                    <i className='fa fa-phone'/>
                                </button>
                            </div>
                        </div>
                    )}

                    {accepted && !peerStream && (
                        <div style={s.connectingWrap}>
                            <div style={s.spinner}/>
                            <h2 style={s.titleMuted}>
                                {outgoing && !peerAccepted ? 'Ringing…' : 'Connecting…'}
                            </h2>
                            <p style={s.subtitleMuted}>{peerName}</p>
                            {outgoing && !peerAccepted && (
                                <button
                                    type='button'
                                    style={s.textButton}
                                    onClick={this.endCall}
                                >
                                    {'Cancel call'}
                                </button>
                            )}
                        </div>
                    )}

                    {showActiveCall && peerStream && (
                        <div style={s.videoStage}>
                            <video
                                style={s.remoteVideo}
                                autoPlay={true}
                                playsInline={true}
                                ref={(el) => {
                                    this.remoteVideoRef = el;
                                }}
                            >
                                {'Your browser does not support the video tag.'}
                            </video>
                            {selfStream && (
                                <video
                                    style={s.pip}
                                    autoPlay={true}
                                    playsInline={true}
                                    muted={true}
                                    ref={(el) => {
                                        this.selfVideoRef = el;
                                    }}
                                />
                            )}
                            <div style={s.nameChip}>
                                <span style={s.nameChipText}>{peerName}</span>
                                {!callPeerVideoOn && (
                                    <span style={s.badge}>
                                        <i className='fa fa-video-camera'/>
                                    </span>
                                )}
                                {!callPeerAudioOn && (
                                    <span style={s.badge}>
                                        <i className='fa fa-microphone-slash'/>
                                    </span>
                                )}
                            </div>
                            <div style={s.toolbar}>
                                <button
                                    type='button'
                                    style={{
                                        ...s.toolBtn,
                                        ...(videoOn ? s.toolBtnOn : s.toolBtnMuted),
                                    }}
                                    onClick={this.props.videoToggle}
                                    aria-label='Toggle camera'
                                >
                                    <i className='fa fa-video-camera'/>
                                </button>
                                <button
                                    type='button'
                                    style={{...s.toolBtn, ...s.toolBtnEnd}}
                                    onClick={this.endCall}
                                    aria-label='End call'
                                >
                                    <i
                                        className='fa fa-phone'
                                        style={s.fabIconFlip}
                                    />
                                </button>
                                <button
                                    type='button'
                                    style={{
                                        ...s.toolBtn,
                                        ...(audioOn ? s.toolBtnOn : s.toolBtnMuted),
                                    }}
                                    onClick={this.props.audioToggle}
                                    aria-label='Toggle microphone'
                                >
                                    <i className='fa fa-microphone'/>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </Modal>
        );
    }
}

const styles = {
    shell: {
        position: 'relative',
        minHeight: '320px',
        borderRadius: '16px',
        overflow: 'hidden',
        background: 'linear-gradient(160deg, #0f111a 0%, #1a1f2e 45%, #12151f 100%)',
        color: '#e9edf5',
        boxShadow: '0 24px 80px rgba(0, 0, 0, 0.45)',
    },
    incomingWrap: {
        position: 'relative',
        padding: '48px 32px 40px',
        textAlign: 'center',
    },
    ringPulse: {
        position: 'absolute',
        top: '50%',
        left: '50%',
        width: '220px',
        height: '220px',
        marginTop: '-130px',
        marginLeft: '-110px',
        borderRadius: '50%',
        border: '2px solid rgba(91, 164, 255, 0.25)',
        animation: 'webrtc-ring 2.4s ease-out infinite',
    },
    avatar: {
        position: 'relative',
        width: '96px',
        height: '96px',
        margin: '0 auto 20px',
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #5ba4ff, #7c5cff)',
        color: '#fff',
        fontSize: '32px',
        fontWeight: 600,
        lineHeight: '96px',
        letterSpacing: '0.04em',
        boxShadow: '0 12px 40px rgba(91, 164, 255, 0.35)',
    },
    title: {
        margin: '0 0 8px',
        fontSize: '22px',
        fontWeight: 600,
        letterSpacing: '-0.02em',
    },
    subtitle: {
        margin: '0 0 32px',
        fontSize: '16px',
        opacity: 0.85,
    },
    titleMuted: {
        margin: '20px 0 8px',
        fontSize: '20px',
        fontWeight: 600,
    },
    subtitleMuted: {
        margin: '0 0 24px',
        fontSize: '15px',
        opacity: 0.7,
    },
    ringActions: {
        display: 'flex',
        justifyContent: 'center',
        gap: '48px',
    },
    fab: {
        width: '64px',
        height: '64px',
        border: 'none',
        borderRadius: '50%',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '22px',
        color: '#fff',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
    },
    fabAccept: {
        background: 'linear-gradient(135deg, #3dcc85, #2ea86a)',
    },
    fabDecline: {
        background: 'linear-gradient(135deg, #ff5c5c, #e02020)',
    },
    fabIconFlip: {
        transform: 'scaleX(-1)',
    },
    connectingWrap: {
        padding: '56px 24px 40px',
        textAlign: 'center',
    },
    spinner: {
        width: '48px',
        height: '48px',
        margin: '0 auto',
        borderRadius: '50%',
        border: '3px solid rgba(255, 255, 255, 0.15)',
        borderTopColor: '#5ba4ff',
        animation: 'webrtc-spin 0.9s linear infinite',
    },
    textButton: {
        marginTop: '8px',
        padding: '10px 20px',
        border: 'none',
        borderRadius: '999px',
        background: 'rgba(255, 255, 255, 0.08)',
        color: '#c5ccda',
        cursor: 'pointer',
        fontSize: '14px',
    },
    videoStage: {
        position: 'relative',
        background: '#000',
        minHeight: '420px',
    },
    remoteVideo: {
        display: 'block',
        width: '100%',
        maxHeight: '78vh',
        minHeight: '360px',
        objectFit: 'cover',
        background: '#0a0c10',
    },
    pip: {
        position: 'absolute',
        right: '16px',
        bottom: '88px',
        width: 'min(28%, 200px)',
        aspectRatio: '16 / 10',
        objectFit: 'cover',
        borderRadius: '12px',
        border: '2px solid rgba(255, 255, 255, 0.35)',
        boxShadow: '0 12px 40px rgba(0, 0, 0, 0.5)',
        background: '#111',
    },
    nameChip: {
        position: 'absolute',
        top: '16px',
        left: '16px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 14px',
        borderRadius: '999px',
        background: 'rgba(10, 12, 16, 0.65)',
        backdropFilter: 'blur(10px)',
    },
    nameChipText: {
        fontSize: '14px',
        fontWeight: 500,
    },
    badge: {
        opacity: 0.9,
        fontSize: '13px',
    },
    toolbar: {
        position: 'absolute',
        left: '50%',
        bottom: '20px',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: '16px',
        padding: '12px 18px',
        borderRadius: '999px',
        background: 'rgba(15, 17, 24, 0.82)',
        backdropFilter: 'blur(12px)',
        boxShadow: '0 12px 40px rgba(0, 0, 0, 0.4)',
    },
    toolBtn: {
        width: '48px',
        height: '48px',
        border: 'none',
        borderRadius: '50%',
        cursor: 'pointer',
        color: '#fff',
        fontSize: '18px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background 0.15s ease',
    },
    toolBtnOn: {
        background: 'rgba(91, 164, 255, 0.35)',
    },
    toolBtnMuted: {
        background: 'rgba(255, 92, 92, 0.45)',
    },
    toolBtnEnd: {
        background: 'linear-gradient(135deg, #ff5c5c, #d01212)',
        paddingLeft: '14px',
    },
};

if (typeof document !== 'undefined' && !document.getElementById('webrtc-video-modal-keyframes')) {
    const tag = document.createElement('style');
    tag.id = 'webrtc-video-modal-keyframes';
    tag.textContent = `
@keyframes webrtc-spin {
  to { transform: rotate(360deg); }
}
@keyframes webrtc-ring {
  0% { transform: scale(0.85); opacity: 0.9; }
  70% { transform: scale(1.15); opacity: 0; }
  100% { transform: scale(1.15); opacity: 0; }
}
.webrtc-video-modal-dialog {
  max-width: 920px;
}
.webrtc-video-modal-dialog .modal-content {
  border: none;
  border-radius: 16px;
  overflow: hidden;
  background: transparent;
}
.webrtc-video-modal-dialog .modal-body {
  padding: 0;
}
`;
    document.head.appendChild(tag);
}
