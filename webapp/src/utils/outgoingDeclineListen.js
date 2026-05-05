let declineSubStream;

/**
 * Listen for decline events on the shared signalling hub (callee broadcasts decline-${callerId}).
 */
export function attachOutgoingDeclineListener(hub, callerId, calleeId, onDecline) {
    clearOutgoingDeclineListener();
    const stream = hub.subscribe(`decline-${callerId}`);
    declineSubStream = stream;
    const handler = (payload) => {
        let data = payload;
        if (typeof data === 'string') {
            try {
                data = JSON.parse(data);
            } catch (e) {
                return;
            }
        }
        if (data && data.calleeId === calleeId) {
            onDecline();
        }
    };
    stream.on('data', handler);
}

export function clearOutgoingDeclineListener() {
    if (declineSubStream) {
        try {
            declineSubStream.destroy();
        } catch (e) {
            /* ignore */
        }
        declineSubStream = null;
    }
}
