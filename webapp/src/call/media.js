const AUDIO_CONSTRAINTS = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
};

const VIDEO_CONSTRAINTS = {
    width: {ideal: 1280},
    height: {ideal: 720},
    frameRate: {ideal: 30, max: 30},
    facingMode: 'user',
};

export class MediaError extends Error {
    constructor(message, cause) {
        super(message);
        this.cause = cause;
    }
}

function explain(err, what) {
    const name = err && err.name;
    if (name === 'NotAllowedError' || name === 'SecurityError') {
        return `Access to your ${what} was blocked. Allow it in your browser's site settings and try again.`;
    }
    if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        return `No ${what} was found.`;
    }
    if (name === 'NotReadableError') {
        return `Your ${what} is in use by another application.`;
    }
    return `Could not access your ${what}.`;
}

function hasMediaDevices() {
    return typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
}

/**
 * Camera + microphone, falling back to microphone only when the camera is
 * unavailable. Resolves to {stream, video: boolean}.
 */
export async function getCallMedia({video = true} = {}) {
    if (!hasMediaDevices()) {
        throw new MediaError('Your browser does not support calls here. Mattermost must be served over HTTPS.');
    }
    if (video) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({audio: AUDIO_CONSTRAINTS, video: VIDEO_CONSTRAINTS});
            return {stream, video: true};
        } catch (err) {
            // fall through to audio only
        }
    }
    try {
        const stream = await navigator.mediaDevices.getUserMedia({audio: AUDIO_CONSTRAINTS});
        return {stream, video: false};
    } catch (err) {
        throw new MediaError(explain(err, 'microphone'), err);
    }
}

export async function getMicrophone() {
    if (!hasMediaDevices()) {
        throw new MediaError('Your browser does not support voice here. Mattermost must be served over HTTPS.');
    }
    try {
        return await navigator.mediaDevices.getUserMedia({audio: AUDIO_CONSTRAINTS});
    } catch (err) {
        throw new MediaError(explain(err, 'microphone'), err);
    }
}

export function canShareScreen() {
    return typeof navigator !== 'undefined' && navigator.mediaDevices && typeof navigator.mediaDevices.getDisplayMedia === 'function';
}

export async function getScreen() {
    const stream = await navigator.mediaDevices.getDisplayMedia({video: {frameRate: {ideal: 15, max: 30}}, audio: false});
    return stream.getVideoTracks()[0];
}

export function stopStream(stream) {
    if (!stream) {
        return;
    }
    stream.getTracks().forEach((t) => {
        try {
            t.stop();
        } catch (e) {
            // ignore
        }
    });
}

let sharedAudioContext = null;
function audioContext() {
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AC) {
        return null;
    }
    if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
        sharedAudioContext = new AC();
    }
    if (sharedAudioContext.state === 'suspended') {
        sharedAudioContext.resume().catch(() => {
            // needs a user gesture; meters stay idle until then
        });
    }
    return sharedAudioContext;
}

/**
 * Calls onChange(isSpeaking) when the stream's audio level crosses a threshold.
 * Returns a stop() function.
 */
export function watchSpeaking(stream, onChange, {threshold = 0.035, interval = 150} = {}) {
    const ctx = audioContext();
    if (!ctx || !stream || !stream.getAudioTracks().length) {
        return () => {
            // nothing to stop
        };
    }
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);

    let speaking = false;
    let quietTicks = 0;
    const timer = setInterval(() => {
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
            sum += buf[i] * buf[i];
        }
        const rms = Math.sqrt(sum / buf.length);
        const track = stream.getAudioTracks()[0];
        const loud = rms > threshold && (!track || track.enabled);
        if (loud) {
            quietTicks = 0;
        } else {
            quietTicks++;
        }
        const next = loud || (speaking && quietTicks < 3);
        if (next !== speaking) {
            speaking = next;
            onChange(speaking);
        }
    }, interval);

    return () => {
        clearInterval(timer);
        try {
            source.disconnect();
            analyser.disconnect();
        } catch (e) {
            // ignore
        }
    };
}
