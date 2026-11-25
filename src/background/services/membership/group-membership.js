// Space membership mirrored to Chrome tab groups (opt-in). Each space owns at
// most one group per window; the active space's group is expanded and the
// others collapse, so the native tab strip follows the sidebar. Groups the
// user created themselves are never modified.
import { groupColorFor, spaceColor } from '../../../config/colors.js';
import { NO_GROUP, SESSION } from '../../../shared/storage-keys.js';
import { spaceLabel } from '../../../shared/text.js';

export class GroupMembership {
  // Chrome cannot collapse a group that holds the active tab, so the active
  // space always needs a tab of its own.
  needsTabInActiveSpace = true;

  #api;
  #store;
  #mutex;
  #spaces; // { get(id), activeIn(windowId) }
  #authority;

  constructor({ api, store, mutex, spaces, authority }) {
    this.#api = api;
    this.#store = store;
    this.#mutex = mutex;
    this.#spaces = spaces;
    this.#authority = authority;
  }

  get #map() {
    return this.#store.session[SESSION.GROUP_SPACE];
  }

  // The space each tab is meant to be in, independent of where Chrome's UI
  // may have dragged it since.
  get #intended() {
    return this.#store.session[SESSION.TAB_SPACE];
  }

  spaceOf(tab) {
    if (!tab || tab.groupId == null || tab.groupId === NO_GROUP) return null;
    return this.#map[tab.groupId] ?? null;
  }

  // A tab in a group the user made is theirs; we do not move it.
  isForeign(tab) {
    return tab.groupId !== NO_GROUP && !this.#map[tab.groupId];
  }

  async #groupFor(windowId, spaceId) {
    const groups = await this.#api.tabGroups.query({ windowId });
    return groups.find((g) => this.#map[g.id] === spaceId) || null;
  }

  assign(tabIds, spaceId, windowId) {
    return this.#mutex.run(`group:${windowId}`, () => this.#assign(tabIds, spaceId, windowId));
  }

  async #assign(tabIds, spaceId, windowId) {
    const space = this.#spaces.get(spaceId);
    if (!space || !tabIds.length) return;
    // Recorded first, so the group-change events our own move triggers already agree with it.
    for (const id of tabIds) this.#intended[id] = spaceId;
    await this.#store.saveSession(SESSION.TAB_SPACE);
    const existing = await this.#groupFor(windowId, spaceId);
    if (existing) {
      await this.#api.tabs.group({ groupId: existing.id, tabIds });
      return;
    }
    const groupId = await this.#api.tabs.group({ tabIds, createProperties: { windowId } });
    this.#map[groupId] = spaceId;
    await this.#store.saveSession(SESSION.GROUP_SPACE);
    await this.#api.tabGroups.update(groupId, this.#appearance(space, windowId)).catch(() => {});
  }

  // A tab changed group through Chrome's UI. Either the sidebar puts it back
  // (tab authority) or it follows Chrome.
  onTabGroupChanged(tabId) {
    return this.#mutex.run('group-change', async () => {
      const tab = await this.#api.tabs.get(tabId).catch(() => null);
      if (!tab || tab.pinned) return;
      await this.#mutex.run(`group:${tab.windowId}`, async () => {
        const intended = this.#intended[tab.id];
        const actual = this.spaceOf(tab);
        if (intended === actual) return;
        if (intended && this.#spaces.get(intended) && this.#authority.covers(tab.id)) {
          await this.#assign([tab.id], intended, tab.windowId);
          return;
        }
        if (actual) this.#intended[tab.id] = actual;
        else delete this.#intended[tab.id];
        await this.#store.saveSession(SESSION.TAB_SPACE);
      });
    });
  }

  #appearance(space, windowId) {
    return { title: spaceLabel(space), color: groupColorFor(spaceColor(space)), collapsed: this.#spaces.activeIn(windowId) !== space.id };
  }

  async syncWindow(windowId) {
    const groups = await this.#api.tabGroups.query({ windowId }).catch(() => []);
    await Promise.all(
      groups.map((g) => {
        const space = this.#spaces.get(this.#map[g.id]);
        if (!space) return null;
        const want = this.#appearance(space, windowId);
        if (g.collapsed === want.collapsed && g.title === want.title && g.color === want.color) return null;
        return this.#api.tabGroups.update(g.id, want).catch(() => {});
      }),
    );
  }

  async syncAll() {
    const wins = await this.#api.windows.getAll({ windowTypes: ['normal'] });
    await Promise.all(wins.map((w) => this.syncWindow(w.id)));
  }

  async dropSpace(spaceId) {
    for (const [groupId, sid] of Object.entries(this.#map)) if (sid === spaceId) delete this.#map[groupId];
    await this.#store.saveSession(SESSION.GROUP_SPACE);
  }

  async onTabRemoved(tabId) {
    if (!(tabId in this.#intended)) return;
    delete this.#intended[tabId];
    await this.#store.saveSession(SESSION.TAB_SPACE);
  }

  async onTabReplaced() {}

  onTabUrlChanged() {}

  async onGroupRemoved(groupId) {
    if (!(groupId in this.#map)) return;
    delete this.#map[groupId];
    await this.#store.saveSession(SESSION.GROUP_SPACE);
  }

  // Group ids change across restarts; re-map our groups by their title.
  async reconcile() {
    const groups = await this.#api.tabGroups.query({});
    const live = new Set(groups.map((g) => g.id));
    for (const id of Object.keys(this.#map)) if (!live.has(Number(id))) delete this.#map[id];
    const byLabel = new Map(this.#spaces.all().map((s) => [spaceLabel(s), s.id]));
    for (const g of groups) if (!this.#map[g.id] && byLabel.has(g.title)) this.#map[g.id] = byLabel.get(g.title);
    for (const tab of await this.#api.tabs.query({})) if (this.spaceOf(tab)) this.#intended[tab.id] = this.spaceOf(tab);
    await this.#store.saveSession(SESSION.GROUP_SPACE, SESSION.TAB_SPACE);
  }

  async entries() {
    const tabs = await this.#api.tabs.query({});
    return tabs.filter((t) => this.spaceOf(t)).map((t) => ({ tabId: t.id, spaceId: this.spaceOf(t) }));
  }

  // Leaving this mode: dissolve our groups so the tab strip is back to normal.
  async teardown() {
    const tabs = await this.#api.tabs.query({});
    const ours = tabs.filter((t) => this.spaceOf(t)).map((t) => t.id);
    if (ours.length) await this.#api.tabs.ungroup(ours).catch(() => {});
    this.#store.session[SESSION.GROUP_SPACE] = {};
    this.#store.session[SESSION.TAB_SPACE] = {};
    await this.#store.saveSession(SESSION.GROUP_SPACE, SESSION.TAB_SPACE);
  }
}
