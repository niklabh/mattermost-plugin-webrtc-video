/**
 * Authenticated calls to Mattermost /api/v4 (cookie session + CSRF), same rules as plugin routes.
 */
import axios from 'axios';

function getCsrfTokenFromCookie() {
    if (typeof document === 'undefined' || !document.cookie) {
        return '';
    }
    const parts = document.cookie.split(';');
    for (let i = 0; i < parts.length; i++) {
        const p = parts[i].trim();
        if (p.startsWith('MMCSRF=')) {
            return p.slice('MMCSRF='.length);
        }
    }
    return '';
}

export function mattermostApiHeaders() {
    const headers = {
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/json',
    };
    const csrf = getCsrfTokenFromCookie();
    if (csrf) {
        headers['X-CSRF-Token'] = csrf;
    }
    return headers;
}

export function mattermostApiRequest(config) {
    return axios({
        ...config,
        headers: {
            ...mattermostApiHeaders(),
            ...(config.headers || {}),
        },
        withCredentials: true,
    });
}
