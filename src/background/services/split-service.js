// Split View: two tabs side by side inside one window, using Chrome's own
// split view (tabs.createSplit / tabs.unsplit). Both halves are ordinary tabs,
// so every site works exactly as it does in a normal tab.
import { NO_SPLIT, SESSION } from '../../shared/storage-keys.js';

const PANES = 2; // Chrome's split view always shows exactly two tabs

export class SplitService {
  #api;
  #store;
  #i18n;

  constructor({ api, store, i18n }) {
    this.#api = api;
    this.#store = store;
    this.#i18n = i18n;
  }

  get supported() {
    return typeof this.#api.tabs.createSplit === 'function';
  }

  isSplit(tab) {
    return tab?.splitViewId != null && tab.splitViewId !== NO_SPLIT;
  }

  async create(tabIds) {
    if (!this.supported) throw new Error(this.#i18n.t('errorSplitUnsupported'));
    const ids = [...new Set(tabIds)];
    if (ids.length !== PANES) throw new Error(this.#i18n.t('errorSplitNeedsTwo'));
    const [first, second] = await Promise.all(ids.map((id) => this.#api.tabs.get(id)));
    for (const tab of [first, second]) if (this.isSplit(tab)) await this.exit(tab.splitViewId);
    if (second.windowId !== first.windowId) await this.#api.tabs.move(second.id, { windowId: first.windowId, index: -1 });
    const splitViewId = await this.#api.tabs.createSplit(ids);
    await this.#api.tabs.update(first.id, { active: true });
    return splitViewId;
  }

  async exit(splitViewId) {
    if (this.supported && splitViewId != null && splitViewId !== NO_SPLIT) await this.#api.tabs.unsplit(splitViewId).catch(() => {});
  }

  // Split the active tab with the tab used before it (or a new tab); if the
  // active tab is already split, end that split instead.
  async toggle(windowId) {
    const [active] = await this.#api.tabs.query({ windowId, active: true });
    if (!active) return null;
    if (this.isSplit(active)) return this.exit(active.splitViewId);
    const previousId = (this.#store.session[SESSION.PREV_ACTIVE][windowId] || []).find((id) => id !== active.id);
    let partner = previousId != null ? await this.#api.tabs.get(previousId).catch(() => null) : null;
    if (!partner || partner.windowId !== windowId || partner.pinned || this.isSplit(partner)) partner = await this.#api.tabs.create({ windowId, active: false });
    return this.create([active.id, partner.id]);
  }

  async withUrl(tabId, url) {
    const tab = await this.#api.tabs.get(tabId);
    const created = await this.#api.tabs.create({ windowId: tab.windowId, url, active: false });
    return this.create([tab.id, created.id]);
  }
}
