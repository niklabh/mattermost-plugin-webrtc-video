/**
 * Build RTCIceServer[] for RTCPeerConnection / simple-peer / webrtc-swarm.
 * Uses only STUN in the default set (no third-party TURN credentials baked into the plugin).
 */
const DEFAULT_STUN = [
    {urls: 'stun:stun.l.google.com:19302'},
    {urls: 'stun:stun1.l.google.com:19302'},
    {urls: 'stun:stun2.l.google.com:19302'},
];

export function buildIceServers(stunServer, turnServer, turnServerUsername, turnServerCredential) {
    const stun = String(stunServer || '').trim();
    const turn = String(turnServer || '').trim();
    const tunUser = String(turnServerUsername || '').trim();
    const tunCred = String(turnServerCredential || '').trim();

    if (!stun && !turn) {
        return DEFAULT_STUN.slice();
    }

    const out = [];
    if (stun) {
        out.push({urls: stun});
    }
    if (turn && tunUser && tunCred) {
        out.push({
            urls: turn,
            username: tunUser,
            credential: tunCred,
        });
    } else if (turn) {
        out.push({urls: turn});
    }

    return out.length > 0 ? out : DEFAULT_STUN.slice();
}
