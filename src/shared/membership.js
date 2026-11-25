// Pure lookup shared by the service worker and UI pages: which space does a
// tab belong to, given the session state and the current space mode.
import { NO_GROUP, SESSION, SPACE_MODE } from './storage-keys.js';

export function tabSpaceId(tab, session, mode) {
  if (!tab) return null;
  if (mode === SPACE_MODE.GROUPS) {
    return tab.groupId != null && tab.groupId !== NO_GROUP ? (session[SESSION.GROUP_SPACE]?.[tab.groupId] ?? null) : null;
  }
  return session[SESSION.TAB_SPACE]?.[tab.id] ?? null;
}

export function windowSpaceId(windowId, session, local, spaces) {
  const has = (id) => spaces.some((s) => s.id === id);
  const fromWindow = session[SESSION.WINDOW_SPACE]?.[windowId];
  if (has(fromWindow)) return fromWindow;
  if (has(local.lastSpaceId)) return local.lastSpaceId;
  return spaces[0]?.id ?? null;
}
