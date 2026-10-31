/**
 * Minimal fetch-based client for the Mattermost REST API and this plugin's routes.
 * Uses the user's session cookie plus the CSRF header Mattermost requires for
 * cookie-authenticated, state-changing requests.
 */
import {id as pluginId} from './manifest';

/** Site sub-path (e.g. "/mattermost") when Mattermost is not served from the root. */
export function basePath() {
    if (typeof window === 'undefined' || !window.basename) {
        return '';
    }
    return window.basename.replace(/\/+$/, '');
}

export function pluginUrl(path) {
    return `${basePath()}/plugins/${pluginId}${path}`;
}

export function apiUrl(path) {
    return `${basePath()}/api/v4${path}`;
}

export function profileImageUrl(user) {
    if (!user || !user.id) {
        return '';
    }
    return apiUrl(`/users/${user.id}/image?_=${user.last_picture_update || 0}`);
}

function csrfToken() {
    if (typeof document === 'undefined' || !document.cookie) {
        return '';
    }
    const match = document.cookie.split(';').map((c) => c.trim()).find((c) => c.startsWith('MMCSRF='));
    return match ? match.slice('MMCSRF='.length) : '';
}

export function authHeaders(extra = {}) {
    const headers = {
        'X-Requested-With': 'XMLHttpRequest',
        ...extra,
    };
    const token = csrfToken();
    if (token) {
        headers['X-CSRF-Token'] = token;
    }
    return headers;
}

export class HttpError extends Error {
    constructor(status, message) {
        super(message || `Request failed with status ${status}`);
        this.status = status;
    }
}

export async function request(url, {method = 'GET', body, signal, keepalive} = {}) {
    const res = await fetch(url, {
        method,
        credentials: 'include',
        headers: authHeaders(body === undefined ? {} : {'Content-Type': 'application/json'}),
        body: body === undefined ? undefined : JSON.stringify(body),
        signal,
        keepalive,
    });
    if (!res.ok) {
        let message = '';
        try {
            message = (await res.text()).trim();
            const parsed = JSON.parse(message);
            message = parsed.message || message;
        } catch (e) {
            // plain-text error body
        }
        throw new HttpError(res.status, message);
    }
    if (res.status === 204) {
        return null;
    }
    const type = res.headers.get('Content-Type') || '';
    return type.includes('application/json') ? res.json() : null;
}

// --- Plugin routes -------------------------------------------------------

export const getPluginConfig = () => request(pluginUrl('/v1/config'));

export const publishSignal = (topic, payload, opts) => request(pluginUrl('/v1/signal/publish'), {
    method: 'POST',
    body: {topic, payload},
    ...opts,
});

export const signalStreamUrl = (topic) => pluginUrl(`/v1/signal/stream?topic=${encodeURIComponent(topic)}`);

export const listVoiceRooms = () => request(pluginUrl('/v1/voice/rooms'));

export const createVoiceRoom = (name) => request(pluginUrl('/v1/voice/rooms'), {method: 'POST', body: {name}});

export const deleteVoiceRoom = (roomId) => request(pluginUrl(`/v1/voice/rooms/${encodeURIComponent(roomId)}`), {method: 'DELETE'});

// --- Mattermost REST API ---------------------------------------------------

export async function createDirectChannel(myUserId, otherUserId) {
    const channel = await request(apiUrl('/channels/direct'), {method: 'POST', body: [myUserId, otherUserId]});
    if (!channel || !channel.id) {
        throw new Error('Could not open a direct message channel');
    }
    return channel;
}

export const createPost = (post) => request(apiUrl('/posts'), {method: 'POST', body: post});

export const patchPost = (postId, patch) => request(apiUrl(`/posts/${postId}/patch`), {method: 'PUT', body: patch});

export async function autocompleteUsers(term, signal) {
    const q = encodeURIComponent(term);
    const data = await request(apiUrl(`/users/autocomplete?name=${q}&limit=25`), {signal});
    return (data && data.users) || [];
}

export async function getUsersByIds(ids) {
    if (!ids.length) {
        return [];
    }
    return (await request(apiUrl('/users/ids'), {method: 'POST', body: ids})) || [];
}
