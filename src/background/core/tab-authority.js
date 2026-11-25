// Who wins when a tab is changed from Chrome's own UI (pinned/unpinned, moved
// between tab groups) in a way that contradicts the sidebar:
//   none    Chrome wins; the sidebar follows                       (default)
//   pinned  the sidebar wins for tabs that back a Favorite or a pinned item
//   all     the sidebar wins for every tab
import { TAB_AUTHORITY } from '../../shared/storage-keys.js';

export class TabAuthority {
  #store;
  #bindings;

  constructor({ store, bindings }) {
    this.#store = store;
    this.#bindings = bindings;
  }

  // Should a Chrome-side change to this tab be reverted?
  covers(tabId) {
    const mode = this.#store.settings.tabAuthority;
    if (mode === TAB_AUTHORITY.ALL) return true;
    return mode === TAB_AUTHORITY.PINNED && this.#bindings.nodeIdOf(tabId) != null;
  }
}
