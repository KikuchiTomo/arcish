// Context menu entries, declared as data: { id, titleKey, contexts, run }.
import { PALETTE_MODE, PUSH } from '../../shared/messages.js';
import { ZONE } from '../../shared/storage-keys.js';

export function buildContextMenus({ api, spaces, items, split, mini, commandBar, tabs, i18n }) {
  return [
    { id: 'link-mini', titleKey: 'menuOpenInMini', contexts: ['link'], run: (info) => mini.open(info.linkUrl) },
    { id: 'link-split', titleKey: 'menuOpenInSplit', contexts: ['link'], run: (info, tab) => split.withUrl(tab.id, info.linkUrl) },
    {
      id: 'link-pin',
      titleKey: 'menuPinLink',
      contexts: ['link'],
      run: async (info, tab) => {
        await items.addLink({ zone: ZONE.PINNED, spaceId: spaces.activeIn(tab.windowId), url: info.linkUrl, title: info.selectionText || info.linkUrl });
        await tabs.toast(tab.id, i18n.t('toastPinned'));
      },
    },
    { id: 'page-fav', titleKey: 'menuToggleFavorite', contexts: ['page'], run: (_, tab) => items.toggleFavorite(tab.id) },
    { id: 'page-pin', titleKey: 'menuTogglePin', contexts: ['page'], run: (_, tab) => items.togglePin(tab.id) },
    { id: 'page-mini', titleKey: 'menuOpenInMini', contexts: ['page'], run: (_, tab) => mini.open(tab.url) },
    { id: 'page-zap', titleKey: 'menuZap', contexts: ['page'], run: (_, tab) => tabs.push(tab.id, { type: PUSH.ZAP_START }) },
    { id: 'action-mini', titleKey: 'menuMiniWindow', contexts: ['action'], run: () => mini.open() },
    { id: 'action-bar', titleKey: 'menuCommandBar', contexts: ['action'], run: (_, tab) => commandBar.open(PALETTE_MODE.NEW, tab) },
    { id: 'action-options', titleKey: 'menuSettings', contexts: ['action'], run: () => api.runtime.openOptionsPage() },
  ];
}

export function installContextMenus(api, menus, i18n) {
  api.contextMenus.removeAll(() => {
    for (const { id, titleKey, contexts } of menus) {
      api.contextMenus.create({ id, title: i18n.t(titleKey), contexts }, () => void api.runtime.lastError);
    }
  });
}
