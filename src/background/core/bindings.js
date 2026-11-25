// Item <-> tab bindings. An item (favorite, pinned link, live folder entry) is
// persistent; while it is open it is bound to exactly one tab.
//
// Bindings live in session storage. Updating or reloading the extension
// clears that storage while the tabs stay open, so a backup that also records
// each tab's URL is kept in local storage and used to restore them.
import { LOCAL, SESSION } from '../../shared/storage-keys.js';
import { hostOf } from '../../shared/url.js';

export class BindingRegistry {
  #store;
  #api;

  constructor({ store, api }) {
    this.#store = store;
    this.#api = api;
  }

  get #map() {
    return this.#store.session[SESSION.BINDINGS];
  }

  async #save() {
    await this.#store.saveSession(SESSION.BINDINGS);
    await this.backup();
  }

  // Record every binding together with its tab's current URL.
  async backup() {
    const entries = await Promise.all(
      Object.entries(this.#map).map(async ([nodeId, tabId]) => {
        const tab = await this.#api.tabs.get(tabId).catch(() => null);
        return tab ? [nodeId, { tabId, url: tab.url || tab.pendingUrl || '' }] : null;
      }),
    );
    this.#store.local[LOCAL.BINDINGS_BACKUP] = Object.fromEntries(entries.filter(Boolean));
    await this.#store.save(LOCAL.BINDINGS_BACKUP);
  }

  // Re-attach items to their tabs from the backup. A tab id alone is not
  // proof (ids are reused across browser sessions), so the tab must still be
  // on the site it was on; `isValid(nodeId, tab)` lets the caller veto.
  async restore(isValid) {
    const taken = this.boundTabIds();
    for (const [nodeId, { tabId, url }] of Object.entries(this.#store.local[LOCAL.BINDINGS_BACKUP])) {
      if (nodeId in this.#map || taken.has(tabId)) continue;
      const tab = await this.#api.tabs.get(tabId).catch(() => null);
      if (!tab || hostOf(tab.url) !== hostOf(url) || !isValid(nodeId, tab)) continue;
      this.#map[nodeId] = tabId;
      taken.add(tabId);
    }
    await this.#save();
  }

  tabIdOf(nodeId) {
    return this.#map[nodeId] ?? null;
  }

  nodeIdOf(tabId) {
    for (const [nodeId, id] of Object.entries(this.#map)) if (id === tabId) return nodeId;
    return null;
  }

  boundTabIds() {
    return new Set(Object.values(this.#map));
  }

  // The live tab for an item, dropping the binding if the tab is gone.
  async tabOf(nodeId) {
    const tabId = this.tabIdOf(nodeId);
    if (tabId == null) return null;
    const tab = await this.#api.tabs.get(tabId).catch(() => null);
    if (!tab) await this.unbindNode(nodeId);
    return tab;
  }

  async bind(nodeId, tabId) {
    for (const [other, id] of Object.entries(this.#map)) if (id === tabId && other !== nodeId) delete this.#map[other];
    this.#map[nodeId] = tabId;
    await this.#save();
  }

  async unbindNode(nodeId) {
    if (!(nodeId in this.#map)) return;
    delete this.#map[nodeId];
    await this.#save();
  }

  async unbindTab(tabId) {
    const nodeId = this.nodeIdOf(tabId);
    if (nodeId) await this.unbindNode(nodeId);
  }

  async replaceTab(addedTabId, removedTabId) {
    const nodeId = this.nodeIdOf(removedTabId);
    if (nodeId) await this.bind(nodeId, addedTabId);
  }
}
