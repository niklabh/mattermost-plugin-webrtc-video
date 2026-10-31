/**
 * Debug logging, off by default. Enable in the browser console with:
 *   localStorage.setItem('webrtc-video-debug', '1')
 */
function enabled() {
    try {
        return typeof localStorage !== 'undefined' && localStorage.getItem('webrtc-video-debug') === '1';
    } catch (e) {
        return false;
    }
}

export default function debug(...args) {
    if (enabled()) {
        console.log('[webrtc-video]', ...args); // eslint-disable-line no-console
    }
}
