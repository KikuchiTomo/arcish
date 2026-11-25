// Archive: closed tabs that can be brought back. Auto-archiving (closing tabs
// that were not used for a while) is opt-in.
import { LIMITS } from '../../config/defaults.js';
import { ARCHIVE_REASON, LOCAL, NO_SPLIT } from '../../shared/storage-keys.js';
import { uid } from '../../shared/text.js';
import { isNewTabUrl, isWebUrl } from '../../shared/url.js';

export class ArchiveService {
  #api;
  #store;
  #spaces;
  #bindings;
  #windows;

  constructor({ api, store, spaces, bindings, windows }) {
    this.#api = api;
    this.#store = store;
    this.#spaces = spaces;
    this.#bindings = bindings;
    this.#windows = windows;
  }

  get #entries() {
    return this.#store.local[LOCAL.ARCHIVE];
  }

  async archive(tabs, reason = ARCHIVE_REASON.MANUAL) {
    if (!tabs.length) return;
    const entries = tabs
      .filter((t) => !isNewTabUrl(t.url))
      .map((t) => ({
        id: uid(),
        url: t.url,
        title: t.title || t.url,
        favIconUrl: isWebUrl(t.favIconUrl) ? t.favIconUrl : null,
        spaceId: this.#spaces.spaceOf(t),
        archivedAt: Date.now(),
        reason,
      }));
    if (entries.length) {
      this.#entries.unshift(...entries);
      this.#entries.length = Math.min(this.#entries.length, LIMITS.archiveEntries);
      await this.#store.save(LOCAL.ARCHIVE);
    }
    await this.#keepWindowsOpen(tabs);
    await this.#api.tabs.remove(tabs.map((t) => t.id)).catch(() => {});
  }

  // Chrome closes a window with its last tab. Archiving must never do that,
  // so a window about to lose every tab gets a fresh one first.
  async #keepWindowsOpen(closing) {
    const ids = new Set(closing.map((t) => t.id));
    for (const windowId of new Set(closing.map((t) => t.windowId))) {
      const remaining = (await this.#api.tabs.query({ windowId })).filter((t) => !ids.has(t.id));
      if (!remaining.length) await this.#api.tabs.create({ windowId, active: true });
    }
  }

  async archiveIds(tabIds, reason) {
    const tabs = await Promise.all(tabIds.map((id) => this.#api.tabs.get(id).catch(() => null)));
    await this.archive(tabs.filter(Boolean), reason);
  }

  // Plain tabs only: never pinned or bound tabs, nor tabs shown in a split view.
  async #disposable(tabs) {
    const bound = this.#bindings.boundTabIds();
    const out = [];
    for (const t of tabs) {
      if (t.pinned || bound.has(t.id) || (t.splitViewId != null && t.splitViewId !== NO_SPLIT)) continue;
      if (await this.#windows.isManaged(t.windowId)) out.push(t);
    }
    return out;
  }

  async autoArchive() {
    const minutes = this.#store.settings.archiveAfter;
    if (!minutes) return;
    const cutoff = Date.now() - minutes * 60_000;
    const idle = (await this.#api.tabs.query({ windowType: 'normal' })).filter((t) => !t.active && !t.audible && t.lastAccessed != null && t.lastAccessed <= cutoff);
    await this.archive(await this.#disposable(idle), ARCHIVE_REASON.AUTO);
  }

  // "Clear": archive every unpinned tab of a space in one window.
  async clearToday(windowId, spaceId) {
    const inSpace = (await this.#api.tabs.query({ windowId })).filter((t) => this.#spaces.spaceOf(t) === spaceId);
    await this.archive(await this.#disposable(inSpace), ARCHIVE_REASON.CLEAR);
  }

  async restore(entryId, windowId) {
    const index = this.#entries.findIndex((e) => e.id === entryId);
    if (index < 0) return;
    const [entry] = this.#entries.splice(index, 1);
    await this.#store.save(LOCAL.ARCHIVE);
    const spaceId = this.#spaces.get(entry.spaceId) ? entry.spaceId : this.#spaces.activeIn(windowId);
    const tab = await this.#api.tabs.create({ windowId, url: entry.url, active: true });
    await this.#spaces.assign([tab.id], spaceId, windowId);
    await this.#spaces.show(windowId, spaceId);
  }

  async restoreLatest(windowId) {
    if (this.#entries.length) await this.restore(this.#entries[0].id, windowId);
  }

  // `entryId` null clears the whole archive.
  async remove(entryId = null) {
    this.#store.local[LOCAL.ARCHIVE] = entryId ? this.#entries.filter((e) => e.id !== entryId) : [];
    await this.#store.save(LOCAL.ARCHIVE);
  }
}
