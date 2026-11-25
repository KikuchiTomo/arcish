// "Now playing": remembers tabs that played audio so the sidebar can offer
// play/pause without switching tabs.
import { SESSION } from '../../shared/storage-keys.js';

// Runs inside the page. Must stay self-contained.
function toggleMediaInPage() {
  const media = [...document.querySelectorAll('video, audio')];
  const playing = media.filter((m) => !m.paused);
  if (playing.length) {
    playing.forEach((m) => m.pause());
    return true;
  }
  const target = media.find((m) => m.currentTime > 0) || media[0];
  target?.play();
  return !!target;
}

export class MediaService {
  #api;
  #store;

  constructor({ api, store }) {
    this.#api = api;
    this.#store = store;
  }

  get #tabs() {
    return this.#store.session[SESSION.MEDIA_TABS];
  }

  async track(tabId) {
    if (this.#tabs.includes(tabId)) return;
    this.#tabs.push(tabId);
    await this.#store.saveSession(SESSION.MEDIA_TABS);
  }

  async dismiss(tabId) {
    if (!this.#tabs.includes(tabId)) return;
    this.#store.session[SESSION.MEDIA_TABS] = this.#tabs.filter((id) => id !== tabId);
    await this.#store.saveSession(SESSION.MEDIA_TABS);
  }

  async toggle(tabId) {
    await this.#api.scripting.executeScript({ target: { tabId, allFrames: true }, func: toggleMediaInPage });
  }
}
