// Opens the command bar. Preferred host is an overlay inside the current page;
// whenever that is not possible (browser pages, the Web Store, a page that
// blocks the frame) it opens as a small window instead, so it always works.
import { PATHS, WINDOWS } from '../../config/defaults.js';
import { PALETTE_HOST, PALETTE_MODE, PUSH } from '../../shared/messages.js';
import { isScriptable } from '../../shared/url.js';

export class CommandBarService {
  #api;

  constructor({ api }) {
    this.#api = api;
  }

  async open(mode = PALETTE_MODE.NEW, tab = null) {
    const target = tab || (await this.#api.tabs.query({ active: true, lastFocusedWindow: true }))[0];
    if (target && isScriptable(target.url)) {
      try {
        await this.#api.tabs.sendMessage(target.id, { type: PUSH.PALETTE_OPEN, mode });
        return;
      } catch {
        // No content script in this tab (e.g. opened before install): use the window host.
      }
    }
    await this.openWindow(mode, target);
  }

  async openWindow(mode, tab) {
    const win = tab ? await this.#api.windows.get(tab.windowId).catch(() => null) : null;
    const { paletteWidth: width, paletteHeight: height, paletteTopOffsetPx } = WINDOWS;
    const params = new URLSearchParams({ host: PALETTE_HOST.WINDOW, mode, tabId: String(tab?.id ?? ''), windowId: String(tab?.windowId ?? '') });
    await this.#api.windows.create({
      url: this.#api.runtime.getURL(`${PATHS.palette}?${params}`),
      type: 'popup',
      width,
      height,
      left: win ? Math.round(win.left + (win.width - width) / 2) : undefined,
      top: win ? Math.round(win.top + paletteTopOffsetPx) : undefined,
      focused: true,
    });
  }
}
