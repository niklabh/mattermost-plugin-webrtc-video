import React, {useEffect, useRef} from 'react';
import PropTypes from 'prop-types';

/** <video> bound to a MediaStream. */
export default function StreamVideo({stream, muted = false, className, tracksVersion}) {
    const ref = useRef(null);

    useEffect(() => {
        const el = ref.current;
        if (!el) {
            return;
        }
        if (el.srcObject !== stream) {
            el.srcObject = stream || null;
        }
        if (stream) {
            el.play().catch(() => {
                // autoplay can be blocked until the next user gesture
            });
        }
    }, [stream, tracksVersion]);

    return (
        <video
            ref={ref}
            className={className}
            autoPlay={true}
            playsInline={true}
            muted={muted}
        />
    );
}

StreamVideo.propTypes = {
    stream: PropTypes.object,
    muted: PropTypes.bool,
    className: PropTypes.string,
    tracksVersion: PropTypes.number,
};
