/**
 * A mesh voice session for one voice channel. Each participant connects
 * directly to every other participant, so rooms are capped at MAX_PARTICIPANTS.
 */
import {getMicrophone, stopStream, watchSpeaking} from '../call/media';
import {userIdFromMeshId} from '../signal/hub';
import Mesh from '../signal/mesh';
import debug from '../utils/debug';

export const MAX_PARTICIPANTS = 8;

export default class VoiceSession {
    constructor({roomId, userId, iceServers, onChange}) {
        this.roomId = roomId;
        this.userId = userId;
        this.iceServers = iceServers;
        this.onChange = onChange;

        this.mesh = null;
        this.stream = null;
        this.closed = false;
        this.peers = new Map(); // meshId -> {peer, audio, stopMeter}
        this.stopSelfMeter = null;

        this.state = {
            status: 'connecting',
            error: null,
            muted: true,
            deafened: false,
            selfSpeaking: false,
            participants: {}, // meshId -> {userId, muted, speaking}
        };
    }

    setState(patch) {
        if (this.closed) {
            return;
        }
        this.state = {...this.state, ...patch};
        this.onChange(this.state);
    }

    setParticipant(id, patch) {
        const prev = this.state.participants[id];
        if (!prev && !patch.userId) {
            return;
        }
        this.setState({participants: {...this.state.participants, [id]: {muted: true, speaking: false, ...prev, ...patch}}});
    }

    async join() {
        try {
            this.stream = await getMicrophone();
            this.stream.getAudioTracks().forEach((t) => {
                t.enabled = false; // join muted
            });
        } catch (err) {
            // Listen-only: the user can still hear others.
            this.setState({error: err.message});
        }
        if (this.closed) {
            stopStream(this.stream);
            return;
        }
        if (this.stream) {
            this.stopSelfMeter = watchSpeaking(this.stream, (speaking) => this.setState({selfSpeaking: speaking}));
        }

        this.mesh = new Mesh({
            namespace: `voice/${this.roomId}`,
            userId: this.userId,
            stream: this.stream,
            iceServers: this.iceServers,
            maxPeers: MAX_PARTICIPANTS - 1,
        });
        this.mesh.on('peer', (peer, id) => this.handlePeer(peer, id));
        this.mesh.on('disconnect', (peer, id) => this.handleDisconnect(peer, id));
        this.setState({status: 'connected'});
    }

    handlePeer(peer, id) {
        if (this.closed) {
            return;
        }
        debug('voice: peer joined', id);
        const entry = {peer, audio: null, stopMeter: null};
        this.peers.set(id, entry);
        this.setParticipant(id, {userId: userIdFromMeshId(id)});

        const attach = (stream) => {
            if (entry.audio || this.closed) {
                return;
            }
            const audio = new Audio();
            audio.autoplay = true;
            audio.srcObject = stream;
            audio.muted = this.state.deafened;
            audio.play().catch(() => {
                // autoplay will resume on the next user gesture
            });
            entry.audio = audio;
            entry.stopMeter = watchSpeaking(stream, (speaking) => this.setParticipant(id, {speaking}));
        };
        peer.on('stream', attach);
        peer.remoteStreams.forEach(attach);

        peer.on('data', (raw) => {
            try {
                const data = JSON.parse(raw.toString());
                if (data.type === 'state') {
                    this.setParticipant(id, {muted: Boolean(data.muted)});
                }
            } catch (e) {
                // ignore malformed data
            }
        });
        this.sendState(peer);
    }

    handleDisconnect(peer, id) {
        const entry = this.peers.get(id);
        if (!entry || entry.peer !== peer) {
            return;
        }
        this.cleanupPeer(entry);
        this.peers.delete(id);
        const participants = {...this.state.participants};
        delete participants[id];
        this.setState({participants});
    }

    cleanupPeer(entry) {
        if (entry.stopMeter) {
            entry.stopMeter();
        }
        if (entry.audio) {
            entry.audio.pause();
            entry.audio.srcObject = null;
        }
    }

    sendState(peer) {
        const msg = JSON.stringify({type: 'state', muted: this.state.muted});
        const targets = peer ? [peer] : [...this.peers.values()].map((e) => e.peer);
        targets.forEach((p) => {
            try {
                p.send(msg);
            } catch (e) {
                // peer not ready
            }
        });
    }

    setMuted(muted) {
        if (!this.stream) {
            return;
        }
        this.stream.getAudioTracks().forEach((t) => {
            t.enabled = !muted;
        });
        this.setState({muted});
        this.sendState();
    }

    setDeafened(deafened) {
        this.peers.forEach((entry) => {
            if (entry.audio) {
                entry.audio.muted = deafened;
            }
        });
        this.setState({deafened});
        if (deafened && !this.state.muted) {
            this.setMuted(true);
        }
    }

    leave() {
        if (this.closed) {
            return;
        }
        this.closed = true;
        this.peers.forEach((entry) => this.cleanupPeer(entry));
        this.peers.clear();
        if (this.stopSelfMeter) {
            this.stopSelfMeter();
        }
        if (this.mesh) {
            try {
                this.mesh.close();
            } catch (e) {
                // ignore
            }
        }
        stopStream(this.stream);
        this.stream = null;
    }
}
