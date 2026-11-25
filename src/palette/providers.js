// Result providers for the command bar.
//   { id, titleKey, search(query, ctx) => Promise<Item[]> }
//   Item = { id, title, subtitle?, icon?: name, iconUrl?, tag?, run(mods) }
// Providers are independent; the view shows them as sections in list order.
// To add a source of results, append a provider.
import { LIMITS, TIMINGS } from '../config/defaults.js';
import { t } from '../shared/i18n.js';
import { MSG, rpc } from '../shared/messages.js';
import { LOCAL, NODE } from '../shared/storage-keys.js';
import { fuzzyScore, spaceLabel } from '../shared/text.js';
import { collect, liveItemId } from '../shared/tree.js';
import { displayUrl, faviconUrl, isWebUrl, looksLikeUrl, searchEngineName, tabIcon, toUrlOrSearch } from '../shared/url.js';
import { availableActions } from './actions.js';

const MAX = LIMITS.palettePerProvider;

// Keep the best `limit` candidates by fuzzy score against `text(candidate)`.
function rank(query, candidates, text, limit = MAX) {
  return candidates
    .map((c) => ({ c, score: fuzzyScore(query, text(c)) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.c);
}

const linkItem = (id, url, title, ctx, tag) => ({ id, title: title || url, subtitle: displayUrl(url), iconUrl: faviconUrl(url), tag, run: (mods) => ctx.open(url, mods) });

const navigate = {
  id: 'navigate',
  titleKey: null,
  async search(query, ctx) {
    if (!query) return [];
    const url = toUrlOrSearch(query, ctx.settings);
    const direct = looksLikeUrl(query);
    return [{ id: 'go', title: direct ? url : query, icon: direct ? 'globe' : 'search', tag: direct ? t('paletteOpenUrl') : t('paletteSearchWith', searchEngineName(ctx.settings)), run: (mods) => ctx.open(url, mods) }];
  },
};

const tabs = {
  id: 'tabs',
  titleKey: 'paletteTabs',
  async search(query, ctx) {
    const all = (await chrome.tabs.query({})).filter((tab) => tab.id !== ctx.tab?.id);
    const hits = query ? rank(query, all, (tab) => `${tab.title} ${tab.url}`) : all.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0)).slice(0, LIMITS.paletteRecentTabs);
    return hits.map((tab) => ({ id: `tab-${tab.id}`, title: tab.title || tab.url, subtitle: displayUrl(tab.url), iconUrl: tabIcon(tab), tag: t('paletteSwitchToTab'), run: () => rpc(MSG.TAB_ACTIVATE, { tabId: tab.id }) }));
  },
};

const pinned = {
  id: 'pinned',
  titleKey: 'palettePinned',
  async search(query, ctx) {
    if (!query) return [];
    const spaces = ctx.local[LOCAL.SPACES] || [];
    const candidates = [
      ...(ctx.local[LOCAL.FAVORITES] || []).map((n) => ({ id: n.id, title: n.title, url: n.url, where: t('favorites') })),
      ...spaces.flatMap((s) => collect(s.pinned, (n) => n.type === NODE.LINK).map((n) => ({ id: n.id, title: n.title, url: n.url, where: spaceLabel(s) }))),
      ...spaces.flatMap((s) =>
        collect(s.pinned, (n) => n.type === NODE.LIVE).flatMap((folder) =>
          (ctx.local[LOCAL.LIVE_CACHE]?.[folder.id]?.items || []).map((i) => ({ id: liveItemId(folder.id, i.key), title: i.title, url: i.url, where: folder.title })),
        ),
      ),
    ];
    return rank(query, candidates, (c) => `${c.title} ${c.url}`).map((c) => ({
      id: `node-${c.id}`,
      title: c.title,
      subtitle: displayUrl(c.url),
      iconUrl: faviconUrl(c.url),
      tag: c.where,
      run: () => rpc(MSG.NODE_OPEN, { nodeId: c.id, windowId: ctx.windowId }),
    }));
  },
};

const actions = {
  id: 'actions',
  titleKey: 'paletteActions',
  async search(query, ctx) {
    const titled = availableActions(ctx).map((a) => ({ ...a, title: t(a.titleKey, ...(a.titleArgs?.(ctx) || [])) }));
    const hits = query ? rank(query, titled, (a) => `${a.title} ${a.keywords}`) : titled.filter((a) => a.featured);
    return hits.map((a) => ({ id: `action-${a.id}`, title: a.title, icon: a.icon, run: () => a.run(ctx) }));
  },
};

const spaces = {
  id: 'spaces',
  titleKey: 'paletteSpaces',
  async search(query, ctx) {
    if (!query) return [];
    const others = (ctx.local[LOCAL.SPACES] || []).filter((s) => s.id !== ctx.spaceId);
    return rank(query, others, (s) => `${s.name} space`).flatMap((s) => [
      { id: `space-${s.id}`, title: spaceLabel(s), icon: 'layers', tag: t('spaceSwitch'), run: () => rpc(MSG.SPACE_SWITCH, { windowId: ctx.windowId, spaceId: s.id }) },
      ...(ctx.tab ? [{ id: `move-${s.id}`, title: spaceLabel(s), icon: 'forward', tag: t('paletteMoveTabHere'), run: () => rpc(MSG.TABS_MOVE_TO_SPACE, { tabIds: [ctx.tab.id], spaceId: s.id }) }] : []),
    ]);
  },
};

const bookmarks = {
  id: 'bookmarks',
  titleKey: 'paletteBookmarks',
  async search(query, ctx) {
    if (!query) return [];
    const found = await chrome.bookmarks.search(query);
    return found.filter((b) => b.url).slice(0, MAX).map((b) => linkItem(`bookmark-${b.id}`, b.url, b.title, ctx));
  },
};

const history = {
  id: 'history',
  titleKey: 'paletteHistory',
  async search(query, ctx) {
    if (!query) return [];
    const startTime = Date.now() - TIMINGS.historyDays * 24 * 3600 * 1000;
    const found = await chrome.history.search({ text: query, maxResults: MAX, startTime });
    return found.filter((e) => isWebUrl(e.url)).map((e) => linkItem(`history-${e.id}`, e.url, e.title, ctx));
  },
};

const archive = {
  id: 'archive',
  titleKey: 'archive',
  async search(query, ctx) {
    if (!query) return [];
    return rank(query, ctx.local[LOCAL.ARCHIVE] || [], (e) => `${e.title} ${e.url}`).map((e) => ({
      id: `archive-${e.id}`,
      title: e.title,
      subtitle: displayUrl(e.url),
      iconUrl: faviconUrl(e.url),
      tag: t('paletteRestore'),
      run: () => rpc(MSG.ARCHIVE_RESTORE, { id: e.id, windowId: ctx.windowId }),
    }));
  },
};

export const PROVIDERS = Object.freeze([navigate, tabs, pinned, actions, spaces, bookmarks, history, archive]);
