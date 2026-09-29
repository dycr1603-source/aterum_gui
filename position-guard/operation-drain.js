'use strict';

function operationDrain() {
  const pending = new Set();
  return {
    run(operation) {
      const promise = Promise.resolve().then(operation);
      pending.add(promise);
      promise.then(() => pending.delete(promise), () => pending.delete(promise));
      return promise;
    },
    async wait() { while (pending.size) await Promise.allSettled([...pending]); }
  };
}
module.exports = { operationDrain };
