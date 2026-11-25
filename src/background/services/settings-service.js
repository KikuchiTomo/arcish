// Settings and backup. Other services react to changes through `onChange`
// instead of this service knowing about them.
import { DEFAULT_SETTINGS, LIMITS } from '../../config/defaults.js';
import { LOCAL } from '../../shared/storage-keys.js';

const BACKUP_KEYS = [LOCAL.SPACES, LOCAL.FAVORITES, LOCAL.ARCHIVE, LOCAL.SETTINGS, LOCAL.BOOSTS];

export class SettingsService {
  #store;
  #listeners = [];

  constructor({ store }) {
    this.#store = store;
  }

  // listener(changedKeys: Set<string>, previous: object) => void | Promise
  onChange(listener) {
    this.#listeners.push(listener);
  }

  async #emit(changed, previous) {
    for (const listener of this.#listeners) await listener(changed, previous);
  }

  async update(patch) {
    const previous = { ...this.#store.settings };
    const changed = new Set(Object.keys(patch).filter((k) => k in DEFAULT_SETTINGS && JSON.stringify(patch[k]) !== JSON.stringify(previous[k])));
    if (!changed.size) return;
    for (const key of changed) this.#store.settings[key] = patch[key];
    await this.#store.save(LOCAL.SETTINGS);
    await this.#emit(changed, previous);
  }

  exportBackup() {
    const data = Object.fromEntries(BACKUP_KEYS.map((k) => [k, this.#store.local[k]]));
    data[LOCAL.ARCHIVE] = data[LOCAL.ARCHIVE].slice(0, LIMITS.backupArchiveEntries);
    return data;
  }

  async importBackup(data) {
    const previous = { ...this.#store.settings };
    for (const key of BACKUP_KEYS) if (data?.[key] != null) this.#store.local[key] = data[key];
    this.#store.local[LOCAL.SETTINGS] = { ...DEFAULT_SETTINGS, ...this.#store.local[LOCAL.SETTINGS] };
    await this.#store.save(...BACKUP_KEYS);
    await this.#emit(new Set(Object.keys(DEFAULT_SETTINGS)), previous);
  }
}
