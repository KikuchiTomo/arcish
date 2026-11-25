// Space membership kept inside the extension only. Chrome's tab strip and the
// user's own tab groups are never touched. A URL snapshot is persisted so
// membership survives browser restarts (tab ids change across sessions).
import { TIMINGS } from '../../../config/defaults.js';
import { LOCAL, SESSION } from '../../../shared/storage-keys.js';

export class SidebarMembership {
  // Switching to a space that has no tabs leaves the current tab alone.
  needsTabInActiveSpace = false;

  #api;
  #store;
  #timer = null;

  constructor({ api, store }) {
    this.#api = api;
    this.#store = store;
  }

  get #map() {
    return this.#store.session[SESSION.TAB_SPACE];
  }

  spaceOf(tab) {
    return tab ? (this.#map[tab.id] ?? null) : null;
  }

  // Tabs this strategy leaves to the user (none: every tab can join a space).
  isForeign() {
    return false;
  }

  async assign(tabIds, spaceId) {
    for (const id of tabIds) this.#map[id] = spaceId;
    await this.#store.saveSession(SESSION.TAB_SPACE);
    this.#scheduleSnapshot();
  }

  async syncWindow() {}

  async syncAll() {}

  async dropSpace(spaceId) {
    for (const [tabId, sid] of Object.entries(this.#map)) if (sid === spaceId) delete this.#map[tabId];
    await this.#store.saveSession(SESSION.TAB_SPACE);
    this.#scheduleSnapshot();
  }

  async onTabRemoved(tabId) {
    if (!(tabId in this.#map)) return;
    delete this.#map[tabId];
    await this.#store.saveSession(SESSION.TAB_SPACE);
    this.#scheduleSnapshot();
  }

  async onTabReplaced(addedTabId, removedTabId) {
    if (!(removedTabId in this.#map)) return;
    this.#map[addedTabId] = this.#map[removedTabId];
    delete this.#map[removedTabId];
    await this.#store.saveSession(SESSION.TAB_SPACE);
  }

  async onGroupRemoved() {}

  async onTabGroupChanged() {} // tab groups are the user's own in this mode

  onTabUrlChanged() {
    this.#scheduleSnapshot();
  }

  // Restore membership from the last snapshot by URL.
  async reconcile(tabs) {
    const pool = new Map();
    for (const entry of this.#store.local[LOCAL.TAB_SNAPSHOT]) {
      if (!pool.has(entry.url)) pool.set(entry.url, []);
      pool.get(entry.url).push(entry.spaceId);
    }
    const live = new Set(tabs.map((t) => t.id));
    for (const id of Object.keys(this.#map)) if (!live.has(Number(id))) delete this.#map[id];
    for (const tab of tabs) {
      if (tab.pinned || this.#map[tab.id]) continue;
      const spaceId = pool.get(tab.url)?.shift();
      if (spaceId) this.#map[tab.id] = spaceId;
    }
    await this.#store.saveSession(SESSION.TAB_SPACE);
  }

  async entries() {
    return Object.entries(this.#map).map(([tabId, spaceId]) => ({ tabId: Number(tabId), spaceId }));
  }

  async teardown() {
    this.#store.session[SESSION.TAB_SPACE] = {};
    await this.#store.saveSession(SESSION.TAB_SPACE);
  }

  #scheduleSnapshot() {
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => this.#snapshot().catch((e) => console.warn('[arcish] snapshot', e)), TIMINGS.snapshotDebounceMs);
  }

  async #snapshot() {
    const tabs = await this.#api.tabs.query({});
    this.#store.local[LOCAL.TAB_SNAPSHOT] = tabs.filter((t) => this.#map[t.id] && t.url).map((t) => ({ url: t.url, spaceId: this.#map[t.id] }));
    await this.#store.save(LOCAL.TAB_SNAPSHOT);
  }
}
