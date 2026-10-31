/**
 * Publish/subscribe over the plugin's signalling API: SSE for receiving
 * (GET /v1/signal/stream) and POST /v1/signal/publish for sending.
 *
 * Topics are "<namespace>/<channel>". Every delivered message carries `_sender`,
 * stamped by the server with the authenticated user id.
 */
import {publishSignal, signalStreamUrl} from '../client';
import debug from '../utils/debug';

export default function createHub(namespace) {
    const sources = new Set();
    let closed = false;

    return {
        namespace,

        /**
         * Calls onMessage(object) for each message. `onOpen` fires when the
         * stream (re)connects. Returns an unsubscribe function.
         */
        subscribe(channel, onMessage, {onOpen} = {}) {
            const topic = `${namespace}/${channel}`;
            const source = new EventSource(signalStreamUrl(topic), {withCredentials: true});
            source.onopen = () => {
                if (onOpen) {
                    onOpen();
                }
            };
            source.onmessage = (ev) => {
                let data;
                try {
                    data = JSON.parse(ev.data);
                } catch (e) {
                    debug('signal: dropping malformed frame', topic);
                    return;
                }
                onMessage(data);
            };
            source.onerror = () => {
                // EventSource retries transient failures itself; CLOSED is terminal (e.g. 403).
                if (source.readyState === EventSource.CLOSED) {
                    debug('signal: stream closed', topic);
                }
            };
            sources.add(source);
            return () => {
                source.close();
                sources.delete(source);
            };
        },

        publish(channel, message) {
            if (closed) {
                return Promise.resolve();
            }
            return publishSignal(`${namespace}/${channel}`, message);
        },

        close() {
            closed = true;
            sources.forEach((s) => s.close());
            sources.clear();
        },
    };
}

/** Mesh ids are "<userId>.<session>", so a user can rejoin without colliding with a stale session. */
export function makeMeshId(userId) {
    return `${userId}.${randomId(6)}`;
}

export function userIdFromMeshId(meshId) {
    return String(meshId || '').split('.')[0];
}

/**
 * Returns a filter that drops messages whose claimed mesh id does not belong to
 * the server-verified sender, optionally restricting senders to a list.
 */
export function verifiedMessageFilter(allowedUserIds) {
    return (data) => {
        if (!data || typeof data !== 'object' || !data._sender) {
            return null;
        }
        if (userIdFromMeshId(data.from) !== data._sender) {
            debug('signal: dropping spoofed message', data.from, data._sender);
            return null;
        }
        if (allowedUserIds && !allowedUserIds.includes(data._sender)) {
            return null;
        }
        return data;
    };
}

export function randomId(bytes = 16) {
    const buf = new Uint8Array(bytes);
    crypto.getRandomValues(buf);
    return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}
