import {formatDuration, parseInvite} from './call/invitePost';
import {makeMeshId, userIdFromMeshId, verifiedMessageFilter} from './signal/hub';
import {buildIceServers} from './utils/iceServers';
import {dmPeerId, findDirectChannelId, initials, recentDirectMessagePeers} from './utils/users';
import {voiceRoomsUpdated} from './voice/actions';
import {ME, OTHER, PEER, makeStore} from './test_utils';

describe('signal hub', () => {
    test('mesh ids embed the user id', () => {
        const id = makeMeshId('abc');
        expect(id).toMatch(/^abc\.[0-9a-f]{12}$/);
        expect(userIdFromMeshId(id)).toBe('abc');
    });

    test('unwrap rejects messages whose mesh id does not match the verified sender', () => {
        const unwrap = verifiedMessageFilter();
        expect(unwrap({from: 'u1.x', _sender: 'u1'})).toEqual({from: 'u1.x', _sender: 'u1'});
        expect(unwrap({from: 'u1.x', _sender: 'u2'})).toBeNull();
        expect(unwrap({from: 'u1.x'})).toBeNull();
        expect(unwrap(null)).toBeNull();
    });

    test('unwrap can restrict senders', () => {
        const unwrap = verifiedMessageFilter(['u1']);
        expect(unwrap({from: 'u2.x', _sender: 'u2'})).toBeNull();
        expect(unwrap({from: 'u1.x', _sender: 'u1'})).toBeTruthy();
    });
});

describe('ICE servers', () => {
    test('defaults to public STUN', () => {
        expect(buildIceServers('', '', '', '')[0].urls).toMatch(/^stun:/);
    });

    test('uses configured STUN and TURN with credentials', () => {
        expect(buildIceServers('stun:s:1', 'turn:t:2', 'u', 'p')).toEqual([
            {urls: 'stun:s:1'},
            {urls: 'turn:t:2', username: 'u', credential: 'p'},
        ]);
    });
});

describe('invite posts', () => {
    test('formatDuration', () => {
        expect(formatDuration(0)).toBe('0:00');
        expect(formatDuration(65000)).toBe('1:05');
        expect(formatDuration(3723000)).toBe('1:02:03');
    });

    test('parseInvite accepts objects and JSON strings', () => {
        const inv = {caller_id: 'a', callee_id: 'b'};
        expect(parseInvite({props: {webrtc_invite: inv}})).toEqual(inv);
        expect(parseInvite({props: {webrtc_invite: JSON.stringify(inv)}})).toEqual(inv);
        expect(parseInvite({props: {webrtc_invite: '{bad'}})).toBeNull();
        expect(parseInvite({props: {}})).toBeNull();
    });
});

describe('users', () => {
    const dm = (id, a, b, lastPostAt = 0) => ({id, type: 'D', name: [a, b].sort().join('__'), last_post_at: lastPostAt});

    test('dmPeerId resolves the other participant', () => {
        expect(dmPeerId(dm('c', ME, PEER), ME)).toBe(PEER);
        expect(dmPeerId({type: 'O', name: 'town-square'}, ME)).toBeNull();
        expect(dmPeerId(null, ME)).toBeNull();
    });

    test('recent DM peers are ordered by last activity', () => {
        const store = makeStore({
            channels: {channels: {c1: dm('c1', ME, PEER, 100), c2: dm('c2', ME, OTHER, 200)}},
        });
        expect(recentDirectMessagePeers(store.getState()).map((u) => u.id)).toEqual([OTHER, PEER]);
        expect(findDirectChannelId(store.getState(), PEER)).toBe('c1');
    });

    test('initials', () => {
        expect(initials('Pat Peer')).toBe('PP');
        expect(initials('')).toBe('?');
    });
});

describe('voice rooms websocket event', () => {
    test('parses the JSON room list', () => {
        const rooms = [{id: 'r1', name: 'Standup'}];
        expect(voiceRoomsUpdated({data: {rooms: JSON.stringify(rooms)}}).data).toEqual(rooms);
        expect(voiceRoomsUpdated({data: {rooms: 'garbage'}}).data).toEqual([]);
    });
});
