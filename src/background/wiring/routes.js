// Message type -> service call. The only place that knows both the wire
// protocol and the service API.
import { CONTENT_STRINGS, MSG, PUSH } from '../../shared/messages.js';
import { ARCHIVE_REASON } from '../../shared/storage-keys.js';

export function buildRoutes({ spaces, items, live, archive, split, mini, commandBar, tabs, media, boosts, settings, i18n }) {
  return {
    // spaces
    [MSG.SPACE_SWITCH]: ({ windowId, spaceId }) => spaces.switchTo(windowId, spaceId),
    [MSG.SPACE_CYCLE]: ({ windowId, dir }) => spaces.cycle(windowId, dir),
    [MSG.SPACE_CREATE]: async ({ windowId, ...props }) => {
      const space = await spaces.create(props);
      if (windowId != null) await spaces.switchTo(windowId, space.id);
      return space.id;
    },
    [MSG.SPACE_UPDATE]: ({ id, patch }) => spaces.update(id, patch),
    [MSG.SPACE_DELETE]: ({ id }) => spaces.remove(id, (tabList) => archive.archive(tabList, ARCHIVE_REASON.SPACE_DELETED)),
    [MSG.TABS_MOVE_TO_SPACE]: ({ tabIds, spaceId }) => spaces.moveTabs(tabIds, spaceId),

    // favorites / pinned items
    [MSG.NODE_OPEN]: ({ nodeId, windowId }) => items.open(nodeId, windowId),
    [MSG.NODE_CLOSE_TAB]: ({ nodeId }) => items.closeTab(nodeId),
    [MSG.NODE_RESET]: ({ nodeId }) => items.reset(nodeId),
    [MSG.NODE_UPDATE_URL]: ({ nodeId }) => items.adoptTabUrl(nodeId),
    [MSG.NODE_RENAME]: ({ nodeId, title }) => items.rename(nodeId, title),
    [MSG.NODE_TOGGLE]: ({ nodeId, open }) => items.toggleOpen(nodeId, open),
    [MSG.NODE_SET_ICON]: ({ nodeId, icon }) => items.setIcon(nodeId, icon),
    [MSG.NODE_REMOVE]: ({ nodeId, closeTab }) => items.remove(nodeId, { closeTab }),
    [MSG.NODE_MOVE]: ({ nodeId, target }) => items.move(nodeId, target),
    [MSG.NODE_ADD_LINK]: (link) => items.addLink(link),
    [MSG.FOLDER_CREATE]: (folder) => items.createFolder(folder),

    // live folders
    [MSG.LIVE_CREATE]: async (folder) => {
      const id = await items.createLiveFolder(folder);
      await live.refresh({ folderId: id });
      return id;
    },
    [MSG.LIVE_UPDATE]: async ({ folderId, title, source }) => {
      await items.updateLiveFolder(folderId, { title, source });
      await live.refresh({ folderId });
    },
    [MSG.LIVE_REFRESH]: ({ folderId }) => live.refresh({ folderId, force: !folderId }),
    [MSG.LIVE_MARK_READ]: ({ folderId, key }) => live.markRead(folderId, key),

    // tabs
    [MSG.TAB_PIN]: ({ tabId, target }) => items.pinTab(tabId, target),
    [MSG.TAB_FAVORITE]: ({ tabId, beforeId }) => items.favoriteTab(tabId, beforeId),
    [MSG.TAB_TOGGLE_PIN]: ({ tabId }) => items.togglePin(tabId),
    [MSG.TAB_TOGGLE_FAVORITE]: ({ tabId }) => items.toggleFavorite(tabId),
    [MSG.TAB_OPEN]: (request) => tabs.open(request),
    [MSG.TAB_ACTIVATE]: ({ tabId }) => tabs.activate(tabId),
    [MSG.TAB_CLOSE]: ({ tabIds }) => tabs.close(tabIds),
    [MSG.TAB_ARCHIVE]: ({ tabIds }) => archive.archiveIds(tabIds, ARCHIVE_REASON.MANUAL),
    [MSG.TAB_DUPLICATE]: ({ tabId }) => tabs.duplicate(tabId),
    [MSG.TAB_MUTE]: ({ tabId }) => tabs.toggleMute(tabId),
    [MSG.TAB_MOVE]: (move) => tabs.move(move),
    [MSG.TAB_COPY_URL]: ({ tabId }) => tabs.copyUrl(tabId),

    // archive
    [MSG.TODAY_CLEAR]: ({ windowId, spaceId }) => archive.clearToday(windowId, spaceId || spaces.activeIn(windowId)),
    [MSG.ARCHIVE_RESTORE]: ({ id, windowId }) => archive.restore(id, windowId),
    [MSG.ARCHIVE_DELETE]: ({ id }) => archive.remove(id),
    [MSG.ARCHIVE_REOPEN_LAST]: ({ windowId }) => archive.restoreLatest(windowId),

    // split view / little window / command bar
    [MSG.SPLIT_CREATE]: ({ tabIds }) => split.create(tabIds),
    [MSG.SPLIT_EXIT]: ({ splitViewId }) => split.exit(splitViewId),
    [MSG.SPLIT_TOGGLE]: ({ windowId }) => split.toggle(windowId),
    [MSG.MINI_OPEN]: ({ url }) => mini.open(url),
    [MSG.MINI_TO_MAIN]: ({ tabId }, sender) => mini.promote(tabId ?? sender.tab.id),
    [MSG.PALETTE_OPEN]: async ({ mode, tabId }) => commandBar.open(mode, tabId != null ? await tabs.get(tabId) : null),
    [MSG.PALETTE_FALLBACK]: ({ mode }, sender) => commandBar.openWindow(mode, sender.tab),

    // media
    [MSG.MEDIA_TOGGLE]: ({ tabId }) => media.toggle(tabId),
    [MSG.MEDIA_DISMISS]: ({ tabId }) => media.dismiss(tabId),

    // boosts
    [MSG.BOOST_SAVE]: ({ host, boost }) => boosts.save(host, boost),
    [MSG.BOOST_DELETE]: ({ host }) => boosts.remove(host),
    [MSG.BOOST_ZAP]: ({ host, selector }) => boosts.zap(host, selector),
    [MSG.BOOST_UNDO_ZAP]: ({ host }) => boosts.undoZap(host),
    [MSG.ZAP_START]: async ({ tabId }) => tabs.push(tabId ?? (await tabs.active()).id, { type: PUSH.ZAP_START }),

    // settings / backup
    [MSG.SETTINGS_UPDATE]: ({ patch }) => settings.update(patch),
    [MSG.BACKUP_EXPORT]: () => settings.exportBackup(),
    [MSG.BACKUP_IMPORT]: ({ data }) => settings.importBackup(data),

    // keeps the service worker warm while a sidebar is open
    [MSG.PING]: () => true,

    // content script handshake
    [MSG.CONTENT_HELLO]: (_, sender) => ({
      mini: !!sender.tab && mini.isMini(sender.tab.windowId),
      strings: Object.fromEntries(CONTENT_STRINGS.map((key) => [key, i18n.t(key)])),
    }),
  };
}
