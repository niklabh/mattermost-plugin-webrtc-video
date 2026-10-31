/**
 * A full-mesh of WebRTC peers sharing one signalling namespace.
 *
 * Topics (via the plugin's SSE signalling API):
 *   <namespace>/all   announcements: {type: 'hello' | 'bye', from}
 *   <namespace>/<id>  direct messages to one participant: hello, signal, bye
 *
 * Every participant has a mesh id "<userId>.<random>". Messages whose id does
 * not belong to the server-verified sender (`_sender`) are dropped, and
 * `allowedUserIds` can restrict who may join (e.g. the two people in a call).
 *
 * Events: 'peer' (peer, id) once connected, 'disconnect' (peer, id).
 */
import debug from '../utils/debug';

import Emitter from './emitter';
import createHub, {makeMeshId, verifiedMessageFilter} from './hub';
import Peer from './peer';

const HELLO_FAST_MS = 3000;
const HELLO_SLOW_MS = 15000;
const FAST_PHASE_MS = 15000;

function noop() {
    // ignore
}

export default class Mesh extends Emitter {
    constructor({namespace, userId, stream, iceServers, maxPeers = Infinity, allowedUserIds, hub, createPeer}) {
        super();
        this.id = makeMeshId(userId);
        this.stream = stream || null;
        this.iceServers = iceServers;
        this.maxPeers = maxPeers;
        this.hub = hub || createHub(namespace);
        this.createPeer = createPeer || ((opts) => new Peer(opts));
        this.verify = verifiedMessageFilter(allowedUserIds);
        this.peers = new Map();
        this.sendQueues = new Map();
        this.closed = false;
        this.startedAt = Date.now();

        let opened = 0;
        const onOpen = () => {
            opened++;
            if (opened >= 2) {
                this.sayHello(); // also re-announces after an SSE reconnect
            }
        };
        this.unsubscribers = [
            this.hub.subscribe('all', (m) => this.onMessage(m, false), {onOpen}),
            this.hub.subscribe(this.id, (m) => this.onMessage(m, true), {onOpen}),
        ];
        this.scheduleHello();
    }

    scheduleHello() {
        const delay = Date.now() - this.startedAt < FAST_PHASE_MS ? HELLO_FAST_MS : HELLO_SLOW_MS;
        this.helloTimer = setTimeout(() => {
            if (this.closed) {
                return;
            }
            if (this.peers.size < this.maxPeers) {
                this.sayHello();
            }
            this.scheduleHello();
        }, delay);
    }

    sayHello() {
        this.hub.publish('all', {type: 'hello', from: this.id}).catch(noop);
    }

    /** Sends to one participant; per-recipient ordering is preserved. */
    sendTo(id, message) {
        const prev = this.sendQueues.get(id) || Promise.resolve();
        const next = prev.then(() => this.hub.publish(id, {...message, from: this.id})).catch((e) => {
            debug('mesh: send failed', e);
        });
        this.sendQueues.set(id, next);
        return next;
    }

    onMessage(raw, direct) {
        const msg = this.verify(raw);
        if (this.closed || !msg || msg.from === this.id) {
            return;
        }
        switch (msg.type) {
        case 'hello':
            // Answer broadcast hellos directly so the newcomer learns about us at once.
            this.ensurePeer(msg.from, !direct);
            break;
        case 'signal':
            if (direct) {
                const peer = this.ensurePeer(msg.from, false);
                if (peer) {
                    peer.handleSignal(msg.data);
                }
            }
            break;
        case 'bye': {
            const peer = this.peers.get(msg.from);
            if (peer) {
                peer.destroy();
            }
            break;
        }
        default:
            break;
        }
    }

    ensurePeer(id, replyHello) {
        const existing = this.peers.get(id);
        if (existing) {
            return existing;
        }
        if (this.peers.size >= this.maxPeers) {
            return null;
        }
        const peer = this.createPeer({
            id,
            polite: this.id > id,
            iceServers: this.iceServers,
            stream: this.stream,
            signal: (data) => this.sendTo(id, {type: 'signal', data}),
        });
        this.peers.set(id, peer);
        peer.on('connect', () => {
            if (!this.closed) {
                this.emit('peer', peer, id);
            }
        });
        peer.on('close', () => {
            if (this.peers.get(id) === peer) {
                this.peers.delete(id);
                this.sendQueues.delete(id);
                if (peer.connected && !this.closed) {
                    this.emit('disconnect', peer, id);
                }
            }
        });
        if (replyHello) {
            this.sendTo(id, {type: 'hello'});
        }
        return peer;
    }

    close() {
        if (this.closed) {
            return;
        }

        // Tell others right away instead of letting them wait for ICE to fail.
        this.hub.publish('all', {type: 'bye', from: this.id}).catch(noop);
        this.closed = true;
        clearTimeout(this.helloTimer);
        this.peers.forEach((peer) => peer.destroy());
        this.peers.clear();
        this.unsubscribers.forEach((unsubscribe) => unsubscribe());
        this.hub.close();
    }
}
