// Favorites / Pinned / Live folder entries: the "bookmark that is also a tab".
//
// An item is persistent. Opening it binds it to a tab; closing the tab only
// unbinds it. Navigating away inside the bound tab keeps the binding, and the
// sidebar offers a way back to the saved URL.
//
//   Favorites -> opened as Chrome pinned tabs (shared by all spaces)
//   Pinned    -> opened as regular tabs that belong to the item's space
import { MARK_MAX_CHARS } from '../../config/folder-icons.js';
import { hasIcon } from '../../shared/icons.js';
import { LOCAL, NODE, ZONE } from '../../shared/storage-keys.js';
import { uid } from '../../shared/text.js';
import * as tree from '../../shared/tree.js';
import { hostOf, samePage } from '../../shared/url.js';

export class ItemService {
  #api;
  #store;
  #bindings;
  #spaces;
  #live;
  #authority;
  #mutex;
  #i18n;

  constructor({ api, store, bindings, spaces, live, authority, mutex, i18n }) {
    this.#api = api;
    this.#store = store;
    this.#bindings = bindings;
    this.#spaces = spaces;
    this.#live = live;
    this.#authority = authority;
    this.#mutex = mutex;
    this.#i18n = i18n;
  }

  get #favorites() {
    return this.#store.local[LOCAL.FAVORITES];
  }

  #saveZone(zone) {
    return this.#store.save(zone === ZONE.FAV ? LOCAL.FAVORITES : LOCAL.SPACES);
  }

  // ---------- lookup ----------
  locate(nodeId) {
    if (!nodeId) return null;
    const liveRef = tree.parseLiveItemId(nodeId);
    if (liveRef) {
      const folder = this.locate(liveRef.folderId);
      const item = folder && this.#live.item(liveRef.folderId, liveRef.key);
      return item ? { zone: ZONE.LIVE, spaceId: folder.spaceId, folderId: liveRef.folderId, key: liveRef.key, node: item } : null;
    }
    const index = this.#favorites.findIndex((n) => n.id === nodeId);
    if (index >= 0) return { zone: ZONE.FAV, spaceId: null, node: this.#favorites[index], list: this.#favorites, index, parent: null };
    for (const space of this.#spaces.all()) {
      const hit = tree.find(space.pinned, nodeId);
      if (hit) return { zone: ZONE.PINNED, spaceId: space.id, ...hit };
    }
    return null;
  }

  #listFor({ zone, spaceId, parentId }) {
    if (zone === ZONE.FAV) return this.#favorites;
    const space = this.#spaces.get(spaceId);
    if (!space) throw new Error(this.#i18n.t('errorSpaceNotFound'));
    const parent = parentId ? tree.find(space.pinned, parentId) : null;
    if (parent?.node.type !== NODE.FOLDER) return space.pinned;
    parent.node.open = true;
    return parent.node.children;
  }

  #linkFromTab(tab) {
    return { id: uid(), type: NODE.LINK, url: tab.url || tab.pendingUrl, title: tab.title || tab.url };
  }

  // Every id whose binding dies with this node (itself, children, live entries).
  #ownedIds(node) {
    const ids = [node.id];
    const addLive = (n) => n.type === NODE.LIVE && ids.push(...this.#live.itemIds(n.id));
    addLive(node);
    tree.walk(node.children, (n) => {
      ids.push(n.id);
      addLive(n);
    });
    return ids;
  }

  // ---------- open / close ----------
  async open(nodeId, windowId) {
    const loc = this.locate(nodeId);
    if (!loc?.node.url) return null;
    if (loc.spaceId) await this.#spaces.show(windowId, loc.spaceId);

    let tab = await this.#bindings.tabOf(nodeId);
    if (tab && tab.windowId !== windowId) {
      await this.#api.tabs.move(tab.id, { windowId, index: -1 });
      if (loc.zone === ZONE.FAV) await this.#api.tabs.update(tab.id, { pinned: true });
      else await this.#spaces.assign([tab.id], loc.spaceId, windowId);
    }
    if (tab) {
      await this.#api.tabs.update(tab.id, { active: true });
    } else {
      tab = await this.#api.tabs.create({ windowId, url: loc.node.url, active: true, pinned: loc.zone === ZONE.FAV });
      await this.#bindings.bind(nodeId, tab.id);
      if (loc.zone !== ZONE.FAV) await this.#spaces.assign([tab.id], loc.spaceId, windowId);
    }
    await this.#api.windows.update(windowId, { focused: true }).catch(() => {});
    if (loc.zone === ZONE.LIVE) await this.#live.markRead(loc.folderId, loc.key);
    if (loc.zone === ZONE.FAV) await this.alignPinnedTabs();
    return tab.id;
  }

  async closeTab(nodeId) {
    const tab = await this.#bindings.tabOf(nodeId);
    await this.#bindings.unbindNode(nodeId);
    if (tab) await this.#api.tabs.remove(tab.id).catch(() => {});
  }

  // Navigate the bound tab back to the item's saved URL.
  async reset(nodeId) {
    const loc = this.locate(nodeId);
    const tab = await this.#bindings.tabOf(nodeId);
    if (loc && tab) await this.#api.tabs.update(tab.id, { url: loc.node.url });
  }

  // Save the bound tab's current URL as the item's URL.
  async adoptTabUrl(nodeId) {
    const loc = this.locate(nodeId);
    const tab = await this.#bindings.tabOf(nodeId);
    if (!loc || !tab || loc.zone === ZONE.LIVE) return;
    loc.node.url = tab.url;
    if (!loc.node.customTitle) loc.node.title = tab.title || loc.node.title;
    await this.#saveZone(loc.zone);
  }

  // ---------- create ----------
  async pinTab(tabId, target = {}) {
    const existing = this.#bindings.nodeIdOf(tabId);
    if (existing) return this.move(existing, { zone: ZONE.PINNED, ...target });
    const tab = await this.#api.tabs.get(tabId);
    const spaceId = target.spaceId || this.#spaces.spaceOf(tab) || this.#spaces.activeIn(tab.windowId);
    const node = this.#linkFromTab(tab);
    tree.insertBefore(this.#listFor({ zone: ZONE.PINNED, spaceId, parentId: target.parentId }), node, target.beforeId);
    await this.#store.save(LOCAL.SPACES);
    await this.#bindings.bind(node.id, tab.id);
    if (tab.pinned) await this.#api.tabs.update(tab.id, { pinned: false });
    await this.#spaces.assign([tab.id], spaceId, tab.windowId);
    return node.id;
  }

  async favoriteTab(tabId, beforeId) {
    const existing = this.#bindings.nodeIdOf(tabId);
    if (existing) return this.move(existing, { zone: ZONE.FAV, beforeId });
    const tab = await this.#api.tabs.get(tabId);
    const node = this.#linkFromTab(tab);
    tree.insertBefore(this.#favorites, node, beforeId);
    await this.#store.save(LOCAL.FAVORITES);
    await this.#bindings.bind(node.id, tab.id);
    if (!tab.pinned) await this.#api.tabs.update(tab.id, { pinned: true });
    await this.alignPinnedTabs();
    return node.id;
  }

  async #toggle(tabId, zone, add) {
    const nodeId = this.#bindings.nodeIdOf(tabId);
    return this.locate(nodeId)?.zone === zone ? this.remove(nodeId) : add();
  }

  togglePin(tabId) {
    return this.#toggle(tabId, ZONE.PINNED, () => this.pinTab(tabId));
  }

  toggleFavorite(tabId) {
    return this.#toggle(tabId, ZONE.FAV, () => this.favoriteTab(tabId));
  }

  async addLink({ zone = ZONE.PINNED, spaceId, parentId, beforeId, url, title }) {
    const node = { id: uid(), type: NODE.LINK, url, title: title || url };
    tree.insertBefore(this.#listFor({ zone, spaceId, parentId }), node, beforeId);
    await this.#saveZone(zone);
    return node.id;
  }

  async createFolder({ spaceId, parentId, beforeId, title, tabIds = [] }) {
    const folder = { id: uid(), type: NODE.FOLDER, title: title || this.#i18n.t('folderDefaultName'), open: true, children: [] };
    tree.insertBefore(this.#listFor({ zone: ZONE.PINNED, spaceId, parentId }), folder, beforeId);
    await this.#store.save(LOCAL.SPACES);
    for (const tabId of tabIds) await this.pinTab(tabId, { spaceId, parentId: folder.id });
    return folder.id;
  }

  async createLiveFolder({ spaceId, parentId, title, source }) {
    const folder = { id: uid(), type: NODE.LIVE, title, open: true, source };
    tree.insertBefore(this.#listFor({ zone: ZONE.PINNED, spaceId, parentId }), folder, null);
    await this.#store.save(LOCAL.SPACES);
    return folder.id;
  }

  async updateLiveFolder(folderId, { title, source }) {
    const loc = this.locate(folderId);
    if (loc?.node.type !== NODE.LIVE) return;
    if (title) loc.node.title = title;
    if (source) loc.node.source = source;
    await this.#store.save(LOCAL.SPACES);
    if (source) await this.#live.forget(folderId);
  }

  // ---------- edit ----------
  async rename(nodeId, title) {
    const loc = this.locate(nodeId);
    if (!loc || loc.zone === ZONE.LIVE) return;
    const text = (title || '').trim();
    loc.node.title = text || loc.node.title;
    if (loc.node.type === NODE.LINK) loc.node.customTitle = !!text;
    await this.#saveZone(loc.zone);
  }

  // The mark shown on a folder's icon: an icon name, an emoji, or '' for the default.
  async setIcon(nodeId, icon) {
    const loc = this.locate(nodeId);
    if (!loc || loc.zone === ZONE.LIVE || loc.node.type === NODE.LINK) return;
    const text = String(icon || '').trim();
    const mark = hasIcon(text) ? text : [...text].slice(0, MARK_MAX_CHARS).join(''); // the length limit is for typed text, not for icon names
    if (mark) loc.node.icon = mark;
    else delete loc.node.icon;
    await this.#store.save(LOCAL.SPACES);
  }

  async toggleOpen(nodeId, open) {
    const loc = this.locate(nodeId);
    if (!loc || loc.node.type === NODE.LINK || loc.zone === ZONE.LIVE) return;
    loc.node.open = open ?? !loc.node.open;
    await this.#store.save(LOCAL.SPACES);
  }

  // Unpin: the item goes away; an open tab survives as a regular tab.
  async remove(nodeId, { closeTab = false } = {}) {
    const loc = this.locate(nodeId);
    if (!loc || loc.zone === ZONE.LIVE) return;
    const ids = this.#ownedIds(loc.node);
    const liveFolders = [loc.node, ...tree.collect(loc.node.children, () => true)].filter((n) => n.type === NODE.LIVE);
    loc.list.splice(loc.index, 1);
    await this.#saveZone(loc.zone);
    for (const folder of liveFolders) await this.#live.forget(folder.id);
    for (const id of ids) {
      const tab = await this.#bindings.tabOf(id);
      await this.#bindings.unbindNode(id);
      if (!tab) continue;
      if (closeTab) await this.#api.tabs.remove(tab.id).catch(() => {});
      else await this.#releaseTab(tab, this.#spaces.activeIn(tab.windowId));
    }
  }

  // Turn a formerly bound tab into a regular tab of `spaceId`.
  async #releaseTab(tab, spaceId) {
    if (tab.pinned) await this.#api.tabs.update(tab.id, { pinned: false });
    await this.#spaces.assign([tab.id], spaceId, tab.windowId);
  }

  // Drag & drop between Favorites, Pinned (any space/folder) and Today.
  async move(nodeId, target) {
    const loc = this.locate(nodeId);
    if (!loc || loc.zone === ZONE.LIVE) return;
    const { node } = loc;

    if (target.zone === ZONE.TODAY) {
      if (node.type !== NODE.LINK) return;
      const spaceId = target.spaceId || loc.spaceId;
      const tab = await this.#bindings.tabOf(nodeId);
      await this.#bindings.unbindNode(nodeId);
      loc.list.splice(loc.index, 1);
      await this.#saveZone(loc.zone);
      if (tab) return this.#releaseTab(tab, spaceId);
      if (target.windowId == null) return;
      const created = await this.#api.tabs.create({ windowId: target.windowId, url: node.url, active: true });
      return this.#spaces.assign([created.id], spaceId, target.windowId);
    }

    if (target.zone === ZONE.FAV && node.type !== NODE.LINK) throw new Error(this.#i18n.t('errorFavoritesLinksOnly'));
    if (target.beforeId === nodeId || target.parentId === nodeId || (target.parentId && tree.contains(node, target.parentId))) return;

    loc.list.splice(loc.index, 1);
    tree.insertBefore(this.#listFor(target), node, target.beforeId);
    await this.#store.save(LOCAL.FAVORITES, LOCAL.SPACES);

    // Keep open tabs consistent with the item's new home.
    for (const id of [node.id, ...tree.collect(node.children, (n) => n.type === NODE.LINK).map((n) => n.id)]) {
      const tab = await this.#bindings.tabOf(id);
      if (!tab) continue;
      if (target.zone === ZONE.FAV) {
        if (!tab.pinned) await this.#api.tabs.update(tab.id, { pinned: true });
      } else {
        await this.#releaseTab(tab, target.spaceId);
      }
    }
    await this.alignPinnedTabs();
  }

  // ---------- Chrome-side sync ----------
  // Chrome's pinned tabs are kept in the same order as the Favorites, so the
  // browser's own "go to tab N" shortcuts land on the Nth open favorite.
  // Pinned tabs that are not favorites stay behind them.
  alignPinnedTabs() {
    return this.#mutex.run('pinned-order', async () => {
      const rank = new Map(this.#favorites.map((node, i) => [this.#bindings.tabIdOf(node.id), i]));
      const order = (tab) => rank.get(tab.id) ?? this.#favorites.length + tab.index;
      const pinned = await this.#api.tabs.query({ pinned: true, windowType: 'normal' });
      for (const [, tabs] of Map.groupBy(pinned, (t) => t.windowId)) {
        const current = tabs.sort((a, b) => a.index - b.index);
        const wanted = [...current].sort((a, b) => order(a) - order(b));
        for (const [index, tab] of wanted.entries()) {
          if (current[index].id === tab.id) continue;
          await this.#api.tabs.move(tab.id, { index });
          current.splice(current.indexOf(tab), 1);
          current.splice(index, 0, tab);
        }
      }
    });
  }

  // A pinned tab was dragged in Chrome's tab strip. Either the Favorites take
  // the new order, or (tab authority) the tabs are put back in theirs.
  async onPinnedTabMoved(tabId) {
    const tab = await this.#api.tabs.get(tabId).catch(() => null);
    if (!tab?.pinned || this.locate(this.#bindings.nodeIdOf(tabId))?.zone !== ZONE.FAV) return;
    if (this.#authority.covers(tabId)) return this.alignPinnedTabs();
    // Chrome wins: the favorites open in this window take the order of their tabs.
    const strip = (await this.#api.tabs.query({ windowId: tab.windowId, pinned: true })).sort((a, b) => a.index - b.index);
    const inStrip = strip.map((t) => this.#favorites.find((node) => this.#bindings.tabIdOf(node.id) === t.id)).filter(Boolean);
    const moved = new Set(inStrip);
    const next = this.#favorites.map((node) => (moved.has(node) ? inStrip.shift() : node));
    if (next.every((node, i) => node === this.#favorites[i])) return null;
    this.#favorites.splice(0, this.#favorites.length, ...next);
    return this.#store.save(LOCAL.FAVORITES);
  }

  // A tab was pinned or unpinned through Chrome's own UI. Depending on the
  // tab authority setting the sidebar either follows or puts it back.
  async onChromePinChanged(tab) {
    const nodeId = this.#bindings.nodeIdOf(tab.id);
    const loc = this.locate(nodeId);
    const enforced = this.#authority.covers(tab.id);

    if (loc?.zone === ZONE.FAV) {
      if (tab.pinned) return; // a favorite's tab is meant to be pinned
      if (enforced) {
        await this.#api.tabs.update(tab.id, { pinned: true });
        await this.alignPinnedTabs();
        return;
      }
      // Chrome wins: the tab is detached; the favorite itself is kept.
      await this.#bindings.unbindNode(nodeId);
      await this.#spaces.assign([tab.id], this.#spaces.activeIn(tab.windowId), tab.windowId);
      return;
    }
    if (!tab.pinned) return;
    if (loc) {
      // A pinned item's tab belongs to its space, not to the pinned strip.
      if (enforced) await this.#releaseTab(tab, loc.spaceId);
      return;
    }
    if (enforced) {
      await this.#api.tabs.update(tab.id, { pinned: false });
      return;
    }
    // Chrome wins: adopt the pinned tab as a Favorite.
    const node = this.#linkFromTab(tab);
    this.#favorites.push(node);
    await this.#store.save(LOCAL.FAVORITES);
    await this.#bindings.bind(node.id, tab.id);
  }

  // Keep the saved title fresh for items the user did not rename.
  async onTabTitle(tab) {
    const loc = this.locate(this.#bindings.nodeIdOf(tab.id));
    if (!loc || loc.zone === ZONE.LIVE || loc.node.customTitle || !tab.title) return;
    if (tab.url !== loc.node.url || loc.node.title === tab.title) return;
    loc.node.title = tab.title;
    await this.#saveZone(loc.zone);
  }

  // Session state was lost (browser restart, or the extension was updated):
  // re-attach items to their tabs. First from the backup, then by matching
  // URLs, loosest match last. Only tabs that match nothing are treated as new.
  async rebind() {
    await this.#bindings.restore((nodeId, tab) => {
      const loc = this.locate(nodeId);
      return !!loc && (loc.zone === ZONE.FAV) === tab.pinned;
    });
    const tabs = await this.#api.tabs.query({ windowType: 'normal' });
    const used = this.#bindings.boundTabIds();
    const favorites = this.#favorites.map((node) => ({ node, fits: (t) => t.pinned }));
    const pinned = this.#spaces.all().flatMap((space) => tree.collect(space.pinned, (n) => n.type === NODE.LINK).map((node) => ({ node, fits: (t) => !t.pinned && this.#spaces.spaceOf(t) === space.id })));
    // A pinned tab on the same site is that favorite's tab even after it navigated;
    // items inside a space must match the page, since a space can hold many tabs of one site.
    const passes = [
      { items: [...favorites, ...pinned], same: (a, b) => a === b },
      { items: [...favorites, ...pinned], same: samePage },
      { items: favorites, same: (a, b) => hostOf(a) === hostOf(b) },
    ];
    for (const { items, same } of passes) {
      for (const { node, fits } of items) {
        if (this.#bindings.tabIdOf(node.id) != null) continue;
        const tab = tabs.find((t) => !used.has(t.id) && fits(t) && same(t.url, node.url));
        if (!tab) continue;
        used.add(tab.id);
        await this.#bindings.bind(node.id, tab.id);
      }
    }
    for (const tab of tabs) if (tab.pinned && !used.has(tab.id)) await this.onChromePinChanged(tab);
    await this.alignPinnedTabs();
  }
}
