// Knows which windows the extension manages: normal browser windows (Little
// Windows are popups and are left alone).
import { SESSION } from '../../shared/storage-keys.js';

const NORMAL = 'normal';

export class WindowClassifier {
  #api;
  #store;
  #types = new Map();

  constructor({ api, store }) {
    this.#api = api;
    this.#store = store;
  }

  isMini(windowId) {
    return this.#store.session[SESSION.MINI_WINDOWS].includes(windowId);
  }

  async isNormal(windowId) {
    if (windowId == null || windowId < 0) return false;
    if (!this.#types.has(windowId)) {
      const win = await this.#api.windows.get(windowId).catch(() => null);
      if (!win) return false;
      this.#types.set(windowId, win.type);
    }
    return this.#types.get(windowId) === NORMAL;
  }

  isManaged(windowId) {
    return this.isNormal(windowId);
  }

  forget(windowId) {
    this.#types.delete(windowId);
  }

  managedWindows(populate = false) {
    return this.#api.windows.getAll({ populate, windowTypes: [NORMAL] });
  }
}
