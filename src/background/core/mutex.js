// Keyed mutex: serialises async work that must not interleave.
export class KeyedMutex {
  #tails = new Map();

  run(key, task) {
    const prev = this.#tails.get(key) || Promise.resolve();
    const next = prev.then(task, task);
    const tail = next.catch(() => {});
    this.#tails.set(key, tail);
    tail.then(() => {
      if (this.#tails.get(key) === tail) this.#tails.delete(key);
    });
    return next;
  }
}
