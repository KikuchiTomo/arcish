// Boosts: per-site custom CSS and "zapped" (hidden) elements. Content scripts
// read them straight from storage, so saving is all that is needed here.
import { LOCAL } from '../../shared/storage-keys.js';

const emptyBoost = () => ({ enabled: true, css: '', zaps: [] });

export class BoostService {
  #store;

  constructor({ store }) {
    this.#store = store;
  }

  get #boosts() {
    return this.#store.local[LOCAL.BOOSTS];
  }

  #save() {
    return this.#store.save(LOCAL.BOOSTS);
  }

  async save(host, patch) {
    this.#boosts[host] = { ...emptyBoost(), ...this.#boosts[host], ...patch };
    await this.#save();
  }

  async remove(host) {
    delete this.#boosts[host];
    await this.#save();
  }

  async zap(host, selector) {
    const boost = (this.#boosts[host] ??= emptyBoost());
    if (!boost.zaps.includes(selector)) boost.zaps.push(selector);
    await this.#save();
  }

  async undoZap(host) {
    this.#boosts[host]?.zaps.pop();
    await this.#save();
  }
}
