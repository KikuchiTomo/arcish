// Spaces: CRUD, which space a window shows, and which space a tab joins.
import { DEFAULT_COLOR, PALETTE, isColor } from '../../config/colors.js';
import { LOCAL, SESSION } from '../../shared/storage-keys.js';
import { uid } from '../../shared/text.js';
import { matchPattern, isWebUrl } from '../../shared/url.js';

export class SpaceService {
  #api;
  #store;
  #windows;
  #mutex;
  #i18n;
  #membership = null;

  constructor({ api, store, windows, mutex, i18n }) {
    this.#api = api;
    this.#store = store;
    this.#windows = windows;
    this.#mutex = mutex;
    this.#i18n = i18n;
  }

  // Membership depends on space lookups and vice versa; wired after construction.
  useMembership(membership) {
    this.#membership = membership;
  }

  // ---------- queries ----------
  all() {
    return this.#store.local[LOCAL.SPACES];
  }

  get(id) {
    return this.all().find((s) => s.id === id) || null;
  }

  activeIn(windowId) {
    const fromWindow = this.#store.session[SESSION.WINDOW_SPACE][windowId];
    if (this.get(fromWindow)) return fromWindow;
    const last = this.#store.local[LOCAL.LAST_SPACE];
    return this.get(last) ? last : (this.all()[0]?.id ?? null);
  }

  spaceOf(tab) {
    const id = this.#membership.spaceOf(tab);
    return this.get(id) ? id : null;
  }

  // Air Traffic Control: the space a URL is routed to, if any rule matches.
  routeFor(url) {
    if (!isWebUrl(url)) return null;
    const rule = this.#store.settings.atcRules.find((r) => this.get(r.spaceId) && matchPattern(r.pattern, url));
    return rule?.spaceId ?? null;
  }

  // ---------- membership ----------
  async assign(tabIds, spaceId, windowId) {
    const tabs = await Promise.all(tabIds.map((id) => this.#api.tabs.get(id).catch(() => null)));
    const ids = tabs.filter((t) => t && !t.pinned).map((t) => t.id);
    if (ids.length && this.get(spaceId)) await this.#membership.assign(ids, spaceId, windowId);
  }

  // Decide the space of a tab that just appeared in a window.
  adopt(tabId) {
    return this.#mutex.run('adopt', async () => {
      const tab = await this.#api.tabs.get(tabId).catch(() => null);
      if (!tab || tab.pinned || this.spaceOf(tab) || this.#membership.isForeign(tab)) return;
      if (!(await this.#windows.isManaged(tab.windowId))) return;
      const opener = tab.openerTabId != null ? await this.#api.tabs.get(tab.openerTabId).catch(() => null) : null;
      const routed = this.routeFor(tab.pendingUrl || tab.url);
      const spaceId = routed || this.spaceOf(opener) || this.activeIn(tab.windowId);
      if (!spaceId) return;
      await this.assign([tab.id], spaceId, tab.windowId);
      if (routed && tab.active) await this.#show(tab.windowId, routed);
    });
  }

  // Re-route a young tab once its real URL is known.
  async reroute(tab, url) {
    const routed = this.routeFor(url);
    if (!routed || tab.pinned || this.spaceOf(tab) === routed || !(await this.#windows.isManaged(tab.windowId))) return;
    await this.assign([tab.id], routed, tab.windowId);
    if (tab.active) await this.#show(tab.windowId, routed);
  }

  async moveTabs(tabIds, spaceId) {
    const tabs = (await Promise.all(tabIds.map((id) => this.#api.tabs.get(id).catch(() => null)))).filter(Boolean);
    const byWindow = Map.groupBy(tabs, (t) => t.windowId);
    for (const [windowId, list] of byWindow) {
      await this.assign(list.map((t) => t.id), spaceId, windowId);
      await this.#membership.syncWindow(windowId);
    }
  }

  // ---------- switching ----------
  // Mark `spaceId` as the space shown in a window (no tab activation).
  async #show(windowId, spaceId) {
    this.#store.session[SESSION.WINDOW_SPACE][windowId] = spaceId;
    this.#store.local[LOCAL.LAST_SPACE] = spaceId;
    await Promise.all([this.#store.saveSession(SESSION.WINDOW_SPACE), this.#store.save(LOCAL.LAST_SPACE)]);
    await this.#membership.syncWindow(windowId);
  }

  async show(windowId, spaceId) {
    if (this.get(spaceId) && this.activeIn(windowId) !== spaceId) await this.#show(windowId, spaceId);
  }

  async switchTo(windowId, spaceId) {
    if (!this.get(spaceId)) return;
    this.#store.session[SESSION.WINDOW_SPACE][windowId] = spaceId;
    const [active] = await this.#api.tabs.query({ windowId, active: true });
    if (this.spaceOf(active) !== spaceId) {
      const target = await this.#lastTabOf(windowId, spaceId);
      if (target) {
        await this.#api.tabs.update(target.id, { active: true });
      } else if (this.#membership.needsTabInActiveSpace) {
        const tab = await this.#api.tabs.create({ windowId, active: true });
        await this.assign([tab.id], spaceId, windowId);
      }
    }
    await this.#show(windowId, spaceId);
  }

  async cycle(windowId, direction) {
    const spaces = this.all();
    if (spaces.length < 2) return;
    const i = spaces.findIndex((s) => s.id === this.activeIn(windowId));
    await this.switchTo(windowId, spaces[(i + direction + spaces.length) % spaces.length].id);
  }

  // The sidebar follows the tab the user activates. When Chrome activates a
  // tab of another space only because the active tab was closed, the window
  // stays in its space as long as that space still has tabs.
  async onTabActivated(tab, { afterClose = false } = {}) {
    const spaceId = this.spaceOf(tab);
    if (!spaceId) return;
    const current = this.activeIn(tab.windowId);
    if (afterClose && spaceId !== current) {
      const stay = await this.#lastTabOf(tab.windowId, current);
      if (stay) {
        await this.#api.tabs.update(stay.id, { active: true });
        return;
      }
    }
    this.#store.session[SESSION.LAST_TABS][`${tab.windowId}:${spaceId}`] = tab.id;
    await this.#store.saveSession(SESSION.LAST_TABS);
    await this.show(tab.windowId, spaceId);
  }

  // The tab of a space that was used most recently in a window.
  async #lastTabOf(windowId, spaceId) {
    const tabs = (await this.#api.tabs.query({ windowId })).filter((t) => this.spaceOf(t) === spaceId);
    const byId = new Map(tabs.map((t) => [t.id, t]));
    // Most recently used first: the window's activation history, then the space's own record.
    const history = [...(this.#store.session[SESSION.PREV_ACTIVE][windowId] || []), this.#store.session[SESSION.LAST_TABS][`${windowId}:${spaceId}`]];
    const recent = history.find((id) => byId.has(id));
    return byId.get(recent) || tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0] || null;
  }

  async onWindowRemoved(windowId) {
    delete this.#store.session[SESSION.WINDOW_SPACE][windowId];
    await this.#store.saveSession(SESSION.WINDOW_SPACE);
  }

  // ---------- CRUD ----------
  async create({ name, emoji, color } = {}) {
    const used = new Set(this.all().map((s) => s.color));
    const space = {
      id: uid(),
      name: name?.trim() || this.#i18n.t('spaceDefaultName', this.all().length + 1),
      emoji: emoji?.trim() ?? '',
      color: isColor(color) ? color : PALETTE.find((p) => !used.has(p.color))?.color || DEFAULT_COLOR,
      pinned: [],
    };
    this.all().push(space);
    await this.#store.save(LOCAL.SPACES);
    return space;
  }

  async update(id, patch) {
    const space = this.get(id);
    if (!space) return;
    if (patch.name != null) space.name = patch.name.trim() || space.name;
    if (patch.emoji != null) space.emoji = patch.emoji.trim();
    if (isColor(patch.color)) space.color = patch.color;
    if (typeof patch.collapsed === 'boolean') space.collapsed = patch.collapsed;
    await this.#store.save(LOCAL.SPACES);
    await this.#membership.syncAll();
  }

  // `disposeTabs(tabs)` decides what happens to the space's open tabs.
  async remove(id, disposeTabs) {
    if (this.all().length <= 1) throw new Error(this.#i18n.t('errorLastSpace'));
    if (!this.get(id)) return;
    const fallback = this.all().find((s) => s.id !== id);
    for (const win of await this.#windows.managedWindows()) {
      if (this.activeIn(win.id) === id) await this.switchTo(win.id, fallback.id);
    }
    const tabs = (await this.#api.tabs.query({})).filter((t) => this.spaceOf(t) === id);
    await disposeTabs(tabs);
    await this.#membership.dropSpace(id);
    this.#store.local[LOCAL.SPACES] = this.all().filter((s) => s.id !== id);
    this.#store.settings.atcRules = this.#store.settings.atcRules.filter((r) => r.spaceId !== id);
    if (this.#store.local[LOCAL.LAST_SPACE] === id) this.#store.local[LOCAL.LAST_SPACE] = fallback.id;
    await this.#store.save(LOCAL.SPACES, LOCAL.SETTINGS, LOCAL.LAST_SPACE);
  }

  // ---------- startup ----------
  async reconcile() {
    const wins = await this.#windows.managedWindows(true);
    const tabs = wins.flatMap((w) => w.tabs);
    await this.#membership.reconcile(tabs);
    for (const win of wins) {
      const fresh = await this.#api.tabs.query({ windowId: win.id });
      const active = fresh.find((t) => t.active);
      const spaceId = this.spaceOf(active) || this.activeIn(win.id);
      if (!spaceId) continue;
      this.#store.session[SESSION.WINDOW_SPACE][win.id] = spaceId;
      const stray = fresh.filter((t) => !t.pinned && !this.spaceOf(t) && !this.#membership.isForeign(t)).map((t) => t.id);
      if (stray.length) await this.assign(stray, spaceId, win.id);
      await this.#membership.syncWindow(win.id);
    }
    await this.#store.saveSession(SESSION.WINDOW_SPACE);
  }
}
