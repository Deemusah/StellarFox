/**
 * CJS shim for the ESM-only `rettime` package.
 * Used in Jest's Node environment to avoid ESM/CJS interop issues.
 * Provides the subset of the API that MSW uses: Emitter.
 */
'use strict';

class Emitter {
  constructor() {
    this._listeners = new Map();
  }

  on(event, listener) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, []);
    }
    this._listeners.get(event).push(listener);
    return this;
  }

  off(event, listener) {
    if (!this._listeners.has(event)) return this;
    const listeners = this._listeners.get(event).filter((l) => l !== listener);
    this._listeners.set(event, listeners);
    return this;
  }

  emit(event, ...args) {
    if (!this._listeners.has(event)) return;
    this._listeners.get(event).forEach((l) => l(...args));
  }

  once(event, listener) {
    const wrapper = (...args) => {
      listener(...args);
      this.off(event, wrapper);
    };
    return this.on(event, wrapper);
  }

  removeAllListeners(event) {
    if (event) {
      this._listeners.delete(event);
    } else {
      this._listeners.clear();
    }
    return this;
  }
}

module.exports = { Emitter };
