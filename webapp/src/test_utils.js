import {applyMiddleware, combineReducers, legacy_createStore as createStore} from 'redux';

import {id as pluginId} from './manifest';
import pluginReducer from './reducers';

const thunk = ({dispatch, getState}) => (next) => (action) => (
    typeof action === 'function' ? action(dispatch, getState) : next(action)
);

export const ME = 'user-me';
export const PEER = 'user-peer';
export const OTHER = 'user-other';

function entities(state = {}) {
    return state;
}

export function makeStore(extraEntities = {}) {
    const users = {
        currentUserId: ME,
        profiles: {
            [ME]: {id: ME, username: 'me', first_name: 'Me', last_name: 'Myself', roles: 'system_user', notify_props: {}},
            [PEER]: {id: PEER, username: 'peer', first_name: 'Pat', last_name: 'Peer'},
            [OTHER]: {id: OTHER, username: 'other', first_name: 'Olly', last_name: 'Other'},
        },
        statuses: {[PEER]: 'online'},
    };
    const initial = {
        entities: {
            users,
            channels: {channels: {}, myMembers: {}, currentChannelId: ''},
            teams: {currentTeamId: 't1', teams: {t1: {id: 't1', name: 'team'}}},
            preferences: {myPreferences: {}},
            general: {config: {TeammateNameDisplay: 'full_name'}, license: {}},
            ...extraEntities,
        },
    };
    return createStore(
        combineReducers({entities, [`plugins-${pluginId}`]: pluginReducer}),
        initial,
        applyMiddleware(thunk),
    );
}
