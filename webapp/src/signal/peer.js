/**
 * One WebRTC connection to a remote participant, built directly on
 * RTCPeerConnection using the "perfect negotiation" pattern
 * (https://w3c.github.io/webrtc-pc/#perfect-negotiation-example), so either side
 * may (re)negotiate at any time — e.g. when screen sharing adds a track — and
 * offer collisions resolve deterministically via the `polite` flag.
 *
 * Events: 'connect', 'stream' (MediaStream), 'track' (track, stream),
 * 'data' (string), 'close'.
 */
import debug from '../utils/debug';

import Emitter from './emitter';

const CONNECT_TIMEOUT_MS = 30000;
const DISCONNECTED_GRACE_MS = 10000;

export default class Peer extends Emitter {
    /**
     * @param {object} opts
     * @param {string} opts.id remote mesh id
     * @param {boolean} opts.polite whether this side yields on offer collisions
     * @param {RTCIceServer[]} opts.iceServers
     * @param {MediaStream} [opts.stream] local media to send
     * @param {function(object)} opts.signal sends a signalling message to the remote side
     */
    constructor({id, polite, iceServers, stream, signal, connectTimeoutMs = CONNECT_TIMEOUT_MS, PeerConnection}) {
        super();
        const PC = PeerConnection || window.RTCPeerConnection;
        this.id = id;
        this.polite = polite;
        this.signal = signal;
        this.pc = new PC({iceServers});
        this.remoteStreams = [];
        this.senders = new Map(); // local track -> RTCRtpSender
        this.pendingCandidates = [];
        this.outbox = [];
        this.makingOffer = false;
        this.ignoreOffer = false;
        this.iceRestarted = false;
        this.connected = false;
        this.destroyed = false;
        this.queue = Promise.resolve();
        this.timers = {};

        // A pre-negotiated channel exists on both sides without its own offer/answer.
        this.channel = this.pc.createDataChannel('control', {negotiated: true, id: 0});
        this.channel.onopen = () => {
            this.outbox.splice(0).forEach((m) => this.channel.send(m));
            this.checkConnected();
        };
        this.channel.onmessage = (e) => this.emit('data', e.data);

        if (stream) {
            stream.getTracks().forEach((track) => this.senders.set(track, this.pc.addTrack(track, stream)));
        } else {
            // Listen-only participants still need to receive audio.
            this.pc.addTransceiver('audio', {direction: 'recvonly'});
        }

        this.pc.onnegotiationneeded = () => this.negotiate();
        this.pc.onicecandidate = ({candidate}) => {
            if (candidate) {
                this.signal({candidate});
            }
        };
        this.pc.ontrack = ({track, streams}) => {
            const remote = (streams && streams[0]) || this.remoteStreams[0] || new MediaStream([track]);
            if (!this.remoteStreams.includes(remote)) {
                this.remoteStreams.push(remote);
                this.emit('stream', remote);
            }
            this.emit('track', track, remote);
        };
        this.pc.onconnectionstatechange = () => this.onConnectionState();

        this.timers.connect = setTimeout(() => {
            if (!this.connected) {
                debug('peer: connect timeout', id);
                this.destroy();
            }
        }, connectTimeoutMs);
    }

    async negotiate() {
        if (this.destroyed) {
            return;
        }
        try {
            this.makingOffer = true;
            await this.pc.setLocalDescription();
            this.signal({description: this.pc.localDescription});
        } catch (e) {
            debug('peer: offer failed', e);
        } finally {
            this.makingOffer = false;
        }
    }

    /** Applies a remote signalling message. Calls are serialised. */
    handleSignal(data) {
        this.queue = this.queue.then(() => this.applySignal(data || {}));
        return this.queue;
    }

    async applySignal({description, candidate}) {
        if (this.destroyed) {
            return;
        }
        try {
            if (description) {
                const collision = description.type === 'offer' &&
                    (this.makingOffer || this.pc.signalingState !== 'stable');
                this.ignoreOffer = !this.polite && collision;
                if (this.ignoreOffer) {
                    return;
                }
                await this.pc.setRemoteDescription(description);
                const queued = this.pendingCandidates.splice(0);
                for (const c of queued) {
                    await this.addCandidate(c); // eslint-disable-line no-await-in-loop
                }
                if (description.type === 'offer') {
                    await this.pc.setLocalDescription();
                    this.signal({description: this.pc.localDescription});
                }
            } else if (candidate) {
                if (this.pc.remoteDescription) {
                    await this.addCandidate(candidate);
                } else {
                    this.pendingCandidates.push(candidate);
                }
            }
        } catch (e) {
            debug('peer: signalling error', e);
        }
    }

    async addCandidate(candidate) {
        try {
            await this.pc.addIceCandidate(candidate);
        } catch (e) {
            if (!this.ignoreOffer) {
                debug('peer: bad ICE candidate', e);
            }
        }
    }

    onConnectionState() {
        const state = this.pc.connectionState;
        clearTimeout(this.timers.disconnected);
        if (state === 'connected') {
            this.checkConnected();
        } else if (state === 'disconnected') {
            this.timers.disconnected = setTimeout(() => this.recover(), DISCONNECTED_GRACE_MS);
        } else if (state === 'failed') {
            this.recover();
        } else if (state === 'closed') {
            this.destroy();
        }
    }

    /** One ICE restart attempt (e.g. after a network change), then give up. */
    recover() {
        if (this.destroyed || this.pc.connectionState === 'connected') {
            return;
        }
        if (this.iceRestarted || typeof this.pc.restartIce !== 'function') {
            this.destroy();
            return;
        }
        debug('peer: restarting ICE', this.id);
        this.iceRestarted = true;
        this.pc.restartIce();
        this.timers.disconnected = setTimeout(() => this.recover(), CONNECT_TIMEOUT_MS / 2);
    }

    checkConnected() {
        if (this.connected || this.destroyed) {
            return;
        }
        if (this.pc.connectionState === 'connected' && this.channel.readyState === 'open') {
            this.connected = true;
            this.iceRestarted = false;
            clearTimeout(this.timers.connect);
            this.emit('connect');
        }
    }

    send(message) {
        if (this.destroyed) {
            return;
        }
        if (this.channel.readyState === 'open') {
            this.channel.send(message);
        } else {
            this.outbox.push(message);
        }
    }

    async replaceTrack(oldTrack, newTrack) {
        const sender = this.senders.get(oldTrack);
        if (!sender) {
            throw new Error('track is not being sent');
        }
        await sender.replaceTrack(newTrack);
        this.senders.delete(oldTrack);
        this.senders.set(newTrack, sender);
    }

    addTrack(track, stream) {
        this.senders.set(track, this.pc.addTrack(track, stream));
    }

    removeTrack(track) {
        const sender = this.senders.get(track);
        if (sender) {
            this.pc.removeTrack(sender);
            this.senders.delete(track);
        }
    }

    destroy() {
        if (this.destroyed) {
            return;
        }
        this.destroyed = true;
        Object.values(this.timers).forEach(clearTimeout);
        try {
            this.channel.close();
            this.pc.close();
        } catch (e) {
            // ignore
        }
        this.emit('close');
    }
}
