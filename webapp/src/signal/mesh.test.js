import Mesh from './mesh';
import Peer from './peer';

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, timeout = 2000) {
    const start = Date.now();
    while (!fn()) {
        if (Date.now() - start > timeout) {
            throw new Error('timed out waiting for condition');
        }
        await tick(5); // eslint-disable-line no-await-in-loop
    }
}

// --- Fake WebRTC -----------------------------------------------------------

let pcs = [];

class FakeChannel {
    constructor(pc) {
        this.pc = pc;
        this.readyState = 'connecting';
        this.sent = [];
    }

    send(m) {
        this.sent.push(m);
        const twin = pcs.find((p) => p !== this.pc && p.key && p.key === this.pc.key);
        if (twin && twin.channel.onmessage) {
            twin.channel.onmessage({data: m});
        }
    }

    close() {
        this.readyState = 'closed';
    }
}

/** Models the RTCPeerConnection signalling state machine closely enough for perfect negotiation. */
class FakePC {
    constructor(config) {
        this.config = config;
        this.signalingState = 'stable';
        this.connectionState = 'new';
        this.localDescription = null;
        this.remoteDescription = null;
        this.senders = [];
        this.transceivers = [];
        this.candidates = [];
        this.offers = 0;
        pcs.push(this);
    }

    createDataChannel(label, init) {
        this.channel = new FakeChannel(this);
        this.channelInit = init;
        this.needsNegotiation();
        return this.channel;
    }

    addTrack(track) {
        const sender = {track,
            replaceTrack: jest.fn(async (t) => { // eslint-disable-line require-await
                sender.track = t;
            })};
        this.senders.push(sender);
        this.needsNegotiation();
        return sender;
    }

    removeTrack(sender) {
        this.senders = this.senders.filter((s) => s !== sender);
        this.needsNegotiation();
    }

    addTransceiver(kind, init) {
        this.transceivers.push({kind, init});
        this.needsNegotiation();
    }

    needsNegotiation() {
        if (this.queued) {
            return;
        }
        this.queued = true;
        queueMicrotask(() => {
            this.queued = false;
            if (this.signalingState === 'stable' && this.onnegotiationneeded) {
                this.onnegotiationneeded();
            }
        });
    }

    async setLocalDescription() {
        await tick();
        if (this.signalingState === 'have-remote-offer') {
            this.localDescription = {type: 'answer', sdp: 'answer'};
            this.signalingState = 'stable';
            this.transportReady();
        } else {
            this.offers++;
            this.localDescription = {type: 'offer', sdp: `offer-${this.offers}`};
            this.signalingState = 'have-local-offer';
            queueMicrotask(() => this.onicecandidate && this.onicecandidate({candidate: {candidate: 'host-candidate'}}));
        }
    }

    async setRemoteDescription(desc) {
        await tick();
        if (desc.type === 'offer') {
            if (this.signalingState === 'have-local-offer') {
                this.signalingState = 'stable'; // implicit rollback
            }
            this.remoteDescription = desc;
            this.signalingState = 'have-remote-offer';
        } else {
            if (this.signalingState !== 'have-local-offer') {
                throw new Error(`answer in state ${this.signalingState}`);
            }
            this.remoteDescription = desc;
            this.signalingState = 'stable';
            this.transportReady();
        }
    }

    async addIceCandidate(c) { // eslint-disable-line require-await
        if (!this.remoteDescription) {
            throw new Error('InvalidStateError: no remote description');
        }
        this.candidates.push(c);
    }

    transportReady() {
        setTimeout(() => {
            if (this.connectionState === 'closed') {
                return;
            }
            this.setConnectionState('connected');
            this.channel.readyState = 'open';
            if (this.channel.onopen) {
                this.channel.onopen();
            }
        });
    }

    setConnectionState(state) {
        this.connectionState = state;
        if (this.onconnectionstatechange) {
            this.onconnectionstatechange();
        }
    }

    restartIce() {
        this.iceRestarted = true;
    }

    close() {
        this.connectionState = 'closed';
    }
}

// --- In-memory signalling bus (stamps `_sender` like the server) -----------

function makeBus() {
    const subs = new Map();
    const published = [];
    return {
        published,
        hubFor(userId, namespace = 'room') {
            return {
                namespace,
                subscribe(channel, fn, {onOpen} = {}) {
                    const topic = `${namespace}/${channel}`;
                    if (!subs.has(topic)) {
                        subs.set(topic, new Set());
                    }
                    subs.get(topic).add(fn);
                    setTimeout(() => onOpen && onOpen());
                    return () => subs.get(topic).delete(fn);
                },
                publish(channel, msg) {
                    const topic = `${namespace}/${channel}`;
                    const payload = JSON.parse(JSON.stringify({...msg, _sender: userId}));
                    published.push({topic, payload});
                    return new Promise((resolve) => setTimeout(() => {
                        (subs.get(topic) || []).forEach((fn) => fn(payload));
                        resolve();
                    }));
                },
                close: jest.fn(),
            };
        },
    };
}

const meshes = [];

function join(bus, userId, opts = {}) {
    const mesh = new Mesh({
        namespace: 'room',
        userId,
        iceServers: [],
        stream: opts.stream,
        maxPeers: opts.maxPeers,
        allowedUserIds: opts.allowedUserIds,
        hub: bus.hubFor(userId),
        createPeer: (peerOpts) => {
            const peer = new Peer({...peerOpts, PeerConnection: FakePC});
            peer.pc.key = [mesh.id, peerOpts.id].sort().join('|');
            return peer;
        },
    });
    mesh.connected = [];
    mesh.on('peer', (peer, id) => mesh.connected.push(id));
    meshes.push(mesh);
    return mesh;
}

beforeEach(() => {
    pcs = [];
});

afterEach(() => {
    meshes.splice(0).forEach((m) => m.close());
});

// --- Tests -----------------------------------------------------------------

describe('Mesh', () => {
    test('two participants connect (offer collision is resolved) and exchange data', async () => {
        const bus = makeBus();
        const a = join(bus, 'alice');
        const b = join(bus, 'bob');

        await waitFor(() => a.connected.length === 1 && b.connected.length === 1);
        expect(a.connected[0]).toBe(b.id);
        expect(b.connected[0]).toBe(a.id);

        const pa = a.peers.get(b.id);
        const pb = b.peers.get(a.id);
        expect(pa.polite).not.toBe(pb.polite);

        const got = [];
        pb.on('data', (m) => got.push(m));
        pa.send('hi bob');
        expect(got).toEqual(['hi bob']);
    });

    test('data sent before the channel opens is delivered once it opens', async () => {
        const bus = makeBus();
        const a = join(bus, 'alice');
        const b = join(bus, 'bob');
        const got = [];

        await waitFor(() => a.peers.size === 1 && b.peers.size === 1);
        b.peers.get(a.id).on('data', (m) => got.push(m));
        a.peers.get(b.id).send('early');

        await waitFor(() => got.length === 1);
        expect(got).toEqual(['early']);
    });

    test('messages that claim someone else’s mesh id are ignored', async () => {
        const bus = makeBus();
        const a = join(bus, 'alice');
        await tick(5);

        // "mallory" pretends to be bob.
        await bus.hubFor('mallory').publish('all', {type: 'hello', from: 'bob.123456'});
        await bus.hubFor('mallory').publish(a.id, {type: 'signal', from: 'bob.123456', data: {description: {type: 'offer', sdp: 'x'}}});
        await tick(5);
        expect(a.peers.size).toBe(0);
    });

    test('allowedUserIds keeps outsiders out', async () => {
        const bus = makeBus();
        const a = join(bus, 'alice', {allowedUserIds: ['alice', 'bob']});
        const eve = join(bus, 'eve');

        await tick(30);
        expect(a.peers.size).toBe(0);
        expect(a.connected).toHaveLength(0);
        expect(eve.connected).toHaveLength(0);
    });

    test('maxPeers caps the number of connections', async () => {
        const bus = makeBus();
        const a = join(bus, 'alice', {maxPeers: 1});
        join(bus, 'bob');
        join(bus, 'carol');

        await waitFor(() => a.connected.length === 1);
        await tick(30);
        expect(a.peers.size).toBe(1);
    });

    test('three participants form a full mesh', async () => {
        const bus = makeBus();
        const a = join(bus, 'alice');
        const b = join(bus, 'bob');
        const c = join(bus, 'carol');

        await waitFor(() => [a, b, c].every((m) => m.connected.length === 2));
    });

    test('leaving says bye so others drop the peer immediately', async () => {
        const bus = makeBus();
        const a = join(bus, 'alice');
        const b = join(bus, 'bob');
        await waitFor(() => a.connected.length === 1 && b.connected.length === 1);

        const disconnected = jest.fn();
        a.on('disconnect', disconnected);
        b.close();

        await waitFor(() => disconnected.mock.calls.length === 1);
        expect(disconnected.mock.calls[0][1]).toBe(b.id);
        expect(a.peers.size).toBe(0);
    });

    test('signalling to one participant is sent in order', async () => {
        const bus = makeBus();
        const a = join(bus, 'alice');
        await tick(5);
        a.sendTo('bob.1', {type: 'signal', data: 1});
        a.sendTo('bob.1', {type: 'signal', data: 2});
        await a.sendTo('bob.1', {type: 'signal', data: 3});
        const seq = bus.published.filter((p) => p.topic === 'room/bob.1').map((p) => p.payload.data);
        expect(seq).toEqual([1, 2, 3]);
    });
});

describe('Peer', () => {
    function makePeer(opts = {}) {
        const signals = [];
        const peer = new Peer({id: 'remote.1', polite: true, iceServers: [], signal: (d) => signals.push(d), PeerConnection: FakePC, ...opts});
        return {peer, pc: peer.pc, signals};
    }

    test('uses a pre-negotiated data channel and sends local tracks', () => {
        const track = {kind: 'audio'};
        const stream = {getTracks: () => [track]};
        const {peer, pc} = makePeer({stream});
        expect(pc.channelInit).toEqual({negotiated: true, id: 0});
        expect(pc.senders[0].track).toBe(track);
        expect(pc.transceivers).toHaveLength(0);
        peer.destroy();
    });

    test('listen-only peers add a receive-only audio transceiver', () => {
        const {peer, pc} = makePeer();
        expect(pc.transceivers).toEqual([{kind: 'audio', init: {direction: 'recvonly'}}]);
        peer.destroy();
    });

    test('ICE candidates that arrive before the offer are applied afterwards', async () => {
        const {peer, pc, signals} = makePeer();
        await tick();
        pc.signalingState = 'stable';
        pc.localDescription = null;
        pc.offers = 0;

        peer.handleSignal({candidate: {candidate: 'early'}});
        await peer.handleSignal({description: {type: 'offer', sdp: 'remote-offer'}});

        expect(pc.candidates).toEqual([{candidate: 'early'}]);
        expect(signals.some((s) => s.description && s.description.type === 'answer')).toBe(true);
        peer.destroy();
    });

    test('impolite side ignores a colliding offer', async () => {
        const {peer, pc} = makePeer({polite: false});
        await tick(5); // our own offer is now pending
        expect(pc.signalingState).toBe('have-local-offer');

        await peer.handleSignal({description: {type: 'offer', sdp: 'theirs'}});
        expect(pc.remoteDescription).toBeNull();
        expect(pc.signalingState).toBe('have-local-offer');
        peer.destroy();
    });

    test('replaceTrack swaps the sender track without renegotiating', async () => {
        const cam = {kind: 'video'};
        const screen = {kind: 'video'};
        const {peer, pc} = makePeer({stream: {getTracks: () => [cam]}});
        await peer.replaceTrack(cam, screen);
        expect(pc.senders[0].track).toBe(screen);
        await peer.replaceTrack(screen, cam);
        expect(pc.senders[0].track).toBe(cam);
        await expect(peer.replaceTrack({kind: 'nope'}, cam)).rejects.toThrow();
        peer.destroy();
    });

    test('a failed connection restarts ICE once, then closes', () => {
        const {peer, pc} = makePeer();
        const closed = jest.fn();
        peer.on('close', closed);

        pc.setConnectionState('failed');
        expect(pc.iceRestarted).toBe(true);
        expect(closed).not.toHaveBeenCalled();

        pc.setConnectionState('failed');
        expect(closed).toHaveBeenCalledTimes(1);
        expect(peer.destroyed).toBe(true);
    });

    test('gives up if it never connects', () => {
        jest.useFakeTimers();
        try {
            const {peer} = makePeer({connectTimeoutMs: 1000});
            const closed = jest.fn();
            peer.on('close', closed);
            jest.advanceTimersByTime(1001);
            expect(closed).toHaveBeenCalled();
        } finally {
            jest.useRealTimers();
        }
    });
});
