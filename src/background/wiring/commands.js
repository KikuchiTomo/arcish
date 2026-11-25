// Keyboard commands (names match manifest.json "commands"). Chrome owns the
// key bindings, so they never collide with page or browser shortcuts.
import { PALETTE_MODE, PUSH } from '../../shared/messages.js';
import { ARCHIVE_REASON } from '../../shared/storage-keys.js';

export function buildCommands({ spaces, items, archive, split, mini, commandBar, tabs, i18n }) {
  return {
    'command-bar': (tab) => commandBar.open(PALETTE_MODE.NEW, tab),
    'command-bar-current': (tab) => commandBar.open(PALETTE_MODE.CURRENT, tab),
    'mini-window': () => mini.open(),
    'toggle-split': (tab) => split.toggle(tab.windowId),
    'next-space': (tab) => spaces.cycle(tab.windowId, 1),
    'prev-space': (tab) => spaces.cycle(tab.windowId, -1),
    'copy-url': (tab) => tabs.copyUrl(tab.id),
    'pin-tab': async (tab) => {
      await items.togglePin(tab.id);
      await tabs.toast(tab.id, i18n.t('toastPinToggled'));
    },
    'favorite-tab': async (tab) => {
      await items.toggleFavorite(tab.id);
      await tabs.toast(tab.id, i18n.t('toastFavoriteToggled'));
    },
    'archive-tab': (tab) => archive.archive([tab], ARCHIVE_REASON.MANUAL),
    zap: (tab) => tabs.push(tab.id, { type: PUSH.ZAP_START }),
  };
}
