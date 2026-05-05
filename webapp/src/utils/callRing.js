/**
 * Lightweight repeating ring tone for incoming calls (Web Audio API).
 */
let audioCtx;
let ringNodes;
let ringTimer;

function stopOscillators() {
    if (ringTimer) {
        clearInterval(ringTimer);
        ringTimer = null;
    }
    if (ringNodes && ringNodes.length) {
        ringNodes.forEach((n) => {
            try {
                n.stop();
                n.disconnect();
            } catch (e) {
                /* ignore */
            }
        });
        ringNodes = null;
    }
}

function beepOnce(ctx) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = 800;
    g.gain.value = 0.0001;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    const peak = 0.08;
    const start = ctx.currentTime;
    g.gain.exponentialRampToValueAtTime(peak, start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
    o.stop(start + 0.36);
    return o;
}

export function startIncomingRing() {
    stopIncomingRing();
    try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) {
            return;
        }
        audioCtx = new AC();
        const playPair = () => {
            if (!audioCtx) {
                return;
            }
            ringNodes = [beepOnce(audioCtx), beepOnce(audioCtx)];
            setTimeout(() => {
                stopOscillators();
            }, 900);
        };
        playPair();
        ringTimer = setInterval(playPair, 1600);
    } catch (e) {
        /* user gesture or API blocked */
    }
}

export function stopIncomingRing() {
    stopOscillators();
    try {
        if (audioCtx && audioCtx.state !== 'closed') {
            audioCtx.close();
        }
    } catch (e) {
        /* ignore */
    }
    audioCtx = null;
}
