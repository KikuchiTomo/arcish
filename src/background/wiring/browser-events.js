// Subscribes to browser events and forwards them to services. Kept free of
// business rules: each handler only says "this happened".
import { LIMITS, TIMINGS, ALARMS } from '../../config/defaults.js';
import { SESSION } from '../../shared/storage-keys.js';

export function wireBrowserEvents({ api, on, store, spaces, items, live, archive, mini, media, membership, bindings, windows }) {
  const createdAt = new Map(); // tabId -> ms, for Air Traffic Control

  on(api.tabs.onCreated, async (tab) => {
    createdAt.set(tab.id, Date.now());
    if (!mini.isMini(tab.windowId)) await spaces.adopt(tab.id);
  });

  on(api.tabs.onAttached, async (tabId, { newWindowId }) => {
    windows.forget(newWindowId);
    await spaces.adopt(tabId);
  });

  on(api.tabs.onUpdated, async (tabId, change, tab) => {
    if (change.pinned !== undefined) await items.onChromePinChanged(tab);
    if (change.groupId !== undefined) await membership.onTabGroupChanged(tabId);
    if (change.title) await items.onTabTitle(tab);
    if (change.audible) await media.track(tabId);
    if (change.url) {
      if (bindings.nodeIdOf(tabId)) await bindings.backup();
      membership.onTabUrlChanged();
      if (Date.now() - (createdAt.get(tabId) ?? 0) < TIMINGS.routingWindowMs) {
        createdAt.delete(tabId);
        await spaces.reroute(tab, change.url);
      }
    }
  });

  on(api.tabs.onActivated, async ({ tabId, windowId }) => {
    const recent = store.session[SESSION.PREV_ACTIVE][windowId] || [];
    store.session[SESSION.PREV_ACTIVE][windowId] = [tabId, ...recent.filter((id) => id !== tabId)].slice(0, LIMITS.recentTabsPerWindow);
    await store.saveSession(SESSION.PREV_ACTIVE);
    const tab = await api.tabs.get(tabId).catch(() => null);
    if (!tab) return;
    // Chrome picked this tab because the previous one was closed?
    const previous = recent[0] != null && recent[0] !== tabId ? await api.tabs.get(recent[0]).catch(() => null) : undefined;
    await spaces.onTabActivated(tab, { afterClose: previous === null });
  });

  on(api.tabs.onMoved, (tabId) => items.onPinnedTabMoved(tabId));

  on(api.tabs.onRemoved, async (tabId) => {
    createdAt.delete(tabId);
    await bindings.unbindTab(tabId);
    await membership.onTabRemoved(tabId);
    await media.dismiss(tabId);
  });

  // Chrome may swap a tab for a prerendered one; ids change but it is the same tab.
  on(api.tabs.onReplaced, async (addedTabId, removedTabId) => {
    await bindings.replaceTab(addedTabId, removedTabId);
    await membership.onTabReplaced(addedTabId, removedTabId);
  });

  on(api.tabGroups.onRemoved, (group) => membership.onGroupRemoved(group.id));

  // Expanding a collapsed space group in the tab strip switches to that space.
  on(api.tabGroups.onUpdated, async (group) => {
    if (group.collapsed) return;
    const spaceId = spaces.spaceOf({ groupId: group.id });
    if (spaceId && spaceId !== spaces.activeIn(group.windowId)) await spaces.switchTo(group.windowId, spaceId);
  });

  on(api.windows.onRemoved, async (windowId) => {
    windows.forget(windowId);
    delete store.session[SESSION.PREV_ACTIVE][windowId];
    await store.saveSession(SESSION.PREV_ACTIVE);
    await spaces.onWindowRemoved(windowId);
    await mini.onWindowRemoved(windowId);
  });

  on(api.windows.onFocusChanged, async (windowId) => {
    if (!(await windows.isManaged(windowId))) return;
    store.session[SESSION.LAST_NORMAL_WINDOW] = windowId;
    await store.saveSession(SESSION.LAST_NORMAL_WINDOW);
  });

  on(api.alarms.onAlarm, async ({ name }) => {
    if (name === ALARMS.ARCHIVE) await archive.autoArchive();
    if (name === ALARMS.LIVE) await live.refresh();
  });
}

export function scheduleAlarms(api) {
  api.alarms.create(ALARMS.ARCHIVE, { periodInMinutes: TIMINGS.archiveAlarmMinutes });
  api.alarms.create(ALARMS.LIVE, { periodInMinutes: TIMINGS.liveAlarmMinutes });
}
