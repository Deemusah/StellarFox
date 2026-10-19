/**
 * CJS shim for the ESM-only `@open-draft/deferred-promise` package.
 * Used in Jest's Node environment to avoid ESM/CJS interop issues.
 */
'use strict';

function createDeferredExecutor() {
  const executor = (resolve, reject) => {
    executor.state = 'pending';
    executor.resolve = (data) => {
      if (executor.state !== 'pending') return;
      executor.result = data;
      const onFulfilled = (value) => {
        executor.state = 'fulfilled';
        return value;
      };
      return resolve(data instanceof Promise ? data : Promise.resolve(data).then(onFulfilled));
    };
    executor.reject = (reason) => {
      if (executor.state !== 'pending') return;
      queueMicrotask(() => { executor.state = 'rejected'; });
      executor.rejectionReason = reason;
      return reject(reason);
    };
  };
  return executor;
}

class DeferredPromise extends Promise {
  constructor(executor) {
    const deferredExecutor = createDeferredExecutor();
    super((originalResolve, originalReject) => {
      deferredExecutor(originalResolve, originalReject);
      if (executor) executor(deferredExecutor.resolve, deferredExecutor.reject);
    });
    this._executor = deferredExecutor;
    this.resolve = deferredExecutor.resolve;
    this.reject = deferredExecutor.reject;
  }

  get state() {
    return this._executor.state;
  }

  get rejectionReason() {
    return this._executor.rejectionReason;
  }
}

module.exports = { DeferredPromise, createDeferredExecutor };
