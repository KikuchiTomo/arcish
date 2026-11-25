import { AUTO_LOCALE } from './locales.js';
import { paletteColor } from './colors.js';
import { DEFAULT_SEARCH_ENGINE } from './search-engines.js';
import { SPACE_MODE, TAB_AUTHORITY } from '../shared/storage-keys.js';

const { PALETTE_PATH, TOAST_MS } = globalThis.__arcishProtocol;

const HOUR = 60;
const DAY = 24 * HOUR;

// Auto-archive choices, in minutes. 0 disables archiving.
export const ARCHIVE_OPTIONS = Object.freeze([0, 12 * HOUR, DAY, 7 * DAY, 30 * DAY]);

export const COLOR_SCHEMES = Object.freeze(['auto', 'light', 'dark']);

// The extension assists Chrome rather than replacing it, so everything that
// changes native behaviour (closing tabs, re-grouping the tab strip, changing
// what shift+click does) is opt-in.
export const DEFAULT_SETTINGS = Object.freeze({
  language: AUTO_LOCALE,
  colorScheme: COLOR_SCHEMES[0],
  spaceMode: SPACE_MODE.SIDEBAR,
  tabAuthority: TAB_AUTHORITY.NONE,
  archiveAfter: 0,
  peekShiftClick: false,
  searchEngine: DEFAULT_SEARCH_ENGINE,
  customSearch: '',
  miniWidth: 520,
  miniHeight: 700,
  liveRefreshMinutes: 15,
  githubToken: '',
  newTabsOnTop: true,
  atcRules: [], // [{ id, pattern, spaceId }]
});

// Spaces created on first run. `nameKey` is an i18n message key.
export const DEFAULT_SPACES = Object.freeze([
  { nameKey: 'defaultSpacePersonal', emoji: '🏠', color: paletteColor('lavender') },
  { nameKey: 'defaultSpaceWork', emoji: '💼', color: paletteColor('ocean') },
]);

export const EMOJI_SUGGESTIONS = Object.freeze(['🏠', '💼', '🎨', '🧪', '📚', '🎮', '🛒', '✈️', '🍳', '🎧', '💡', '🚀', '🌱', '🔥', '⭐️', '🧠', '📝', '💻', '🏃', '🎬']);

export const LIMITS = Object.freeze({
  archiveEntries: 1000,
  archiveRendered: 300,
  downloadsRendered: 100,
  backupArchiveEntries: 200,
  liveItems: 30,
  liveCollapsedItems: 6, // entries shown before "show more"
  mediaCards: 3,
  recentTabsPerWindow: 6,
  badgeMax: 99,
  errorBodyChars: 120,
  paletteRecentTabs: 6,
  palettePerProvider: 6,
});

export const TIMINGS = Object.freeze({
  renderDebounceMs: 8, // coalesces bursts of changes into one render
  keepAliveMs: 20_000, // the sidebar pings the service worker so its first action is never a cold start
  searchDebounceMs: 70,
  toastMs: TOAST_MS,
  snapshotDebounceMs: 1500,
  archiveAlarmMinutes: 5,
  liveAlarmMinutes: 5,
  liveMinRefreshMinutes: 5,
  routingWindowMs: 15_000, // how long after creation a tab may be routed by Air Traffic Control
  swipeCommitRatio: 0.5, // only a swipe released past the middle switches space (a flick's inertia carries it there)
  swipeEndMs: 200, // the wheel stream pausing this long counts as letting go (lifting fingers is not observable)
  swipeSettleMs: 220,
  swipeCooldownMs: 420,
  dialogFocusDelayMs: 30,
  historyDays: 90,
});

export const WINDOWS = Object.freeze({
  miniMarginPx: 24,
  paletteWidth: 680,
  paletteHeight: 480,
  paletteTopOffsetPx: 120,
});

export const ALARMS = Object.freeze({ ARCHIVE: 'archive', LIVE: 'live' });

export const PATHS = Object.freeze({
  palette: PALETTE_PATH,
  mini: 'src/mini/mini.html',
  options: 'src/options/options.html',
  shortcuts: 'chrome://extensions/shortcuts',
  appearance: 'chrome://settings/appearance',
});

export const BADGE_COLOR = '#6d4dff';
