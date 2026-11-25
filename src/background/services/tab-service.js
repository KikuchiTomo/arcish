// Plain tab operations requested by the UI.
import { OPEN_WHERE, PUSH } from '../../shared/messages.js';

export class TabService {
  #api;
  #spaces;
  #split;
  #mini;

  constructor({ api, spaces, split, mini }) {
    this.#api = api;
    this.#spaces = spaces;
    this.#split = split;
    this.#mini = mini;
  }

  get(tabId) {
    return this.#api.tabs.get(tabId);
  }

  async active() {
    return (await this.#api.tabs.query({ active: true, lastFocusedWindow: true }))[0] || null;
  }

  // Open a URL in a new tab, the current tab, a Little Window or a split pane.
  async open({ url, windowId, where = OPEN_WHERE.NEW, tabId }) {
    if (where === OPEN_WHERE.MINI) return this.#mini.open(url);
    if (where === OPEN_WHERE.CURRENT && tabId != null) return this.#api.tabs.update(tabId, { url });
    if (where === OPEN_WHERE.SPLIT && tabId != null) return this.#split.withUrl(tabId, url);
    const targetWindow = windowId ?? (await this.active())?.windowId;
    return this.#api.tabs.create({ windowId: targetWindow, url, active: true });
  }

  async activate(tabId) {
    const tab = await this.#api.tabs.update(tabId, { active: true });
    await this.#api.windows.update(tab.windowId, { focused: true });
  }

  close(tabIds) {
    return this.#api.tabs.remove(tabIds);
  }

  duplicate(tabId) {
    return this.#api.tabs.duplicate(tabId);
  }

  async toggleMute(tabId) {
    const tab = await this.#api.tabs.get(tabId);
    await this.#api.tabs.update(tabId, { muted: !tab.mutedInfo?.muted });
  }

  // Reorder within a window, relative to another tab.
  async move({ tabId, beforeTabId, afterTabId, spaceId }) {
    const [tab, ref] = await Promise.all([this.#api.tabs.get(tabId), this.#api.tabs.get(beforeTabId ?? afterTabId).catch(() => null)]);
    if (!ref || ref.windowId !== tab.windowId) return;
    let index = beforeTabId != null ? ref.index : ref.index + 1;
    if (tab.index < index) index -= 1;
    await this.#api.tabs.move(tabId, { index });
    if (spaceId) await this.#spaces.assign([tabId], spaceId, tab.windowId);
  }

  async push(tabId, message) {
    return this.#api.tabs.sendMessage(tabId, message).then(
      () => true,
      () => false,
    );
  }

  toast(tabId, text) {
    return this.push(tabId, { type: PUSH.TOAST, text });
  }

  async copyUrl(tabId) {
    const tab = tabId != null ? await this.#api.tabs.get(tabId) : await this.active();
    if (tab?.url) await this.push(tab.id, { type: PUSH.COPY, text: tab.url });
  }
}
