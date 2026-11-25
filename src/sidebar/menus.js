// Context menu definitions: (context, target) -> menu items.
import { PATHS } from '../config/defaults.js';
import { t } from '../shared/i18n.js';
import { MSG, PALETTE_MODE } from '../shared/messages.js';
import { NODE, ZONE } from '../shared/storage-keys.js';
import { spaceLabel } from '../shared/text.js';
import { parseLiveItemId, walk } from '../shared/tree.js';
import { samePage } from '../shared/url.js';
import { LIVE_SOURCES } from '../live-sources/index.js';
import { confirmDialog, deleteSpaceDialog, folderIconDialog, liveFolderDialog, newSpaceDialog, spaceColorDialog, spaceIconDialog, spaceNameDialog } from './dialogs.js';
import { SEPARATOR } from './ui/overlay.js';

const item = (labelKey, icon, run, extra = {}) => ({ label: t(labelKey), icon, run, ...extra });

// "Move to another space" section, shared by tabs and pinned items.
function moveToSpace({ model }, move) {
  const others = model.spaces.filter((s) => s.id !== model.spaceId);
  if (!others.length) return [];
  return [SEPARATOR, { header: t('moveToSpace') }, ...others.map((s) => ({ label: spaceLabel(s), icon: s.emoji ? null : 'layers', run: () => move(s.id) }))];
}

export function tabMenu(ctx, tab) {
  const { model, ui, act, copy, splitTabs } = ctx;
  const ids = ui.selected.has(tab.id) ? [...ui.selected] : [tab.id];
  const muted = tab.mutedInfo?.muted;
  return [
    item('tabAddFavorite', 'star', () => act(MSG.TAB_FAVORITE, { tabId: tab.id })),
    item('tabPin', 'pin', () => act(MSG.TAB_PIN, { tabId: tab.id, target: { spaceId: model.spaceId } })),
    { label: ids.length > 1 ? t('tabSplitSelected', ids.length) : t('tabSplitWithCurrent'), icon: 'split', run: () => splitTabs(ids) },
    item('openInMini', 'mini', async () => {
      await act(MSG.MINI_OPEN, { url: tab.url });
      await act(MSG.TAB_CLOSE, { tabIds: [tab.id] });
    }),
    SEPARATOR,
    item('copyUrl', 'copy', () => copy(tab.url)),
    item('tabDuplicate', 'plus', () => act(MSG.TAB_DUPLICATE, { tabId: tab.id })),
    item(muted ? 'tabUnmute' : 'tabMute', muted ? 'volume' : 'mute', () => act(MSG.TAB_MUTE, { tabId: tab.id })),
    ...moveToSpace(ctx, (spaceId) => act(MSG.TABS_MOVE_TO_SPACE, { tabIds: ids, spaceId })),
    SEPARATOR,
    item('tabArchive', 'archive', () => act(MSG.TAB_ARCHIVE, { tabIds: ids })),
    item('tabClose', 'x', () => act(MSG.TAB_CLOSE, { tabIds: ids }), { danger: true }),
  ];
}

function folderMenu(ctx, node) {
  const { act, rename, newFolder } = ctx;
  const openAll = async () => {
    const links = [];
    walk(node.children, (n) => void (n.type === NODE.LINK && links.push(n.id)));
    for (const nodeId of links) await act(MSG.NODE_OPEN, { nodeId });
  };
  return [
    item('rename', 'edit', () => rename(node.id)),
    item('folderChangeIcon', 'sparkle', () => folderIconDialog(ctx, node)),
    item('folderNewSub', 'folder', () => newFolder(node.id)),
    item('folderOpenAll', 'external', openAll),
    ...newLiveFolderItems(ctx, node.id),
    ...moveToSpace(ctx, (spaceId) => act(MSG.NODE_MOVE, { nodeId: node.id, target: { zone: ZONE.PINNED, spaceId } })),
    SEPARATOR,
    item('folderDelete', 'trash', () => act(MSG.NODE_REMOVE, { nodeId: node.id, closeTab: true }), { danger: true }),
  ];
}

function liveFolderMenu(ctx, node) {
  const { act, rename, refreshLive } = ctx;
  return [
    item('liveRefreshNow', 'reload', () => refreshLive(node.id)),
    item('liveMarkAllRead', 'check', () => act(MSG.LIVE_MARK_READ, { folderId: node.id })),
    item('rename', 'edit', () => rename(node.id)),
    item('folderChangeIcon', 'sparkle', () => folderIconDialog(ctx, node)),
    item('liveEditSource', 'live', () => liveFolderDialog(ctx, node)),
    ...moveToSpace(ctx, (spaceId) => act(MSG.NODE_MOVE, { nodeId: node.id, target: { zone: ZONE.PINNED, spaceId } })),
    SEPARATOR,
    item('liveDelete', 'trash', () => act(MSG.NODE_REMOVE, { nodeId: node.id, closeTab: true }), { danger: true }),
  ];
}

function linkMenu(ctx, node, zone) {
  const { model, act, copy, rename } = ctx;
  const tab = model.tabOfNode(node.id);
  const away = tab && !samePage(tab.url, node.url);
  const active = model.activeTab;
  const isFavorite = zone === ZONE.FAV;
  return [
    item('rename', 'edit', () => rename(node.id)),
    away && item('pinBackToUrl', 'undo', () => act(MSG.NODE_RESET, { nodeId: node.id })),
    away && item('pinUseCurrentUrl', 'pin', () => act(MSG.NODE_UPDATE_URL, { nodeId: node.id })),
    isFavorite
      ? item('favMoveToPinned', 'pin', () => act(MSG.NODE_MOVE, { nodeId: node.id, target: { zone: ZONE.PINNED, spaceId: model.spaceId } }))
      : item('pinMoveToFavorites', 'star', () => act(MSG.NODE_MOVE, { nodeId: node.id, target: { zone: ZONE.FAV } })),
    item('openInMini', 'mini', () => act(MSG.MINI_OPEN, { url: node.url })),
    tab && active && tab.id !== active.id && item('tabSplitWithCurrent', 'split', () => act(MSG.SPLIT_CREATE, { tabIds: [active.id, tab.id] })),
    item('copyUrl', 'copy', () => copy(tab?.url || node.url)),
    ...(isFavorite ? [] : moveToSpace(ctx, (spaceId) => act(MSG.NODE_MOVE, { nodeId: node.id, target: { zone: ZONE.PINNED, spaceId } }))),
    SEPARATOR,
    tab && item('pinCloseTab', 'minus', () => act(MSG.NODE_CLOSE_TAB, { nodeId: node.id })),
    item(isFavorite ? 'favRemove' : 'pinRemove', 'x', () => act(MSG.NODE_REMOVE, { nodeId: node.id }), { danger: true }),
  ];
}

const NODE_MENUS = { [NODE.FOLDER]: folderMenu, [NODE.LIVE]: liveFolderMenu, [NODE.LINK]: linkMenu };

export function nodeMenu(ctx, nodeId, zone) {
  const node = ctx.model.findNode(nodeId);
  return node ? NODE_MENUS[node.type](ctx, node, zone) : [];
}

export function liveItemMenu(ctx, liveId) {
  const { model, act, copy } = ctx;
  const entry = model.liveItem(liveId);
  if (!entry) return [];
  const { folderId, key } = parseLiveItemId(liveId);
  const link = { url: entry.url, title: entry.title };
  return [
    item('open', 'external', () => act(MSG.NODE_OPEN, { nodeId: liveId })),
    item('openInMini', 'mini', async () => {
      await act(MSG.MINI_OPEN, { url: entry.url });
      await act(MSG.LIVE_MARK_READ, { folderId, key });
    }),
    item('tabPin', 'pin', () => act(MSG.NODE_ADD_LINK, { zone: ZONE.PINNED, spaceId: model.spaceId, ...link })),
    item('tabAddFavorite', 'star', () => act(MSG.NODE_ADD_LINK, { zone: ZONE.FAV, ...link })),
    entry.unread && item('liveMarkRead', 'check', () => act(MSG.LIVE_MARK_READ, { folderId, key })),
    item('copyUrl', 'copy', () => copy(entry.url)),
  ];
}

// "Live Folders" section: one entry per source, creating the folder at the
// top level or inside `parentId`.
function newLiveFolderItems(ctx, parentId) {
  return [{ header: t('liveFolders') }, ...LIVE_SOURCES.map((source) => ({ label: t(source.nameKey), icon: source.icon, run: () => liveFolderDialog(ctx, null, { preset: source, parentId }) }))];
}

const spacesSettingsUrl = () => `${chrome.runtime.getURL(PATHS.options)}#spaces`;

export function spaceMenu(ctx, space) {
  const { model, act, newFolder } = ctx;
  const isCurrent = space.id === model.spaceId;
  const appearance = [
    item('spaceChangeIcon', 'sparkle', () => spaceIconDialog(ctx, space)),
    item('spaceRename', 'edit', () => spaceNameDialog(ctx, space)),
    item('spaceEditColor', 'moon', () => spaceColorDialog(ctx, space)),
  ];
  const remove = model.spaces.length > 1 && [SEPARATOR, item('spaceDelete', 'trash', () => deleteSpaceDialog(ctx, space), { danger: true })];
  if (!isCurrent) return [item('spaceSwitch', 'layers', () => act(MSG.SPACE_SWITCH, { spaceId: space.id })), SEPARATOR, ...appearance, ...(remove || [])];
  return [
    ...appearance,
    SEPARATOR,
    item('folderNew', 'folder', () => newFolder(null)),
    ...newLiveFolderItems(ctx, null),
    SEPARATOR,
    item('todayClearHint', 'archive', () => act(MSG.TODAY_CLEAR, { spaceId: space.id })),
    SEPARATOR,
    item('spaceNew', 'plus', () => newSpaceDialog(ctx)),
    item('spaceManage', 'layers', () => chrome.tabs.create({ url: spacesSettingsUrl() })),
    ...(remove || []),
  ];
}

export function plusMenu(ctx) {
  const { act, newFolder } = ctx;
  return [
    item('spaceNew', 'layers', () => newSpaceDialog(ctx)),
    item('folderNew', 'folder', () => newFolder(null)),
    item('liveNew', 'live', () => liveFolderDialog(ctx)),
    SEPARATOR,
    item('miniWindow', 'mini', () => act(MSG.MINI_OPEN)),
    item('splitView', 'split', () => act(MSG.SPLIT_TOGGLE)),
    item('commandBar', 'command', () => ctx.openCommandBar(PALETTE_MODE.NEW)),
    SEPARATOR,
    item('settings', 'settings', () => chrome.runtime.openOptionsPage()),
    item('shortcuts', 'command', () => chrome.tabs.create({ url: PATHS.shortcuts })),
  ];
}

export function clearArchiveDialog({ overlay, act }) {
  confirmDialog(overlay, { title: t('archiveClearTitle'), note: t('irreversible'), submitKey: 'delete', onConfirm: () => act(MSG.ARCHIVE_DELETE, { id: null }) });
}
