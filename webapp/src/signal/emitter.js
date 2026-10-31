/** Minimal event emitter (on / off / emit). */
export default class Emitter {
    constructor() {
        this.listeners = new Map();
    }

    on(event, fn) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event).add(fn);
        return this;
    }

    off(event, fn) {
        const set = this.listeners.get(event);
        if (set) {
            set.delete(fn);
        }
        return this;
    }

    emit(event, ...args) {
        const set = this.listeners.get(event);
        if (set) {
            [...set].forEach((fn) => fn(...args));
        }
    }
}
