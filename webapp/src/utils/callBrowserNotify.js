/**
 * Desktop / tab notification for incoming video calls (when permitted).
 */
function showIncomingNotification(title, body) {
    const opts = {
        body,
        tag: 'mattermost-webrtc-incoming',
        requireInteraction: true,
    };
    try {
        new Notification(title, opts); // eslint-disable-line no-new
    } catch (e) {
        /* ignore */
    }
}

export function notifyIncomingCall(peerDisplayName) {
    if (typeof window === 'undefined') {
        return;
    }
    if (window.navigator && window.navigator.vibrate) {
        try {
            window.navigator.vibrate([100, 60, 100, 60, 100]);
        } catch (e) {
            /* ignore */
        }
    }
    if (typeof Notification === 'undefined') {
        return;
    }
    const title = 'Incoming video call'; // eslint-disable-line no-magic-numbers
    const body = peerDisplayName ? `${peerDisplayName} is calling you` : 'Someone is calling you';

    if (Notification.permission === 'granted') {
        showIncomingNotification(title, body);
    } else if (Notification.permission === 'default') {
        Notification.requestPermission().then((p) => {
            if (p === 'granted') {
                showIncomingNotification(title, body);
            }
        }).catch(() => {
            /* ignore permission errors */
        });
    }
}
