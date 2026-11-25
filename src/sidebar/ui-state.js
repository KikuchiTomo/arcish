// Transient view state of one sidebar instance, and the DOM vocabulary shared
// by the renderers and the controller.
import { SIDEBAR_VIEW } from '../shared/storage-keys.js';
import { DEFAULT_LIBRARY_SECTION } from './library-sections.js';

export function createUiState() {
  return {
    view: SIDEBAR_VIEW.SPACE,
    librarySection: DEFAULT_LIBRARY_SECTION,
    libraryQuery: '',
    selected: new Set(), // multi-selected tab ids
    anchorTab: null, // last clicked tab (shift range selection)
    renaming: null, // node id being renamed inline
    dragging: null, // current drag payload
    swiping: false, // a space swipe gesture is in progress
    busyFolders: new Set(), // live folders being refreshed
    expandedLive: new Set(), // live folders showing all their entries
    shownSpaceId: null, // what is on screen, to animate changes
    shownView: null,
  };
}

// data-act values
export const ACT = Object.freeze({
  CLOSE_SIDEBAR: 'close-sidebar',
  BACK: 'back',
  FORWARD: 'forward',
  RELOAD: 'reload',
  SPLIT: 'split',
  MINI: 'mini',
  URLBAR: 'urlbar',
  NEW_TAB: 'new-tab',
  CLOSE_TAB: 'close-tab',
  MUTE_TAB: 'mute-tab',
  CLOSE_NODE: 'close-node',
  RESET_NODE: 'reset-node',
  NODE_MENU: 'node-menu',
  LIVE_REFRESH: 'live-refresh',
  LIVE_MORE: 'live-more',
  CLOSE_LIVE: 'close-live',
  SPACE_MENU: 'space-menu',
  SPACE_TOGGLE: 'space-toggle',
  CLEAR_TODAY: 'clear-today',
  EXIT_SPLIT: 'exit-split',
  LIBRARY_TOGGLE: 'library-toggle',
  LIBRARY_SECTION: 'library-section',
  ARCHIVE_DELETE: 'archive-delete',
  ARCHIVE_CLEAR: 'archive-clear',
  SETTINGS: 'settings',
  PLUS_MENU: 'plus-menu',
  MEDIA_TOGGLE: 'media-toggle',
  MEDIA_MUTE: 'media-mute',
  MEDIA_DISMISS: 'media-dismiss',
  MEDIA_FOCUS: 'media-focus',
  SEL_SPLIT: 'sel-split',
  SEL_FOLDER: 'sel-folder',
  SEL_ARCHIVE: 'sel-archive',
  SEL_CLOSE: 'sel-close',
  SEL_CLEAR: 'sel-clear',
});

// data-drop values
export const DROP = Object.freeze({ FAV: 'fav', PINNED: 'pinned', TODAY: 'today' });

// drag payload kinds
export const DRAG = Object.freeze({ TAB: 'tab', NODE: 'node', LIVE: 'live', EXTERNAL: 'external' });
