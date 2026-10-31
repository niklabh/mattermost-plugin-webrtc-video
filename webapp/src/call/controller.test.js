import ActionTypes from '../action_types';
import {getCall} from '../selectors';
import {ME, OTHER, PEER, makeStore} from '../test_utils';

import {
    __testing,
    acceptCall,
    declineCall,
    handleInboxMessage,
    hangUp,
    startCall,
    toggleAudio,
} from './controller';
import {startRinging, stopRinging} from './alerts';

jest.mock('./alerts', () => ({
    startRinging: jest.fn(),
    stopRinging: jest.fn(),
    notifyIncomingCall: jest.fn(),
}));

jest.mock('./invitePost', () => ({
    createInvitePost: jest.fn(() => Promise.resolve({post: {id: 'post-1'}, invite: {call_id: 'c'}})),
    updateInvitePost: jest.fn(() => Promise.resolve()),
}));

const mockMeshes = [];
jest.mock('../signal/mesh', () => jest.fn().mockImplementation((opts) => {
    const handlers = {};
    const sw = {
        opts,
        on: (ev, fn) => {
            handlers[ev] = fn;
        },
        emit: (ev, ...args) => handlers[ev] && handlers[ev](...args),
        close: jest.fn(),
    };
    mockMeshes.push(sw);
    return sw;
}));

jest.mock('../client', () => ({
    ...jest.requireActual('../client'),
    createDirectChannel: jest.fn(() => Promise.resolve({id: 'dm-1'})),
    publishSignal: jest.fn(() => Promise.resolve()),
    getUsersByIds: jest.fn(() => Promise.resolve([])),
}));

function fakeTrack(kind) {
    return {kind, enabled: true, stop: jest.fn(), readyState: 'live'};
}

function fakeStream({video = true} = {}) {
    const tracks = [fakeTrack('audio'), ...(video ? [fakeTrack('video')] : [])];
    return {
        getTracks: () => tracks,
        getAudioTracks: () => tracks.filter((t) => t.kind === 'audio'),
        getVideoTracks: () => tracks.filter((t) => t.kind === 'video'),
    };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

let inboxSent;

function setup() {
    const store = makeStore();
    store.dispatch({type: ActionTypes.CONFIG_LOADED, data: {}});
    inboxSent = [];
    __testing.setInbox({
        broadcast: (userId, msg) => inboxSent.push({userId, msg}),
        close: jest.fn(),
    });
    return store;
}

beforeEach(() => {
    __testing.reset();
    mockMeshes.length = 0;
    global.navigator.mediaDevices = {
        getUserMedia: jest.fn(() => Promise.resolve(fakeStream())),
    };
});

describe('incoming calls', () => {
    test('invite from a peer rings and shows an incoming call', async () => {
        const store = setup();
        store.dispatch(handleInboxMessage({type: 'invite', callId: 'c1', video: true, _sender: PEER}));
        await flush();

        const call = getCall(store.getState());
        expect(call).toMatchObject({callId: 'c1', peerId: PEER, direction: 'incoming', status: 'ringing'});
        expect(startRinging).toHaveBeenCalled();
    });

    test('messages without a server-stamped sender are ignored', () => {
        const store = setup();
        store.dispatch(handleInboxMessage({type: 'invite', callId: 'c1'}));
        expect(getCall(store.getState())).toBeNull();
    });

    test('a second caller gets "busy" while in a call', async () => {
        const store = setup();
        store.dispatch(handleInboxMessage({type: 'invite', callId: 'c1', _sender: PEER}));
        store.dispatch(handleInboxMessage({type: 'invite', callId: 'c2', _sender: OTHER}));
        await flush();

        expect(getCall(store.getState()).callId).toBe('c1');
        expect(inboxSent).toContainEqual({userId: OTHER, msg: {type: 'busy', callId: 'c2'}});
    });

    test('caller cancelling stops the ringing', async () => {
        const store = setup();
        store.dispatch(handleInboxMessage({type: 'invite', callId: 'c1', _sender: PEER}));
        store.dispatch(handleInboxMessage({type: 'cancel', callId: 'c1', _sender: PEER}));
        await flush();

        expect(getCall(store.getState())).toMatchObject({status: 'ended', endReason: 'cancelled'});
        expect(stopRinging).toHaveBeenCalled();
    });

    test('a cancel from a different user is ignored', () => {
        const store = setup();
        store.dispatch(handleInboxMessage({type: 'invite', callId: 'c1', _sender: PEER}));
        store.dispatch(handleInboxMessage({type: 'cancel', callId: 'c1', _sender: OTHER}));
        expect(getCall(store.getState()).status).toBe('ringing');
    });

    test('accepting gets media, notifies the caller and joins the call mesh', async () => {
        const store = setup();
        store.dispatch(handleInboxMessage({type: 'invite', callId: 'c1', _sender: PEER}));
        await store.dispatch(acceptCall());

        expect(inboxSent).toContainEqual({userId: PEER, msg: {type: 'accept', callId: 'c1'}});
        expect(getCall(store.getState()).status).toBe('connecting');
        expect(mockMeshes).toHaveLength(1);
        expect(mockMeshes[0].opts).toMatchObject({namespace: 'call/c1', userId: ME, maxPeers: 1});

        // Only the two participants are accepted on the media mesh.
        expect(mockMeshes[0].opts.allowedUserIds).toEqual([ME, PEER]);
        expect(mockMeshes[0].opts.stream).toBeTruthy();
    });

    test('accepting falls back to audio when the camera is unavailable', async () => {
        navigator.mediaDevices.getUserMedia = jest.fn((c) => (c.video ? Promise.reject(new Error('NotFoundError')) : Promise.resolve(fakeStream({video: false}))));
        const store = setup();
        store.dispatch(handleInboxMessage({type: 'invite', callId: 'c1', _sender: PEER}));
        await store.dispatch(acceptCall());

        expect(getCall(store.getState())).toMatchObject({hasVideo: false, videoOn: false, status: 'connecting'});
    });

    test('declining notifies the caller and closes the window', () => {
        const store = setup();
        store.dispatch(handleInboxMessage({type: 'invite', callId: 'c1', _sender: PEER}));
        store.dispatch(declineCall());

        expect(inboxSent).toContainEqual({userId: PEER, msg: {type: 'decline', callId: 'c1'}});
        expect(getCall(store.getState())).toBeNull();
    });
});

describe('outgoing calls', () => {
    test('starting a call acquires media and sends an invite', async () => {
        const store = setup();
        await store.dispatch(startCall(PEER));

        const call = getCall(store.getState());
        expect(call).toMatchObject({peerId: PEER, direction: 'outgoing', status: 'ringing', hasVideo: true, postId: 'post-1'});
        expect(inboxSent).toContainEqual({userId: PEER, msg: {type: 'invite', callId: call.callId, video: true}});
    });

    test('cannot call yourself', async () => {
        const store = setup();
        await store.dispatch(startCall(ME));
        expect(getCall(store.getState())).toBeNull();
    });

    test('media failure ends the call with a helpful error', async () => {
        navigator.mediaDevices.getUserMedia = jest.fn(() => Promise.reject(Object.assign(new Error('denied'), {name: 'NotAllowedError'})));
        const store = setup();
        await store.dispatch(startCall(PEER));

        const call = getCall(store.getState());
        expect(call).toMatchObject({status: 'ended', endReason: 'error'});
        expect(call.error).toMatch(/blocked/);
        expect(inboxSent).toHaveLength(0);
    });

    test('peer accepting moves to connecting and joins the mesh', async () => {
        const store = setup();
        await store.dispatch(startCall(PEER));
        const {callId} = getCall(store.getState());

        store.dispatch(handleInboxMessage({type: 'accept', callId, _sender: PEER}));
        expect(getCall(store.getState()).status).toBe('connecting');
        expect(mockMeshes).toHaveLength(1);
    });

    test('a forged accept from someone else is ignored', async () => {
        const store = setup();
        await store.dispatch(startCall(PEER));
        const {callId} = getCall(store.getState());

        store.dispatch(handleInboxMessage({type: 'accept', callId, _sender: OTHER}));
        expect(getCall(store.getState()).status).toBe('ringing');
        expect(mockMeshes).toHaveLength(0);
    });

    test('decline shows "declined" and stops local media', async () => {
        const store = setup();
        await store.dispatch(startCall(PEER));
        const {callId, localStream} = getCall(store.getState());

        store.dispatch(handleInboxMessage({type: 'decline', callId, _sender: PEER}));
        expect(getCall(store.getState())).toMatchObject({status: 'ended', endReason: 'declined'});
        localStream.getTracks().forEach((t) => expect(t.stop).toHaveBeenCalled());
    });

    test('hanging up while ringing sends cancel', async () => {
        const store = setup();
        await store.dispatch(startCall(PEER));
        const {callId} = getCall(store.getState());

        store.dispatch(hangUp());
        expect(inboxSent).toContainEqual({userId: PEER, msg: {type: 'cancel', callId}});
        expect(getCall(store.getState())).toBeNull();
    });

    test('no answer times out and cancels', async () => {
        jest.useFakeTimers();
        try {
            const store = setup();
            const p = store.dispatch(startCall(PEER));
            await jest.advanceTimersByTimeAsync(0);
            await p;
            const {callId} = getCall(store.getState());

            await jest.advanceTimersByTimeAsync(46000);
            expect(inboxSent).toContainEqual({userId: PEER, msg: {type: 'cancel', callId}});
            expect(getCall(store.getState())).toMatchObject({status: 'ended', endReason: 'no_answer'});
        } finally {
            jest.useRealTimers();
        }
    });
});

describe('active calls', () => {
    async function activeCall() {
        const store = setup();
        await store.dispatch(startCall(PEER));
        const {callId} = getCall(store.getState());
        store.dispatch(handleInboxMessage({type: 'accept', callId, _sender: PEER}));

        const handlers = {};
        const peer = {
            send: jest.fn(),
            on: (ev, fn) => {
                handlers[ev] = fn;
            },
            remoteStreams: [],
        };
        mockMeshes[0].emit('peer', peer, `${PEER}.xyz`);
        return {store, peer, handlers, callId};
    }

    test('connecting a peer makes the call active and shares state', async () => {
        const {store, peer} = await activeCall();
        const call = getCall(store.getState());
        expect(call.status).toBe('active');
        expect(call.startedAt).toBeGreaterThan(0);
        expect(JSON.parse(peer.send.mock.calls[0][0])).toEqual({type: 'state', audio: true, video: true, screen: false});
    });

    test('remote state updates are reflected', async () => {
        const {store, handlers} = await activeCall();
        handlers.data(JSON.stringify({type: 'state', audio: false, video: false, screen: true}));
        expect(getCall(store.getState())).toMatchObject({peerAudioOn: false, peerVideoOn: false, peerScreenSharing: true});
    });

    test('muting disables the track and tells the peer', async () => {
        const {store, peer} = await activeCall();
        store.dispatch(toggleAudio());
        expect(getCall(store.getState()).audioOn).toBe(false);
        expect(JSON.parse(peer.send.mock.calls.at(-1)[0])).toMatchObject({type: 'state', audio: false});
    });

    test('remote hang-up ends the call and closes the mesh', async () => {
        const {store, handlers} = await activeCall();
        handlers.data(JSON.stringify({type: 'hangup'}));
        expect(getCall(store.getState())).toMatchObject({status: 'ended', endReason: 'hangup'});
        expect(mockMeshes[0].close).toHaveBeenCalled();
    });

    test('peer disconnect shows reconnecting, then gives up', async () => {
        jest.useFakeTimers();
        try {
            const {store, peer} = await activeCall();
            mockMeshes[0].emit('disconnect', peer, `${PEER}.xyz`);
            expect(getCall(store.getState()).status).toBe('reconnecting');

            jest.advanceTimersByTime(21000);
            expect(getCall(store.getState())).toMatchObject({status: 'ended', endReason: 'connection_lost'});
        } finally {
            jest.useRealTimers();
        }
    });

    test('local hang-up notifies the peer on both channels', async () => {
        const {store, peer, callId} = await activeCall();
        store.dispatch(hangUp());
        expect(JSON.parse(peer.send.mock.calls.at(-1)[0])).toEqual({type: 'hangup'});
        expect(inboxSent).toContainEqual({userId: PEER, msg: {type: 'hangup', callId}});
        expect(getCall(store.getState())).toBeNull();
    });
});
