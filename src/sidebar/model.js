// Read model for the sidebar. Keeps a local copy of extension state that is
// updated incrementally from storage change events, and re-queries tabs only
// when a tab event that affects rendering arrives.
import { DEFAULT_SETTINGS, LIMITS } from '../config/defaults.js';
import { spaceColor } from '../config/colors.js';
import { tabSpaceId, windowSpaceId } from '../shared/membership.js';
import { LOCAL, NO_GROUP, NO_SPLIT, SESSION, SIDEBAR_VIEW } from '../shared/storage-keys.js';
import * as tree from '../shared/tree.js';

// tabs.onUpdated fires for many properties; only these change what we draw.
const RELEVANT_TAB_CHANGES = ['title', 'url', 'favIconUrl', 'audible', 'mutedInfo', 'pinned', 'groupId', 'splitViewId'];

// Storage keys the sidebar draws from; changes to anything else need no render.
const RENDERED_KEYS = new Set([LOCAL.SPACES, LOCAL.FAVORITES, LOCAL.ARCHIVE, LOCAL.SETTINGS, LOCAL.BOOSTS, LOCAL.LIVE_CACHE, LOCAL.LAST_SPACE, SESSION.BINDINGS, SESSION.TAB_SPACE, SESSION.GROUP_SPACE, SESSION.WINDOW_SPACE, SESSION.MEDIA_TABS, SESSION.SIDEBAR_VIEW]);

export class SidebarModel {
  #listeners = [];
  #watchDownloads;
  #loading = null; // tab query in flight
  #stale = false; // a tab event arrived while loading

  constructor(windowId) {
    this.windowId = windowId;
    this.local = {};
    this.session = {};
    this.tabs = [];
    this.groups = [];
    this.downloads = [];
    this.fileIcons = new Map(); // download id -> icon data URL
    this.#watchDownloads = false;
  }

  async init() {
    [this.local, this.session] = await Promise.all([chrome.storage.local.get(Object.values(LOCAL)), chrome.storage.session.get(Object.values(SESSION))]);
    await this.#loadTabs();
    this.#subscribe();
  }

  onChange(listener) {
    this.#listeners.push(listener);
  }

  #emit() {
    for (const listener of this.#listeners) listener();
  }

  async #loadTabs() {
    [this.tabs, this.groups] = await Promise.all([chrome.tabs.query({}), chrome.tabGroups.query({ windowId: this.windowId })]);
    this.tabById = new Map(this.tabs.map((t) => [t.id, t]));
  }

  // Bursts of tab events share one query: at most one in flight, one queued.
  #reloadTabs() {
    if (this.#loading) {
      this.#stale = true;
      return;
    }
    this.#loading = this.#loadTabs().finally(() => {
      this.#loading = null;
      this.#emit();
      if (this.#stale) {
        this.#stale = false;
        this.#reloadTabs();
      }
    });
  }

  #subscribe() {
    chrome.storage.onChanged.addListener((changes, area) => {
      const target = area === 'local' ? this.local : area === 'session' ? this.session : null;
      if (!target) return;
      for (const [key, { newValue }] of Object.entries(changes)) target[key] = newValue;
      if (Object.keys(changes).some((key) => RENDERED_KEYS.has(key))) this.#emit();
    });
    const reload = () => this.#reloadTabs();
    const { tabs, tabGroups } = chrome;
    for (const event of [tabs.onCreated, tabs.onRemoved, tabs.onMoved, tabs.onActivated, tabs.onAttached, tabs.onDetached, tabs.onReplaced, tabGroups.onCreated, tabGroups.onUpdated, tabGroups.onRemoved]) {
      event.addListener(reload);
    }
    tabs.onUpdated.addListener((_id, change) => {
      if (RELEVANT_TAB_CHANGES.some((key) => key in change)) reload();
    });
  }

  // Downloads are loaded only once the Library asks for them.
  async loadDownloads() {
    if (!this.#watchDownloads) {
      this.#watchDownloads = true;
      const reload = () => this.loadDownloads();
      for (const event of [chrome.downloads.onCreated, chrome.downloads.onChanged, chrome.downloads.onErased]) event.addListener(reload);
    }
    this.downloads = await chrome.downloads.search({ orderBy: ['-startTime'], limit: LIMITS.downloadsRendered });
    this.#emit();
    const missing = this.downloads.filter((d) => !this.fileIcons.has(d.id));
    const icons = await Promise.all(missing.map((d) => chrome.downloads.getFileIcon(d.id, { size: 32 }).catch(() => null)));
    missing.forEach((d, i) => this.fileIcons.set(d.id, icons[i]));
    if (icons.some(Boolean)) this.#emit();
  }

  // Optimistic updates: show the result of an action at once; the storage
  // event that follows carries the same state.
  showSpace(spaceId) {
    this.session[SESSION.WINDOW_SPACE] = { ...this.session[SESSION.WINDOW_SPACE], [this.windowId]: spaceId };
  }

  // Mark a tab as the active one before Chrome confirms it.
  showActiveTab(tabId) {
    for (const tab of this.tabs) if (tab.windowId === this.windowId) tab.active = tab.id === tabId;
  }

  // ---------- selectors ----------
  get settings() {
    return { ...DEFAULT_SETTINGS, ...this.local[LOCAL.SETTINGS] };
  }

  get spaces() {
    return this.local[LOCAL.SPACES] || [];
  }

  get favorites() {
    return this.local[LOCAL.FAVORITES] || [];
  }

  get spaceId() {
    return windowSpaceId(this.windowId, this.session, this.local, this.spaces);
  }

  get space() {
    return this.spaces.find((s) => s.id === this.spaceId) || null;
  }

  get color() {
    return spaceColor(this.space);
  }

  get activeTab() {
    return this.tabs.find((t) => t.windowId === this.windowId && t.active) || null;
  }

  get pendingView() {
    return Object.values(SIDEBAR_VIEW).includes(this.session[SESSION.SIDEBAR_VIEW]) ? this.session[SESSION.SIDEBAR_VIEW] : null;
  }

  tab(id) {
    return this.tabById.get(id) || null;
  }

  tabOfNode(nodeId) {
    const tabId = this.session[SESSION.BINDINGS]?.[nodeId];
    return tabId != null ? this.tab(tabId) : null;
  }

  spaceOfTab(tab) {
    const id = tabSpaceId(tab, this.session, this.settings.spaceMode);
    return this.spaces.some((s) => s.id === id) ? id : null;
  }

  isSplit(tab) {
    return tab?.splitViewId != null && tab.splitViewId !== NO_SPLIT;
  }

  // The tabs shown together in one split view, in tab-strip order.
  splitTabs(splitViewId) {
    return this.tabs.filter((t) => t.splitViewId === splitViewId).sort((a, b) => a.index - b.index);
  }

  get newestFirst() {
    return this.settings.newTabsOnTop;
  }

  // Unpinned, unbound tabs of this window that belong to the current space.
  // Tabs without a space (e.g. in a tab group the user made) show everywhere.
  todayTabs() {
    const bound = new Set(Object.values(this.session[SESSION.BINDINGS] || {}));
    const list = this.tabs.filter((t) => {
      if (t.windowId !== this.windowId || t.pinned || bound.has(t.id)) return false;
      const spaceId = this.spaceOfTab(t);
      return !spaceId || spaceId === this.spaceId;
    });
    list.sort((a, b) => a.index - b.index);
    return this.newestFirst ? list.reverse() : list;
  }

  // The user's own Chrome tab group a tab sits in, if it is not one of ours.
  foreignGroupOf(tab) {
    if (tab.groupId === NO_GROUP || this.spaceOfTab(tab)) return null;
    return this.groups.find((g) => g.id === tab.groupId) || null;
  }

  mediaTabs() {
    const active = this.activeTab?.id;
    return (this.session[SESSION.MEDIA_TABS] || [])
      .map((id) => this.tab(id))
      .filter((t) => t && t.id !== active)
      .slice(0, LIMITS.mediaCards);
  }

  liveEntry(folderId) {
    return this.local[LOCAL.LIVE_CACHE]?.[folderId] || { items: [], lastFetched: 0, error: null };
  }

  liveItem(liveId) {
    const ref = tree.parseLiveItemId(liveId);
    return ref ? this.liveEntry(ref.folderId).items.find((i) => i.key === ref.key) || null : null;
  }

  archive(query = '') {
    const q = query.trim().toLowerCase();
    const all = this.local[LOCAL.ARCHIVE] || [];
    return (q ? all.filter((e) => `${e.title} ${e.url}`.toLowerCase().includes(q)) : all).slice(0, LIMITS.archiveRendered);
  }

  get boosts() {
    return this.local[LOCAL.BOOSTS] || {};
  }

  get archiveSize() {
    return (this.local[LOCAL.ARCHIVE] || []).length;
  }

  findNode(id) {
    const favorite = this.favorites.find((n) => n.id === id);
    if (favorite) return favorite;
    for (const space of this.spaces) {
      const hit = tree.find(space.pinned, id);
      if (hit) return hit.node;
    }
    return null;
  }
}
