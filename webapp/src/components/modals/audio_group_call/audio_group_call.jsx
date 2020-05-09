/* eslint-disable react/prop-types */
/* eslint-disable no-shadow */
import {connect} from 'react-redux';
import React from 'react';
import {bindActionCreators} from 'redux';
import {getCurrentUser, getProfiles} from 'mattermost-redux/selectors/entities/users';
import {getConfig} from 'mattermost-redux/selectors/entities/general';
import PropTypes from 'prop-types';
import signalhub from 'signalhub';
import swarm from 'webrtc-swarm';

import debug from '../../../utils/debug';

import {initializeMyAudio, audioConnectToSwarm} from '../../../actions';

import {id as pluginId} from 'manifest';

async function getMediaStream(opts) {
    return navigator.mediaDevices.getUserMedia(opts);
}

async function getMyStream() {
    const audio = {
        autoGainControl: true,
        sampleRate: {ideal: 48000, min: 35000},
        echoCancellation: true,
        channelCount: {ideal: 1},
        volume: 1,
    };

    try {
        debug('try just audio');

        // If that fails, try just audio
        const stream = await getMediaStream({audio});
        return {myStream: stream, audioEnabled: true, videoEnabled: false};
    } catch (err) {
        debug(err);

        return {myStream: null, audioEnabled: false, videoEnabled: false};
    }
}

class AudioCallPanel extends React.Component {
    static propTypes = {
        // eslint-disable-next-line react/no-unused-prop-types
        getCurrentUser: PropTypes.func.isRequired,
        userId: PropTypes.string.isRequired,
    };
    constructor(props) {
        super(props);

        const roomName = '2ecbcc63-0305-4edc-a351-1123913ba43f';
        const invalidRoom = false;

        const {configLoaded,
            signalhubURL,
            stunServer,
            turnServer,
            turnServerUsername,
            turnServerCredential,
            config,
        } = props;

        this.state = {
            initialized: false,
            roomName,
            invalidRoom,
            peerStreams: {},
            playBacks: {},
            swarmInitialized: false,
            myUuid: props.userId,
            audioOn: false,
            videoOn: false,
            audioEnabled: true,
            videoEnabled: false,
            userId: props.userId,
            speakerOn: false,
            myUsername: props.username,
            configLoaded,
            signalhubURL,
            stunServer,
            turnServer,
            turnServerUsername,
            turnServerCredential,
            config,
        };
    }

    async handleRequestPerms() {
        const {myStream, audioEnabled, videoEnabled} = await getMyStream();
        debug({audioEnabled, videoEnabled});
        this.setState({initialized: true, myStream, audioEnabled, videoEnabled});
    }

    async handleSetUserId(userId) {
        this.setState({
            userId,
        });

        this.connectToSwarm(userId);
    }

    connectToSwarm(userId) {
        const {
            myUuid,
            myUsername,
            signalhubURL,
            stunServer,
            turnServer,
            turnServerUsername,
            turnServerCredential,
            config,
        } = this.state;
        const roomCode = `mattermost-webrtc-video-${config.DiagnosticId}`;
        console.log('Room', roomCode);
        const iceServers = [
            {url: 'stun:stun.l.google.com:19302'},
            {url: 'stun:stun1.l.google.com:19302'},
            {url: 'stun:stun2.l.google.com:19302'},
            {url: 'stun:stun3.l.google.com:19302'},
            {url: 'stun:stun4.l.google.com:19302'},
            {url: 'stun:stun01.sipphone.com'},
            {url: 'stun:stun.ekiga.net'},
            {url: 'stun:stun.fwdnet.net'},
            {url: 'stun:stun.ideasip.com'},
            {url: 'stun:stun.iptel.org'},
            {url: 'stun:stun.rixtelecom.se'},
            {url: 'stun:stun.schlund.de'},
            {url: 'stun:stunserver.org'},
            {url: 'stun:stun.softjoys.com'},
            {url: 'stun:stun.voiparound.com'},
            {url: 'stun:stun.voipbuster.com'},
            {url: 'stun:stun.voipstunt.com'},
            {url: 'stun:stun.voxgratia.org'},
            {url: 'stun:stun.xten.com'},
            {
                url: 'turn:numb.viagenie.ca',
                credential: 'muazkh',
                username: 'webrtc@live.com',
            },
            {
                url: 'turn:turn.bistri.com:80',
                credential: 'homeo',
                username: 'homeo',
            },
            {
                url: 'turn:turn.anyfirewall.com:443?transport=tcp',
                credential: 'webrtc',
                username: 'webrtc',
            },
        ];

        if (stunServer) {
            iceServers.push({
                url: stunServer,
            });
        }

        if (turnServer && turnServerUsername && turnServerCredential) {
            iceServers.push({
                url: turnServer,
                username: turnServerUsername,
                credential: turnServerCredential,
            });
        }

        const hub = signalhub(roomCode, [signalhubURL || 'https://baatcheet.herokuapp.com']);

        hub.subscribe('all').on('data', this.handleHubData.bind(this));

        const sw = swarm(
            hub,
            {
                config: {iceServers},
                uuid: myUuid,
                wrap: (outgoingSignalingData) => {
                    outgoingSignalingData.fromUserId = userId;
                    outgoingSignalingData.fromUsername = myUsername;

                    return outgoingSignalingData;
                },
            }
        );

        sw.on('peer', this.handleConnect.bind(this));

        sw.on('disconnect', this.handleDisconnect.bind(this));
        debug('Before Broadcast', myUsername);

        // Send initial connect signal
        hub.broadcast(
            roomCode,
            {
                fromUsername: myUsername,

                type: 'connect',
                from: myUuid,
                fromUserId: userId,

            }
        );
    }

    handleHubData(message) {
        const {swarmInitialized, myUuid, peerStreams} = this.state;

        if (!swarmInitialized) {
            this.setState({swarmInitialized: true});
        }
        debug('HUB DATA', message);
        if (message.type === 'connect' && message.from !== myUuid) {
            if (!peerStreams[message.from] && message.fromUsername) {
                debug('connecting to', {uuid: message.from, userId: message.fromUserId, username: message.fromUsername});

                const newPeerStreams = Object.assign({}, peerStreams);
                newPeerStreams[message.from] = {userId: message.fromUserId, username: message.fromUsername};
                this.setState({peerStreams: newPeerStreams});

                setTimeout(() => {
                    const {peerStreams} = this.state;

                    if (peerStreams[message.from] && !peerStreams[message.from].connected) {
                        const newPeerStreams = Object.assign({}, peerStreams);
                        delete newPeerStreams[message.from];
                        this.setState({peerStreams: newPeerStreams});
                    }
                }, 20000);
            }
        }
    }

    handleConnect(peer, id) {
        const {userId, audioOn, videoOn, audioEnabled, videoEnabled} = this.state;

        debug('connected to a new peer:', {id, peer});

        const peerStreams = Object.assign({}, this.state.peerStreams);
        const pkg = {
            peer,
            audioOn: true,
            videoOn: false,
        };
        peerStreams[id] = Object.assign({}, peerStreams[id], pkg);
        this.setState({peerStreams});

        peer.on('stream', (stream) => {
            const peerStreams = Object.assign({}, this.state.peerStreams);
            debug('received stream', stream);
            peerStreams[id].stream = stream;
            this.setState({peerStreams});
            const playBacks = Object.assign({}, this.state.playBacks);
            const aud = new Audio();
            aud.srcObject = stream;
            playBacks[id] = aud;
            aud.play();
            aud.muted = !this.state.speakerOn;
            this.setState({playBacks});
        });

        peer.on('data', (payload) => {
            const {myStream} = this.state;

            const data = JSON.parse(payload.toString());

            debug('received data', {id, data});

            if (data.type === 'receivedHandshake') {
                if (myStream) {
                    peer.addStream(myStream);
                }

                if (!audioOn || !audioEnabled) {
                    peer.send(JSON.stringify({type: 'audioToggle', enabled: false}));
                }
                if (!videoOn || !videoEnabled) {
                    peer.send(JSON.stringify({type: 'videoToggle', enabled: false}));
                }
            }

            if (data.type === 'sendHandshake') {
                const peerStreams = Object.assign({}, this.state.peerStreams);
                peerStreams[id].userId = data.userId;
                peerStreams[id].connected = true;
                peer.send(JSON.stringify({type: 'receivedHandshake'}));
                this.setState({peerStreams});
            }

            if (data.type === 'audioToggle') {
                const peerStreams = Object.assign({}, this.state.peerStreams);
                peerStreams[id].audioOn = data.enabled;
                this.setState({peerStreams});
            }

            if (data.type === 'videoToggle') {
                const peerStreams = Object.assign({}, this.state.peerStreams);
                peerStreams[id].videoOn = data.enabled;
                this.setState({peerStreams});
            }
        });

        peer.send(JSON.stringify({
            type: 'sendHandshake',
            userId,
        }));
    }

    handleDisconnect(peer, id) {
        debug('disconnected from a peer:', peer, id);

        const peerStreams = Object.assign({}, this.state.peerStreams);

        if (peerStreams[id]) {
            delete peerStreams[id];
            this.setState({peerStreams});
        }
    }

    handleAudioToggle() {
        const {peerStreams, myStream, audioOn} = this.state;
        if (myStream) {
            myStream.getAudioTracks()[0].enabled = !audioOn;

            for (const id of Object.keys(peerStreams)) {
                const peerStream = peerStreams[id];
                if (peerStream.connected) {
                    peerStream.peer.send(JSON.stringify({type: 'audioToggle', enabled: !audioOn}));
                }
            }
        }
        this.setState({
            audioOn: !audioOn,
        });
    }

    handleSpeakerToggle() {
        debug('Handle Speaker Toggle');
        const {playBacks, speakerOn} = this.state;

        for (const id of Object.keys(playBacks)) {
            const aud = playBacks[id];
            aud.muted = speakerOn;
            debug(id, 'Speaker On', aud.muted);
        }

        this.setState({
            speakerOn: !speakerOn,
        });
    }

    render() {
        // eslint-disable-next-line no-console
        const {
            userId, initialized, swarmInitialized, audioOn, speakerOn, peerStreams,
        } = this.state;
        const style = getStyle();

        debug('Render', userId, initialized, swarmInitialized, this.state, this.props);

        if (audioOn && !initialized) {
            this.handleRequestPerms();
        }

        if (initialized && !swarmInitialized) {
            this.connectToSwarm(userId);
        }
        return (
            <div style={style.container}>
                <div style={style.flexContainer}>
                    <p
                        style={style.text}
                    >{'VOICE CHANNEL'}</p>
                    <i
                        className={audioOn ? 'icon fa fa-microphone fa-lg' : 'icon fa fa-microphone-slash  fa-lg'}
                        style={style.button}
                        onClick={this.handleAudioToggle.bind(this)}
                    />
                    <i
                        className={speakerOn ? 'icon fa fa-volume-up fa-lg' : 'icon fa fa-volume-off fa-lg'}
                        style={style.button}
                        onClick={this.handleSpeakerToggle.bind(this)}
                    />
                </div>
                <ul style={style.list}>
                    {swarmInitialized && (
                        <li
                            style={style.listItem}

                            key={0}
                        >
                            <i
                                className={'icon fa fa-circle'}
                                style={style.online}
                            />{'You'}</li>)}
                    {Object.keys(peerStreams).map((id) => {
                        return (
                            <li
                                style={style.listItem}

                                key={id}
                            >
                                <i
                                    className={'icon fa fa-circle'}
                                    style={style.online}
                                />{peerStreams[id].username}</li>);
                    })}
                </ul>
            </div>
        );
    }
}

const mapStateToProps = (state) => {
    const currentUser = getCurrentUser(state);
    const profiles = getProfiles(state);
    const {configLoaded, signalhubURL, stunServer, turnServer, turnServerUsername, turnServerCredential} = state[`plugins-${pluginId}`];
    const config = getConfig(state);

    return {
        userId: currentUser.id,
        username: currentUser.username,
        currentUser,
        profiles,
        configLoaded,
        signalhubURL,
        stunServer,
        turnServer,
        turnServerUsername,
        turnServerCredential,
        config,
    };
};

const mapDispatchToProps = (dispatch) => bindActionCreators({initializeMyAudio, audioConnectToSwarm}, dispatch);

export default connect(mapStateToProps, mapDispatchToProps)(AudioCallPanel);

const getStyle = () => ({
    button: {
        margin: '5px',
        color: 'white',
        flexGrow: '1',
        padding: '3px',
    },
    text: {
        fontSize: '1em',
        marginLeft: '13px',
        marginTop: '5px',
        marginBottom: '5px',
        marginRight: '5px',
        color: 'white',
        fontWeight: '600',
        fontFamily: 'inherit',
        flexGrow: '6',

    },
    online: {
        color: '#4cd6a1',
        marginRight: '10px',
    },
    listItem: {
        color: 'white',
    },
    flexContainer: {
        display: 'flex',
    },
    list: {
        listStyleType: 'none',
    },
});
