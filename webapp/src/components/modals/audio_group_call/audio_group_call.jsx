/* eslint-disable react/prop-types */
/* eslint-disable no-shadow */
import {connect} from 'react-redux';
import React from 'react';
import {getCurrentUser, getProfiles} from 'mattermost-redux/selectors/entities/users';
import {getConfig} from 'mattermost-redux/selectors/entities/general';
import PropTypes from 'prop-types';
import swarm from 'webrtc-swarm';

import pluginSignalHub from '../../../utils/pluginSignalHub';
import {buildIceServers} from '../../../utils/iceServers';
import debug from '../../../utils/debug';
import {id as pluginId} from 'manifest';

const DIRECTORY_CHANNEL = 'voice-room-announce';
const voiceRoomsStorageKey = (diag) => `mattermost-webrtc-voice-rooms-${diag}`;

function genRoomId() {
    return `vr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

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
        const stream = await getMediaStream({audio});
        return {myStream: stream, audioEnabled: true, videoEnabled: false};
    } catch (err) {
        debug(err);
        return {myStream: null, audioEnabled: false, videoEnabled: false};
    }
}

class AudioCallPanel extends React.Component {
    static propTypes = {
        userId: PropTypes.string.isRequired,
        username: PropTypes.string,
        configLoaded: PropTypes.bool,
        stunServer: PropTypes.string,
        turnServer: PropTypes.string,
        turnServerUsername: PropTypes.string,
        turnServerCredential: PropTypes.string,
        config: PropTypes.object,
    };

    constructor(props) {
        super(props);

        const {
            stunServer,
            turnServer,
            turnServerUsername,
            turnServerCredential,
            configLoaded,
            config,
        } = props;

        this.state = {
            initialized: false,
            peerStreams: {},
            playBacks: {},
            swarmInitialized: false,
            audioOn: false,
            videoOn: false,
            audioEnabled: true,
            videoEnabled: false,
            speakerOn: false,
            stunServer,
            turnServer,
            turnServerUsername,
            turnServerCredential,
            configLoaded,
            config,
            activeRoom: null,
            channelList: [],
            newChannelNameDraft: '',
            showCreateInput: false,
        };

        this.swarmInstance = null;
        this.directoryHub = null;
        this.currentMyStream = null;
        this.connectPending = false;
        this.isUnmounted = false;
    }

    componentDidMount() {
        const {configLoaded, config} = this.props;
        if (configLoaded && config && config.DiagnosticId) {
            this.bootstrapDirectory();
        }
    }

    componentWillUnmount() {
        this.isUnmounted = true;
        this.cleanupConnection(() => {
            /* sync teardown */
        });
        if (this.directoryHub) {
            try {
                this.directoryHub.close();
            } catch (e) {
                /* ignore */
            }
            this.directoryHub = null;
        }
    }

    componentDidUpdate(prevProps) {
        const {configLoaded, config} = this.props;
        if ((!prevProps.configLoaded && configLoaded) || (prevProps.config?.DiagnosticId !== config?.DiagnosticId)) {
            if (config && config.DiagnosticId) {
                this.bootstrapDirectory();
            }
        }
    }

    loadSavedRooms(diag) {
        if (!diag) {
            return [];
        }
        try {
            const raw = localStorage.getItem(voiceRoomsStorageKey(diag));
            return raw ? JSON.parse(raw) : [];
        } catch (err) {
            return [];
        }
    }

    saveRooms(diag, list) {
        if (!diag) {
            return;
        }
        try {
            localStorage.setItem(voiceRoomsStorageKey(diag), JSON.stringify(list.slice(0, 80)));
        } catch (e) {
            /* ignore */
        }
    }

    mergeRoom(entry) {
        const {roomId, name} = entry;
        if (!roomId || !name) {
            return;
        }
        this.setState((prev) => {
            const next = [...prev.channelList];
            const i = next.findIndex((r) => r.roomId === roomId);
            const row = {roomId, name, ts: entry.ts || Date.now()};
            if (i >= 0) {
                next[i] = {...next[i], ...row};
            } else {
                next.push(row);
            }
            next.sort((a, b) => a.name.localeCompare(b.name));
            const {config} = this.props;
            if (config && config.DiagnosticId) {
                this.saveRooms(config.DiagnosticId, next);
            }
            return {channelList: next};
        });
    }

    bootstrapDirectory() {
        const {config, configLoaded} = this.props;
        if (!configLoaded || !config || !config.DiagnosticId) {
            return;
        }
        const diag = config.DiagnosticId;
        if (this.directoryHub) {
            return;
        }
        const saved = this.loadSavedRooms(diag);
        this.setState((prev) => {
            const merged = [...saved];
            for (const r of prev.channelList) {
                if (!merged.find((m) => m.roomId === r.roomId)) {
                    merged.push(r);
                }
            }
            merged.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            return {channelList: merged};
        });

        const hubName = `mattermost-webrtc-video-${diag}-voice-directory`;
        const hub = pluginSignalHub(hubName);
        this.directoryHub = hub;
        const stream = hub.subscribe(DIRECTORY_CHANNEL);
        stream.on('data', (msg) => {
            if (msg && msg.type === 'voice-room' && msg.roomId && msg.name) {
                this.mergeRoom({
                    roomId: msg.roomId,
                    name: msg.name,
                    ts: msg.ts,
                });
            }
        });
    }

    announceRoom(roomId, name) {
        const {config, configLoaded, userId} = this.props;
        if (!configLoaded || !config || !config.DiagnosticId) {
            return;
        }
        const hubName = `mattermost-webrtc-video-${config.DiagnosticId}-voice-directory`;
        const hub = pluginSignalHub(hubName);
        hub.broadcast(DIRECTORY_CHANNEL, {
            type: 'voice-room',
            roomId,
            name,
            userId,
            ts: Date.now(),
        });
        hub.close();
    }

    cleanupConnection(done) {
        const finish = typeof done === 'function' ? done : function noopCallback() {
            /* optional async completion */
        };

        Object.values(this.state.playBacks || {}).forEach((aud) => {
            try {
                aud.pause();
                aud.srcObject = null;
            } catch (e) {
                /* ignore */
            }
        });

        if (this.currentMyStream) {
            try {
                this.currentMyStream.getTracks().forEach((t) => t.stop());
            } catch (e) {
                /* ignore */
            }
            this.currentMyStream = null;
        }

        if (this.swarmInstance) {
            const sw = this.swarmInstance;
            this.swarmInstance = null;
            sw.close(() => {
                finish();
            });
            return;
        }

        finish();
    }

    leaveRoomInternal(cb) {
        this.cleanupConnection(() => {
            this.connectPending = false;
            if (this.isUnmounted) {
                if (typeof cb === 'function') {
                    cb();
                }
                return;
            }
            this.setState({
                activeRoom: null,
                initialized: false,
                swarmInitialized: false,
                peerStreams: {},
                playBacks: {},
                audioOn: false,
                speakerOn: false,
            }, cb);
        });
    }

    handleLeaveRoom = (e) => {
        if (e && e.preventDefault) {
            e.preventDefault();
        }
        this.leaveRoomInternal(() => {
            /* modal closed */
        });
    };

    handleJoinRoom = (roomId, name) => (e) => {
        if (e && e.preventDefault) {
            e.preventDefault();
        }
        const {activeRoom} = this.state;
        if (activeRoom && activeRoom.roomId === roomId) {
            return;
        }
        this.cleanupConnection(() => {
            this.connectPending = false;
            if (this.isUnmounted) {
                return;
            }
            this.setState({
                activeRoom: {roomId, name},
                initialized: false,
                swarmInitialized: false,
                peerStreams: {},
                playBacks: {},
                audioOn: false,
                audioEnabled: true,
                videoEnabled: false,
            });
        });
    };

    handleCreateChannel = (e) => {
        if (e && e.preventDefault) {
            e.preventDefault();
        }
        const name = (this.state.newChannelNameDraft || '').trim();
        if (!name) {
            return;
        }
        const roomId = genRoomId();
        this.mergeRoom({roomId, name, ts: Date.now()});
        this.announceRoom(roomId, name);
        this.setState({
            showCreateInput: false,
            newChannelNameDraft: '',
        }, () => {
            this.handleJoinRoom(roomId, name)();
        });
    };

    handleToggleCreate = (e) => {
        if (e && e.preventDefault) {
            e.preventDefault();
        }
        this.setState((p) => ({
            showCreateInput: !p.showCreateInput,
            newChannelNameDraft: p.showCreateInput ? '' : p.newChannelNameDraft,
        }));
    };

    async handleRequestPerms() {
        const {myStream, audioEnabled, videoEnabled} = await getMyStream();
        debug({audioEnabled, videoEnabled});
        this.currentMyStream = myStream;
        this.setState({initialized: true, myStream, audioEnabled, videoEnabled});
    }

    connectToSwarm(userId) {
        const {activeRoom} = this.state;
        const {
            stunServer,
            turnServer,
            turnServerUsername,
            turnServerCredential,
            configLoaded,
            config,
        } = this.props;

        if (!configLoaded || !activeRoom || !config || !config.DiagnosticId) {
            return;
        }

        if (this.swarmInstance || this.connectPending) {
            return;
        }

        this.connectPending = true;

        const myUuid = this.props.userId;
        const myUsername = this.props.username;
        const voiceHubName = `mattermost-webrtc-video-${config.DiagnosticId}-voice-${activeRoom.roomId}`;
        debug('Voice hub', voiceHubName);
        const iceServers = buildIceServers(stunServer, turnServer, turnServerUsername, turnServerCredential);

        const hub = pluginSignalHub(voiceHubName);
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
            },
        );

        this.swarmInstance = sw;
        this.connectPending = false;

        sw.on('peer', this.handleConnect.bind(this));
        sw.on('disconnect', this.handleDisconnect.bind(this));

        hub.broadcast('all', {
            type: 'connect',
            from: myUuid,
            fromUserId: userId,
            fromUsername: myUsername,
        });
    }

    handleHubData(message) {
        const {swarmInitialized, peerStreams} = this.state;
        const myUuid = this.props.userId;

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
                    this.setState((prev) => {
                        const ps = prev.peerStreams;
                        if (ps[message.from] && !ps[message.from].connected) {
                            const next = Object.assign({}, ps);
                            delete next[message.from];
                            return {peerStreams: next};
                        }
                        return null;
                    });
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
            const nextPeers = Object.assign({}, this.state.peerStreams);
            debug('received stream', stream);
            nextPeers[id].stream = stream;
            this.setState({peerStreams: nextPeers});
            const playBacks = Object.assign({}, this.state.playBacks);
            const aud = document.createElement('audio');
            aud.srcObject = stream;
            playBacks[id] = aud;
            aud.play();
            aud.muted = !this.state.speakerOn;
            this.setState({playBacks});
        });

        peer.on('data', (payload) => {
            const data = JSON.parse(payload.toString());

            debug('received data', {id, data});

            if (data.type === 'receivedHandshake') {
                if (this.currentMyStream) {
                    peer.addStream(this.currentMyStream);
                }

                if (!audioOn || !audioEnabled) {
                    peer.send(JSON.stringify({type: 'audioToggle', enabled: false}));
                }
                if (!videoOn || !videoEnabled) {
                    peer.send(JSON.stringify({type: 'videoToggle', enabled: false}));
                }
            }

            if (data.type === 'sendHandshake') {
                const ps = Object.assign({}, this.state.peerStreams);
                ps[id].userId = data.userId;
                ps[id].connected = true;
                peer.send(JSON.stringify({type: 'receivedHandshake'}));
                this.setState({peerStreams: ps});
            }

            if (data.type === 'audioToggle') {
                const ps = Object.assign({}, this.state.peerStreams);
                ps[id].audioOn = data.enabled;
                this.setState({peerStreams: ps});
            }

            if (data.type === 'videoToggle') {
                const ps = Object.assign({}, this.state.peerStreams);
                ps[id].videoOn = data.enabled;
                this.setState({peerStreams: ps});
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
        const {peerStreams, audioOn} = this.state;
        if (this.currentMyStream) {
            const tracks = this.currentMyStream.getAudioTracks();
            if (tracks[0]) {
                tracks[0].enabled = !audioOn;
            }

            for (const pid of Object.keys(peerStreams)) {
                const peerStream = peerStreams[pid];
                if (peerStream.connected && peerStream.peer) {
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
        const {
            userId,
            initialized,
            swarmInitialized,
            audioOn,
            speakerOn,
            peerStreams,
            activeRoom,
            channelList,
            showCreateInput,
            newChannelNameDraft,
        } = this.state;
        const style = getStyle();

        debug('Render', userId, initialized, swarmInitialized, this.state, this.props);

        if (activeRoom && audioOn && !initialized) {
            this.handleRequestPerms();
        }

        if (activeRoom && initialized && !swarmInitialized && !this.connectPending && !this.swarmInstance) {
            this.connectToSwarm(userId);
        }

        return (
            <div style={style.container}>
                {!activeRoom && (
                    <div style={style.section}>
                        <div style={style.sectionHeader}>
                            <span style={style.sectionTitle}>{'Voice channels'}</span>
                            <button
                                type='button'
                                style={style.linkBtn}
                                onClick={this.handleToggleCreate}
                            >
                                {showCreateInput ? 'Cancel' : '+ New'}
                            </button>
                        </div>
                        {showCreateInput && (
                            <div style={style.createBox}>
                                <label
                                    htmlFor='webrtc-voice-channel-name'
                                    style={style.label}
                                >
                                    {'Name this voice channel'}
                                </label>
                                <input
                                    id='webrtc-voice-channel-name'
                                    type='text'
                                    style={style.input}
                                    placeholder='e.g. Standup, Sprint planning…'
                                    value={newChannelNameDraft}
                                    onChange={(ev) => this.setState({newChannelNameDraft: ev.target.value})}
                                    onKeyDown={(ev) => {
                                        if (ev.key === 'Enter') {
                                            this.handleCreateChannel(ev);
                                        }
                                    }}
                                />
                                <button
                                    type='button'
                                    style={style.primaryBtn}
                                    onClick={this.handleCreateChannel}
                                >
                                    {'Create and join'}
                                </button>
                            </div>
                        )}
                        <ul style={style.roomList}>
                            {channelList.length === 0 && !showCreateInput && (
                                <li style={style.roomHint}>{'No channels yet — create one or wait for a teammate to announce one.'}</li>
                            )}
                            {channelList.map((r) => (
                                <li
                                    key={r.roomId}
                                    style={style.roomRow}
                                >
                                    <span style={style.roomName}>{r.name}</span>
                                    <button
                                        type='button'
                                        style={style.joinBtn}
                                        onClick={this.handleJoinRoom(r.roomId, r.name)}
                                    >
                                        {'Join'}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {activeRoom && (
                    <div style={style.section}>
                        <div style={style.inRoomHeader}>
                            <span style={style.inRoomTitle}>{activeRoom.name}</span>
                            <button
                                type='button'
                                style={style.leaveBtn}
                                onClick={this.handleLeaveRoom}
                                title='Leave voice channel'
                            >
                                {'Leave'}
                            </button>
                        </div>
                        <div style={style.flexContainer}>
                            <i
                                className={audioOn ? 'icon fa fa-microphone fa-lg' : 'icon fa fa-microphone-slash  fa-lg'}
                                style={style.button}
                                onClick={this.handleAudioToggle.bind(this)}
                                role='button'
                                tabIndex={0}
                                onKeyDown={(ev) => ev.key === 'Enter' && this.handleAudioToggle()}
                            />
                            <i
                                className={speakerOn ? 'icon fa fa-volume-up fa-lg' : 'icon fa fa-volume-off fa-lg'}
                                style={style.button}
                                onClick={this.handleSpeakerToggle.bind(this)}
                                role='button'
                                tabIndex={0}
                                onKeyDown={(ev) => ev.key === 'Enter' && this.handleSpeakerToggle()}
                            />
                        </div>
                        <p style={style.hint}>{'Turn the microphone on to connect and speak.'}</p>
                        <ul style={style.list}>
                            {swarmInitialized && (
                                <li
                                    style={style.listItem}
                                    key='self'
                                >
                                    <i
                                        className={'icon fa fa-circle'}
                                        style={style.online}
                                    />
                                    {'You'}
                                </li>
                            )}
                            {Object.keys(peerStreams).map((id) => (
                                <li
                                    key={id}
                                    style={style.listItem}
                                >
                                    <i
                                        className={'icon fa fa-circle'}
                                        style={style.online}
                                    />
                                    {peerStreams[id].username || id}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        );
    }
}

const mapStateToProps = (state) => {
    const currentUser = getCurrentUser(state);
    const profiles = getProfiles(state);
    const {configLoaded, stunServer, turnServer, turnServerUsername, turnServerCredential} = state[`plugins-${pluginId}`];
    const config = getConfig(state);

    return {
        userId: currentUser.id,
        username: currentUser.username,
        currentUser,
        profiles,
        configLoaded,
        stunServer,
        turnServer,
        turnServerUsername,
        turnServerCredential,
        config,
    };
};

export default connect(mapStateToProps)(AudioCallPanel);

const getStyle = () => ({
    container: {
        padding: '4px 0 8px',
    },
    section: {
        marginTop: 4,
    },
    sectionHeader: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 10px 6px',
    },
    sectionTitle: {
        fontSize: '0.78em',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        color: 'rgba(255,255,255,0.65)',
    },
    linkBtn: {
        border: 'none',
        background: 'transparent',
        color: '#5b9cf8',
        cursor: 'pointer',
        fontSize: '0.85em',
        fontWeight: 600,
        padding: '2px 4px',
        fontFamily: 'inherit',
    },
    createBox: {
        padding: '0 10px 10px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        marginBottom: 8,
    },
    label: {
        display: 'block',
        fontSize: '0.82em',
        color: 'rgba(255,255,255,0.85)',
        marginBottom: 6,
        fontWeight: 500,
    },
    input: {
        width: '100%',
        boxSizing: 'border-box',
        padding: '8px 10px',
        borderRadius: 4,
        border: '1px solid rgba(255,255,255,0.2)',
        background: 'rgba(0,0,0,0.25)',
        color: '#fff',
        fontSize: '0.9em',
        marginBottom: 8,
        fontFamily: 'inherit',
    },
    primaryBtn: {
        width: '100%',
        padding: '8px 12px',
        borderRadius: 4,
        border: 'none',
        background: '#166de0',
        color: '#fff',
        fontWeight: 600,
        cursor: 'pointer',
        fontSize: '0.88em',
        fontFamily: 'inherit',
    },
    roomList: {
        listStyleType: 'none',
        margin: 0,
        padding: '0 10px',
        maxHeight: '220px',
        overflowY: 'auto',
    },
    roomRow: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        padding: '6px 0',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        color: '#fff',
        fontSize: '0.9em',
    },
    roomName: {
        flex: 1,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
    },
    joinBtn: {
        flexShrink: 0,
        padding: '4px 10px',
        borderRadius: 4,
        border: 'none',
        background: 'rgba(91, 156, 248, 0.25)',
        color: '#9ec5ff',
        fontWeight: 600,
        cursor: 'pointer',
        fontSize: '0.82em',
        fontFamily: 'inherit',
    },
    roomHint: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: '0.82em',
        lineHeight: 1.35,
        padding: '8px 0',
    },
    inRoomHeader: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 10px 8px',
        gap: 8,
    },
    inRoomTitle: {
        color: '#fff',
        fontWeight: 600,
        fontSize: '0.95em',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
    },
    leaveBtn: {
        flexShrink: 0,
        padding: '4px 10px',
        borderRadius: 4,
        border: '1px solid rgba(255,255,255,0.25)',
        background: 'transparent',
        color: 'rgba(255,255,255,0.9)',
        cursor: 'pointer',
        fontSize: '0.82em',
        fontFamily: 'inherit',
    },
    hint: {
        margin: '0 10px 8px',
        fontSize: '0.78em',
        color: 'rgba(255,255,255,0.45)',
        lineHeight: 1.3,
    },
    button: {
        margin: '5px',
        color: 'white',
        flexGrow: '1',
        padding: '3px',
        cursor: 'pointer',
    },
    flexContainer: {
        display: 'flex',
        padding: '0 10px',
    },
    list: {
        listStyleType: 'none',
        margin: 0,
        padding: '0 10px',
    },
    listItem: {
        color: 'white',
        fontSize: '0.88em',
        padding: '2px 0',
    },
    online: {
        color: '#4cd6a1',
        marginRight: '10px',
    },
});
