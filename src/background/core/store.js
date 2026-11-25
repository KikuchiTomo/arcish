// In-memory cache of extension state, backed by chrome.storage.
// The service worker is the only writer: UI pages and content scripts mutate
// through runtime messages and observe changes via chrome.storage.onChanged.
import { DEFAULT_SETTINGS } from '../../config/defaults.js';
import { LOCAL, SESSION } from '../../shared/storage-keys.js';

const LOCAL_DEFAULTS = {
  [LOCAL.SPACES]: () => [],
  [LOCAL.FAVORITES]: () => [],
  [LOCAL.ARCHIVE]: () => [],
  [LOCAL.SETTINGS]: () => ({}),
  [LOCAL.BOOSTS]: () => ({}),
  [LOCAL.LIVE_CACHE]: () => ({}),
  [LOCAL.TAB_SNAPSHOT]: () => [],
  [LOCAL.BINDINGS_BACKUP]: () => ({}),
  [LOCAL.LAST_SPACE]: () => null,
  [LOCAL.INITIALIZED]: () => false,
};

const SESSION_DEFAULTS = {
  [SESSION.BINDINGS]: () => ({}),
  [SESSION.TAB_SPACE]: () => ({}),
  [SESSION.GROUP_SPACE]: () => ({}),
  [SESSION.WINDOW_SPACE]: () => ({}),
  [SESSION.LAST_TABS]: () => ({}),
  [SESSION.PREV_ACTIVE]: () => ({}),
  [SESSION.MINI_WINDOWS]: () => [],
  [SESSION.MEDIA_TABS]: () => [],
  [SESSION.LAST_NORMAL_WINDOW]: () => null,
  [SESSION.BOOTED]: () => false,
};

function withDefaults(defaults, stored) {
  const out = {};
  for (const [key, make] of Object.entries(defaults)) out[key] = stored[key] ?? make();
  return out;
}

export class StateStore {
  #api;
  #loading = null;

  constructor(api) {
    this.#api = api;
    this.local = null;
    this.session = null;
  }

  ready() {
    this.#loading ??= this.#load();
    return this.#loading;
  }

  async #load() {
    const [local, session] = await Promise.all([this.#api.storage.local.get(Object.keys(LOCAL_DEFAULTS)), this.#api.storage.session.get(Object.keys(SESSION_DEFAULTS))]);
    this.local = withDefaults(LOCAL_DEFAULTS, local);
    this.local[LOCAL.SETTINGS] = { ...DEFAULT_SETTINGS, ...this.local[LOCAL.SETTINGS] };
    this.session = withDefaults(SESSION_DEFAULTS, session);
  }

  get settings() {
    return this.local[LOCAL.SETTINGS];
  }

  async save(...keys) {
    await this.#api.storage.local.set(Object.fromEntries(keys.map((k) => [k, this.local[k]])));
  }

  async saveSession(...keys) {
    await this.#api.storage.session.set(Object.fromEntries(keys.map((k) => [k, this.session[k]])));
  }
}
