import React from 'react';
import {Provider} from 'react-redux';
import {act, fireEvent, render, screen} from '@testing-library/react';

import ActionTypes from '../action_types';
import {ME, PEER, makeStore} from '../test_utils';

import CallWindow from './call_window/call_window';
import CallPicker from './call_picker/call_picker';
import InvitePost from './invite_post';
import Sidebar from './sidebar/sidebar';
import {PopoverCallButton} from './call_buttons';

jest.mock('../client', () => ({
    ...jest.requireActual('../client'),
    autocompleteUsers: jest.fn(() => Promise.resolve([{id: 'user-found', username: 'found', first_name: 'Fiona', last_name: 'Found'}])),
    listVoiceRooms: jest.fn(() => Promise.resolve([{id: 'vr1', name: 'Standup', creator_id: 'user-me'}])),
    getUsersByIds: jest.fn(() => Promise.resolve([])),
}));

beforeAll(() => {
    // jsdom has no media element playback.
    window.HTMLMediaElement.prototype.play = () => Promise.resolve();
});

function renderWith(store, ui) {
    return render(<Provider store={store}>{ui}</Provider>);
}

function startCall(store, data) {
    store.dispatch({type: ActionTypes.CALL_STARTED, data: {callId: 'c1', peerId: PEER, ...data}});
}

describe('CallWindow', () => {
    test('renders nothing without a call', () => {
        const {container} = renderWith(makeStore(), <CallWindow/>);
        expect(container).toBeEmptyDOMElement();
    });

    test('incoming call shows caller and accept/decline', () => {
        const store = makeStore();
        startCall(store, {direction: 'incoming', status: 'ringing'});
        renderWith(store, <CallWindow/>);
        expect(screen.getByText('Pat Peer')).toBeInTheDocument();
        expect(screen.getByText('Incoming video call')).toBeInTheDocument();
        expect(screen.getByRole('button', {name: 'Accept'})).toBeInTheDocument();
        expect(screen.getByRole('button', {name: 'Decline'})).toBeInTheDocument();
    });

    test('outgoing ringing shows status and a cancel control', () => {
        const store = makeStore();
        startCall(store, {direction: 'outgoing', status: 'ringing'});
        renderWith(store, <CallWindow/>);
        expect(screen.getByText('Calling…')).toBeInTheDocument();
        expect(screen.getByRole('button', {name: 'Cancel call'})).toBeInTheDocument();
    });

    test('active call shows a timer, can minimize and expand', () => {
        const store = makeStore();
        startCall(store, {direction: 'outgoing', status: 'ringing'});
        store.dispatch({type: ActionTypes.CALL_UPDATED, data: {callId: 'c1', status: 'active', startedAt: Date.now() - 65000}});
        const {container} = renderWith(store, <CallWindow/>);
        expect(screen.getByText('1:05')).toBeInTheDocument();
        expect(screen.getByRole('button', {name: 'Mute microphone'})).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', {name: 'Minimize call window'}));
        expect(container.querySelector('.wrtc-call--mini')).not.toBeNull();
        fireEvent.click(screen.getByRole('button', {name: 'Expand call window'}));
        expect(container.querySelector('.wrtc-call--full')).not.toBeNull();
    });

    test('declined call offers "Call again" and closes', () => {
        const store = makeStore();
        startCall(store, {direction: 'outgoing', status: 'ringing'});
        store.dispatch({type: ActionTypes.CALL_ENDED, data: {callId: 'c1', reason: 'declined'}});
        renderWith(store, <CallWindow/>);
        expect(screen.getByText('Call declined')).toBeInTheDocument();
        expect(screen.getByRole('button', {name: /Call again/})).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', {name: 'Close'}));
        expect(store.getState()['plugins-mattermost-webrtc-video'].call).toBeNull();
    });

    test('media error message is shown', () => {
        const store = makeStore();
        startCall(store, {direction: 'outgoing', status: 'ringing'});
        store.dispatch({type: ActionTypes.CALL_ENDED, data: {callId: 'c1', reason: 'error', error: 'Access to your microphone was blocked.'}});
        renderWith(store, <CallWindow/>);
        expect(screen.getByText('Access to your microphone was blocked.')).toBeInTheDocument();
    });
});

describe('CallPicker', () => {
    test('lists recent DM peers and searches the server', async () => {
        const store = makeStore({
            channels: {channels: {c1: {id: 'c1', type: 'D', name: [ME, PEER].sort().join('__'), last_post_at: 5}}},
        });
        store.dispatch({type: ActionTypes.OPEN_PICKER, data: {}});
        renderWith(store, <CallPicker/>);

        expect(screen.getByText('Recent conversations')).toBeInTheDocument();
        expect(screen.getByText('Pat Peer')).toBeInTheDocument();

        jest.useFakeTimers();
        try {
            fireEvent.change(screen.getByRole('textbox', {name: 'Search people'}), {target: {value: 'fio'}});
            await act(async () => {
                await jest.advanceTimersByTimeAsync(250);
            });
        } finally {
            jest.useRealTimers();
        }
        expect(await screen.findByText('Fiona Found')).toBeInTheDocument();
    });

    test('Escape closes the picker', () => {
        const store = makeStore();
        store.dispatch({type: ActionTypes.OPEN_PICKER, data: {}});
        renderWith(store, <CallPicker/>);
        fireEvent.keyDown(screen.getByRole('dialog'), {key: 'Escape'});
        expect(store.getState()['plugins-mattermost-webrtc-video'].picker.open).toBe(false);
    });
});

describe('InvitePost', () => {
    const post = (status, extra = {}) => ({
        id: 'p1',
        create_at: Date.now() - (10 * 60 * 1000),
        props: {webrtc_invite: {call_id: 'x', caller_id: PEER, callee_id: ME, status, created_at: Date.now() - (10 * 60 * 1000), ...extra}},
    });

    test('missed call for the callee offers a call back', () => {
        renderWith(makeStore(), <InvitePost post={post('missed')}/>);
        expect(screen.getByText('Missed video call')).toBeInTheDocument();
        expect(screen.getByRole('button', {name: /Call back/})).toBeInTheDocument();
    });

    test('ended call shows the duration', () => {
        renderWith(makeStore(), <InvitePost post={post('ended', {duration_ms: 125000})}/>);
        expect(screen.getByText('Lasted 2:05')).toBeInTheDocument();
    });

    test('non-invite posts render nothing', () => {
        const {container} = renderWith(makeStore(), <InvitePost post={{id: 'p', props: {}}}/>);
        expect(container).toBeEmptyDOMElement();
    });
});

describe('Sidebar', () => {
    test('shows the call button and loads voice channels', async () => {
        renderWith(makeStore(), <Sidebar/>);
        expect(screen.getByRole('button', {name: 'Start a video call'})).toBeInTheDocument();
        expect(await screen.findByText('Standup')).toBeInTheDocument();
        expect(screen.getByRole('button', {name: 'Delete Standup'})).toBeInTheDocument();
    });
});

describe('PopoverCallButton', () => {
    test('hidden for yourself, shown for others', () => {
        const store = makeStore();
        const {container, rerender} = renderWith(store, <PopoverCallButton userId={ME}/>);
        expect(container).toBeEmptyDOMElement();
        rerender(<Provider store={store}><PopoverCallButton userId={PEER}/></Provider>);
        expect(screen.getByRole('button', {name: /Video call/})).toBeInTheDocument();
    });
});
