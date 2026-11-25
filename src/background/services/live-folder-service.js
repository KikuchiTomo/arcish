// Live Folders: pinned folders whose entries refresh from a source.
// Folder definitions live in the space tree; fetched entries live in a
// separate cache so refreshing never rewrites the user's pinned items.
import { BADGE_COLOR, LIMITS, TIMINGS } from '../../config/defaults.js';
import { LOCAL, NODE } from '../../shared/storage-keys.js';
import { hashStr } from '../../shared/text.js';
import * as tree from '../../shared/tree.js';

export class LiveFolderService {
  #api;
  #store;
  #sources; // (kind) => source | null
  #i18n;

  constructor({ api, store, sources, i18n }) {
    this.#api = api;
    this.#store = store;
    this.#sources = sources;
    this.#i18n = i18n;
  }

  get #cache() {
    return this.#store.local[LOCAL.LIVE_CACHE];
  }

  #folders() {
    return this.#store.local[LOCAL.SPACES].flatMap((s) => tree.collect(s.pinned, (n) => n.type === NODE.LIVE));
  }

  item(folderId, key) {
    return this.#cache[folderId]?.items.find((i) => i.key === key) || null;
  }

  itemIds(folderId) {
    return (this.#cache[folderId]?.items || []).map((i) => tree.liveItemId(folderId, i.key));
  }

  async forget(folderId) {
    delete this.#cache[folderId];
    await this.#store.save(LOCAL.LIVE_CACHE);
    await this.updateBadge();
  }

  async markRead(folderId, key = null) {
    let changed = false;
    for (const item of this.#cache[folderId]?.items || []) {
      if ((key == null || item.key === key) && item.unread) {
        item.unread = false;
        changed = true;
      }
    }
    if (!changed) return;
    await this.#store.save(LOCAL.LIVE_CACHE);
    await this.updateBadge();
  }

  async #refreshFolder(folder) {
    const previous = this.#cache[folder.id];
    const entry = { items: previous?.items || [], lastFetched: Date.now(), error: null };
    try {
      const source = this.#sources(folder.source?.kind);
      if (!source) throw new Error(this.#i18n.t('liveErrorUnknownSource', folder.source?.kind));
      const fetched = await source.fetch(folder.source, { settings: this.#store.settings, limit: LIMITS.liveItems });
      const known = new Map(entry.items.map((i) => [i.key, i]));
      // Entries present on the very first fetch are not "new".
      const isNew = !!previous?.lastFetched;
      entry.items = fetched.slice(0, LIMITS.liveItems).map((it) => {
        const key = hashStr(String(it.id || it.url));
        return { ...it, key, unread: known.has(key) ? known.get(key).unread : isNew };
      });
    } catch (e) {
      entry.error = e.key ? this.#i18n.t(e.key, ...(e.subs || [])) : String(e.message || e);
    }
    this.#cache[folder.id] = entry;
  }

  async refresh({ force = false, folderId = null } = {}) {
    const interval = Math.max(TIMINGS.liveMinRefreshMinutes, this.#store.settings.liveRefreshMinutes) * 60_000;
    const due = this.#folders().filter((f) => (folderId ? f.id === folderId : force || Date.now() - (this.#cache[f.id]?.lastFetched || 0) >= interval));
    if (!due.length) return;
    await Promise.all(due.map((f) => this.#refreshFolder(f)));
    await this.#store.save(LOCAL.LIVE_CACHE);
    await this.updateBadge();
  }

  async updateBadge() {
    const live = new Set(this.#folders().map((f) => f.id));
    const unread = Object.entries(this.#cache).reduce((n, [id, c]) => n + (live.has(id) ? c.items.filter((i) => i.unread).length : 0), 0);
    await this.#api.action.setBadgeBackgroundColor({ color: BADGE_COLOR });
    await this.#api.action.setBadgeText({ text: unread ? String(Math.min(unread, LIMITS.badgeMax)) : '' });
  }
}
