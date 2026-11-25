// Storage keys and domain enums.
import './protocol.js';

// chrome.storage.local
//   spaces       [{ id, name, emoji, color, pinned: Node[] }]
//   favorites    Node[] (links) — opened as Chrome pinned tabs
//   archive      [{ id, url, title, spaceId, archivedAt, reason }]
//   settings     see config/defaults.js
//   boosts       { [host]: { enabled, css, zaps: string[] } }
//   liveCache    { [folderId]: { items, lastFetched, error } }
//   tabSnapshot  [{ url, spaceId }] — restores space membership after a restart
//   bindingsBackup { [nodeId]: { tabId, url } } — restores item <-> tab bindings after an extension update
export const { LOCAL } = globalThis.__arcishProtocol;

export const SESSION = Object.freeze({
  BINDINGS: 'bindings', // { [nodeId]: tabId }
  TAB_SPACE: 'tabSpace', // { [tabId]: spaceId } (sidebar-only mode)
  GROUP_SPACE: 'groupSpace', // { [groupId]: spaceId } (tab-group mode)
  WINDOW_SPACE: 'windowSpace', // { [windowId]: spaceId }
  LAST_TABS: 'lastTabs', // { `${windowId}:${spaceId}`: tabId }
  PREV_ACTIVE: 'prevActive', // { [windowId]: tabId[] } most recent first
  MINI_WINDOWS: 'miniWindows', // windowId[]
  MEDIA_TABS: 'mediaTabs', // tabId[]
  LAST_NORMAL_WINDOW: 'lastNormalWindowId',
  SIDEBAR_VIEW: 'pendingSidebarView',
  BOOTED: 'booted',
});

export const NODE = Object.freeze({ LINK: 'link', FOLDER: 'folder', LIVE: 'live' });
export const ZONE = Object.freeze({ FAV: 'fav', PINNED: 'pinned', TODAY: 'today', LIVE: 'live' });
export const SIDEBAR_VIEW = Object.freeze({ SPACE: 'space', LIBRARY: 'library' });
export const ARCHIVE_REASON = Object.freeze({ MANUAL: 'manual', AUTO: 'auto', CLEAR: 'clear', SPACE_DELETED: 'space-deleted' });

// How spaces relate to Chrome's tab strip.
//   SIDEBAR: membership lives in the extension only; the tab strip is untouched.
//   GROUPS:  each space is mirrored as a Chrome tab group (inactive ones collapse).
export const SPACE_MODE = Object.freeze({ SIDEBAR: 'sidebar', GROUPS: 'groups' });

// See background/core/tab-authority.js.
export const TAB_AUTHORITY = Object.freeze({ NONE: 'none', PINNED: 'pinned', ALL: 'all' });

export const NO_GROUP = -1;
export const NO_SPLIT = -1; // tab.splitViewId of a tab that is not in a split view
