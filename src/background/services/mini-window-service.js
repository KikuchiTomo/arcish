// Little Window: a small popup window for quick look-ups (also used by Peek).
import { PATHS, WINDOWS } from '../../config/defaults.js';
import { SESSION } from '../../shared/storage-keys.js';

export class MiniWindowService {
  #api;
  #store;
  #spaces;
  #display;

  constructor({ api, store, spaces, display }) {
    this.#api = api;
    this.#store = store;
    this.#spaces = spaces;
    this.#display = display;
  }

  get #windows() {
    return this.#store.session[SESSION.MINI_WINDOWS];
  }

  isMini(windowId) {
    return this.#windows.includes(windowId);
  }

  // Without a URL the window opens on a launcher (a compact command bar).
  async open(url) {
    const { miniWidth, miniHeight } = this.#store.settings;
    const area = await this.#display.workAreaFor(await this.#api.windows.getLastFocused().catch(() => null));
    const width = Math.min(miniWidth, area.width);
    const height = Math.min(miniHeight, area.height);
    const win = await this.#api.windows.create({
      url: url || this.#api.runtime.getURL(PATHS.mini),
      type: 'popup',
      width,
      height,
      left: Math.round(area.left + area.width - width - WINDOWS.miniMarginPx),
      top: Math.round(area.top + WINDOWS.miniMarginPx),
      focused: true,
    });
    this.#windows.push(win.id);
    await this.#store.saveSession(SESSION.MINI_WINDOWS);
    return win.id;
  }

  // Chrome cannot move a popup's tab into a normal window, so the page is
  // re-opened in the main window and the Little Window is closed.
  async promote(tabId) {
    const tab = await this.#api.tabs.get(tabId);
    let windowId = this.#store.session[SESSION.LAST_NORMAL_WINDOW];
    if (windowId == null || !(await this.#api.windows.get(windowId).catch(() => null))) {
      windowId = (await this.#api.windows.getAll({ windowTypes: ['normal'] }))[0]?.id ?? null;
    }
    if (windowId == null) {
      await this.#api.windows.create({ url: tab.url, focused: true });
    } else {
      const created = await this.#api.tabs.create({ windowId, url: tab.url, active: true });
      await this.#spaces.assign([created.id], this.#spaces.activeIn(windowId), windowId);
      await this.#api.windows.update(windowId, { focused: true });
    }
    await this.#api.windows.remove(tab.windowId).catch(() => {});
  }

  async onWindowRemoved(windowId) {
    if (!this.isMini(windowId)) return;
    this.#store.session[SESSION.MINI_WINDOWS] = this.#windows.filter((id) => id !== windowId);
    await this.#store.saveSession(SESSION.MINI_WINDOWS);
  }
}
