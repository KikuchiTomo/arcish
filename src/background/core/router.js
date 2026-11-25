// Dispatches runtime messages to registered handlers.
export class MessageRouter {
  #routes = new Map();
  #before;

  constructor({ before }) {
    this.#before = before; // () => Promise — awaited before every handler (boot gate)
  }

  register(routes) {
    for (const [type, handler] of Object.entries(routes)) {
      if (this.#routes.has(type)) throw new Error(`duplicate route: ${type}`);
      this.#routes.set(type, handler);
    }
    return this;
  }

  listen(runtime) {
    runtime.onMessage.addListener((message, sender, respond) => {
      const handler = this.#routes.get(message?.type);
      if (!handler) return false;
      this.#before()
        .then(() => handler(message, sender))
        .then((data) => respond({ data }))
        .catch((e) => {
          console.error('[arcish]', message.type, e);
          respond({ error: String(e?.message || e) });
        });
      return true;
    });
  }
}
