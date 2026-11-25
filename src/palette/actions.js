// Command bar actions, declared as data.
//   { id, titleKey, icon, keywords, featured?, needsTab?, titleArgs?(ctx), run(ctx) }
// `keywords` are extra search terms (the localised title is always searched).
// To add an action, append an entry.
import { PATHS } from '../config/defaults.js';
import { MSG, OPEN_WHERE, rpc } from '../shared/messages.js';
import { SESSION, SIDEBAR_VIEW } from '../shared/storage-keys.js';
import { t } from '../shared/i18n.js';
import { hostOf, isWebUrl } from '../shared/url.js';

const tabAction = (type) => (ctx) => rpc(type, { tabId: ctx.tab.id });
const windowAction = (type, extra = {}) => (ctx) => rpc(type, { windowId: ctx.windowId, ...extra });

async function showInSidebar(ctx, view) {
  // sidePanel.open must run inside the user gesture, so it goes first.
  const opened = chrome.sidePanel.open({ windowId: ctx.windowId });
  await chrome.storage.session.set({ [SESSION.SIDEBAR_VIEW]: view });
  await opened;
}

export const ACTIONS = Object.freeze([
  { id: 'mini', titleKey: 'actionMini', icon: 'mini', keywords: 'little window mini peek', featured: true, run: () => rpc(MSG.MINI_OPEN) },
  { id: 'split', titleKey: 'actionSplit', icon: 'split', keywords: 'split view side tile', featured: true, run: windowAction(MSG.SPLIT_TOGGLE) },
  {
    id: 'copy-url',
    titleKey: 'actionCopyUrl',
    icon: 'copy',
    keywords: 'copy url link address',
    featured: true,
    needsTab: true,
    run: async (ctx) => {
      await navigator.clipboard.writeText(ctx.tab.url);
      ctx.host.toast(t('toastUrlCopied'), ctx.tab);
    },
  },
  { id: 'pin', titleKey: 'actionTogglePin', icon: 'pin', keywords: 'pin unpin space', featured: true, needsTab: true, run: tabAction(MSG.TAB_TOGGLE_PIN) },
  { id: 'favorite', titleKey: 'actionToggleFavorite', icon: 'star', keywords: 'favorite star', featured: true, needsTab: true, run: tabAction(MSG.TAB_TOGGLE_FAVORITE) },
  { id: 'new-space', titleKey: 'spaceNew', icon: 'layers', keywords: 'space new create', run: windowAction(MSG.SPACE_CREATE) },
  { id: 'next-space', titleKey: 'actionNextSpace', icon: 'forward', keywords: 'space next', run: windowAction(MSG.SPACE_CYCLE, { dir: 1 }) },
  { id: 'prev-space', titleKey: 'actionPrevSpace', icon: 'back', keywords: 'space previous', run: windowAction(MSG.SPACE_CYCLE, { dir: -1 }) },
  { id: 'archive-tab', titleKey: 'tabArchive', icon: 'archive', keywords: 'archive close tab', needsTab: true, run: (ctx) => rpc(MSG.TAB_ARCHIVE, { tabIds: [ctx.tab.id] }) },
  { id: 'clear-today', titleKey: 'todayClearHint', icon: 'archive', keywords: 'clear today archive all', run: windowAction(MSG.TODAY_CLEAR) },
  { id: 'reopen', titleKey: 'actionReopenArchived', icon: 'restore', keywords: 'reopen restore undo closed', run: windowAction(MSG.ARCHIVE_REOPEN_LAST) },
  { id: 'show-archive', titleKey: 'actionShowArchive', icon: 'archive', keywords: 'archive history list', run: (ctx) => showInSidebar(ctx, SIDEBAR_VIEW.LIBRARY) },
  { id: 'sidebar', titleKey: 'actionOpenSidebar', icon: 'sidebar', keywords: 'sidebar panel open', run: (ctx) => showInSidebar(ctx, SIDEBAR_VIEW.SPACE) },
  { id: 'duplicate', titleKey: 'tabDuplicate', icon: 'plus', keywords: 'duplicate clone', needsTab: true, run: tabAction(MSG.TAB_DUPLICATE) },
  { id: 'mute', titleKey: 'tabToggleMute', icon: 'mute', keywords: 'mute sound audio', needsTab: true, run: tabAction(MSG.TAB_MUTE) },
  { id: 'page-to-mini', titleKey: 'actionPageToMini', icon: 'mini', keywords: 'little window move', needsTab: true, run: (ctx) => rpc(MSG.TAB_OPEN, { url: ctx.tab.url, where: OPEN_WHERE.MINI }) },
  { id: 'zap', titleKey: 'menuZap', icon: 'zap', keywords: 'zap hide element remove boost', needsTab: true, run: tabAction(MSG.ZAP_START) },
  {
    id: 'boost',
    titleKey: 'actionEditBoost',
    icon: 'sparkle',
    keywords: 'boost css style customize',
    needsTab: true,
    when: (ctx) => isWebUrl(ctx.tab.url),
    titleArgs: (ctx) => [hostOf(ctx.tab.url)],
    run: (ctx) => chrome.tabs.create({ url: `${chrome.runtime.getURL(PATHS.options)}#boost=${encodeURIComponent(hostOf(ctx.tab.url))}` }),
  },
  { id: 'live-refresh', titleKey: 'actionRefreshLive', icon: 'live', keywords: 'live folder refresh rss github', run: () => rpc(MSG.LIVE_REFRESH) },
  { id: 'settings', titleKey: 'settings', icon: 'settings', keywords: 'settings options preferences', run: () => chrome.runtime.openOptionsPage() },
  { id: 'shortcuts', titleKey: 'shortcuts', icon: 'command', keywords: 'keyboard shortcuts keys', run: () => chrome.tabs.create({ url: PATHS.shortcuts }) },
]);

export function availableActions(ctx) {
  return ACTIONS.filter((a) => (!a.needsTab || ctx.tab) && (!a.when || a.when(ctx)));
}
