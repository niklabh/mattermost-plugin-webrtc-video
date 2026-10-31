/**
 * Incoming-call ringing and desktop notifications.
 *
 * Prefers the web app's own helpers (exposed to plugins on window.WebappUtils),
 * so the user's chosen call ringtone is used and notifications work in the
 * Desktop App, with Web Audio / Notification API fallbacks for older servers.
 */
import debug from '../utils/debug';

const DEFAULT_RINGTONE = 'Dynamic';

let fallback = null;

function webappUtils() {
    return (typeof window !== 'undefined' && window.WebappUtils) || null;
}

function startFallbackRing() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) {
        return;
    }
    const ctx = new AC();
    const beep = (at) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = 660;
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(0.08, at + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, at + 0.35);
        o.connect(g).connect(ctx.destination);
        o.start(at);
        o.stop(at + 0.4);
    };
    const pair = () => {
        beep(ctx.currentTime);
        beep(ctx.currentTime + 0.45);
    };
    pair();
    fallback = {ctx, timer: setInterval(pair, 2400)};
}

export function startRinging(ringtone) {
    stopRinging();
    const utils = webappUtils();
    const sounds = utils && utils.notificationSounds;
    if (sounds && typeof sounds.ring === 'function') {
        try {
            sounds.ring(ringtone || DEFAULT_RINGTONE);
            return;
        } catch (e) {
            debug('ring via web app failed, using fallback', e);
        }
    }
    try {
        startFallbackRing();
    } catch (e) {
        // autoplay restrictions; the visual alert is still shown
    }
}

export function stopRinging() {
    const utils = webappUtils();
    const sounds = utils && utils.notificationSounds;
    if (sounds && typeof sounds.stopRing === 'function') {
        try {
            sounds.stopRing();
        } catch (e) {
            // ignore
        }
    }
    if (fallback) {
        clearInterval(fallback.timer);
        fallback.ctx.close().catch(() => {
            // ignore
        });
        fallback = null;
    }
}

/** Shows a desktop notification for an incoming call (when the tab isn't focused). */
export function notifyIncomingCall(dispatch, {title, body, channelId, teamId, url}) {
    if (typeof document !== 'undefined' && document.hasFocus && document.hasFocus()) {
        return;
    }
    const utils = webappUtils();
    if (utils && typeof utils.sendDesktopNotificationToMe === 'function') {
        try {
            dispatch(utils.sendDesktopNotificationToMe(title, body, channelId || '', teamId || '', true, '', url || ''));
            return;
        } catch (e) {
            debug('web app notification failed, using fallback', e);
        }
    }
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
        return;
    }
    try {
        const n = new Notification(title, {body, tag: 'webrtc-video-incoming', requireInteraction: true});
        n.onclick = () => {
            window.focus();
            n.close();
        };
    } catch (e) {
        // ignore
    }
}
