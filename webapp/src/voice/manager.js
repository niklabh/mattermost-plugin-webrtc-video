/**
 * Holds the single active voice session outside React so it survives the
 * sidebar unmounting (narrow layouts, team switches).
 */
import {useEffect, useState} from 'react';

import VoiceSession from './session';

let current = null; // {room, session, state}
const listeners = new Set();

function emit() {
    listeners.forEach((fn) => fn(current));
}

export function getActiveVoice() {
    return current;
}

export function joinVoiceRoom(room, {userId, iceServers}) {
    leaveVoiceRoom();
    const session = new VoiceSession({
        roomId: room.id,
        userId,
        iceServers,
        onChange: (state) => {
            if (current && current.session === session) {
                current = {...current, state};
                emit();
            }
        },
    });
    current = {room, session, state: session.state};
    emit();
    session.join();
    return session;
}

export function leaveVoiceRoom() {
    if (!current) {
        return;
    }
    current.session.leave();
    current = null;
    emit();
}

export function useActiveVoice() {
    const [value, setValue] = useState(current);
    useEffect(() => {
        listeners.add(setValue);
        setValue(current);
        return () => listeners.delete(setValue);
    }, []);
    return value;
}
