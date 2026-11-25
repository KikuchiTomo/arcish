// Selects the membership strategy from settings and migrates tabs when the
// mode changes. Callers depend on this facade, not on a concrete strategy.
import { SPACE_MODE } from '../../../shared/storage-keys.js';
import { GroupMembership } from './group-membership.js';
import { SidebarMembership } from './sidebar-membership.js';

export class Membership {
  #store;
  #api;
  #strategies;

  constructor(deps) {
    this.#store = deps.store;
    this.#api = deps.api;
    this.#strategies = {
      [SPACE_MODE.SIDEBAR]: new SidebarMembership(deps),
      [SPACE_MODE.GROUPS]: new GroupMembership(deps),
    };
  }

  get #current() {
    return this.#strategies[this.#store.settings.spaceMode] || this.#strategies[SPACE_MODE.SIDEBAR];
  }

  get needsTabInActiveSpace() {
    return this.#current.needsTabInActiveSpace;
  }

  spaceOf = (tab) => this.#current.spaceOf(tab);
  isForeign = (tab) => this.#current.isForeign(tab);
  assign = (tabIds, spaceId, windowId) => this.#current.assign(tabIds, spaceId, windowId);
  syncWindow = (windowId) => this.#current.syncWindow(windowId);
  syncAll = () => this.#current.syncAll();
  dropSpace = (spaceId) => this.#current.dropSpace(spaceId);
  onTabRemoved = (tabId) => this.#current.onTabRemoved(tabId);
  onTabReplaced = (added, removed) => this.#current.onTabReplaced(added, removed);
  onTabUrlChanged = () => this.#current.onTabUrlChanged();
  onGroupRemoved = (groupId) => this.#current.onGroupRemoved(groupId);
  onTabGroupChanged = (tabId) => this.#current.onTabGroupChanged(tabId);
  reconcile = (tabs) => this.#current.reconcile(tabs);

  // Carry every tab's space over to the newly selected mode.
  async migrate(fromMode) {
    const from = this.#strategies[fromMode];
    const to = this.#current;
    if (!from || from === to) return;
    const entries = await from.entries();
    await from.teardown();
    const buckets = new Map();
    for (const { tabId, spaceId } of entries) {
      const tab = await this.#api.tabs.get(tabId).catch(() => null);
      if (!tab || tab.pinned) continue;
      const key = `${tab.windowId}:${spaceId}`;
      if (!buckets.has(key)) buckets.set(key, { windowId: tab.windowId, spaceId, tabIds: [] });
      buckets.get(key).tabIds.push(tabId);
    }
    for (const b of buckets.values()) await to.assign(b.tabIds, b.spaceId, b.windowId);
    await to.syncAll();
  }
}
