// Pure renderers: (model, ui) -> HTML string. No event handling, no I/O.
// Elements carry data-* attributes the controller reads; `data-key` gives the
// DOM patcher stable identity.
import { LIMITS } from '../config/defaults.js';
import { spaceColor } from '../config/colors.js';
import { liveSource } from '../live-sources/index.js';
import { t, timeAgo } from '../shared/i18n.js';
import { folderIcon, icon } from '../shared/icons.js';
import { NODE, SIDEBAR_VIEW, ZONE } from '../shared/storage-keys.js';
import { escapeHtml as h } from '../shared/text.js';
import { liveItemId } from '../shared/tree.js';
import { displayUrl, faviconUrl, hostOf, isNewTabUrl, samePage, tabIcon } from '../shared/url.js';
import { libraryPane } from './library.js';
import { ACT, DROP } from './ui-state.js';

const cls = (...names) => names.filter(Boolean).join(' ');
const btn = (act, iconName, titleKey, { size = 16, extra = '' } = {}) =>
  `<button class="${cls('icon-btn', extra)}" data-act="${act}" title="${h(t(titleKey))}">${icon(iconName, size)}</button>`;
const rowAct = (act, iconName, titleKey, size = 14) => `<button class="act" data-act="${act}" title="${h(t(titleKey))}">${icon(iconName, size)}</button>`;
const audio = (tab) => (tab?.mutedInfo?.muted ? 'mute' : 'volume');

function top(model) {
  const tab = model.activeTab;
  const label = tab && !isNewTabUrl(tab.url) ? displayUrl(tab.url) : t('urlbarPlaceholder');
  return `<div class="top" data-key="top">
    <div class="nav">
      ${btn(ACT.CLOSE_SIDEBAR, 'sidebar', 'sidebarClose')}${btn(ACT.BACK, 'back', 'navBack')}${btn(ACT.FORWARD, 'forward', 'navForward')}${btn(ACT.RELOAD, 'reload', 'navReload')}
      <div class="spacer"></div>
      ${btn(ACT.SPLIT, 'split', 'splitView', { extra: model.isSplit(tab) ? 'on' : '' })}${btn(ACT.MINI, 'mini', 'miniWindow')}
    </div>
    <button class="urlbar" data-act="${ACT.URLBAR}" title="${h(tab?.url || '')}">${icon('search', 14)}<span>${h(label)}</span></button>
  </div>`;
}

function favorites(model) {
  const activeId = model.activeTab?.id;
  const tiles = model.favorites.map((node) => {
    const tab = model.tabOfNode(node.id);
    const state = cls('fav', tab ? 'open' : 'closed', tab && tab.id === activeId && 'active', tab?.audible && 'audible');
    return `<button class="${state}" data-key="${node.id}" data-node="${node.id}" data-zone="${ZONE.FAV}" draggable="true" title="${h(node.title)}\n${h(node.url)}"><img src="${h(tab ? tabIcon(tab) : faviconUrl(node.url))}" alt=""></button>`;
  });
  return `<div class="favs" data-key="favs" data-drop="${DROP.FAV}">${tiles.join('') || `<div class="favs-empty">${h(t('favoritesEmpty'))}</div>`}</div>`;
}

function renameInput(node) {
  return `<input class="rename" value="${h(node.title)}" data-rename="${node.id}">`;
}

function linkRow(node, attrs, model, ui) {
  const tab = model.tabOfNode(node.id);
  const away = !!tab?.url && !samePage(tab.url, node.url);
  const title = node.customTitle ? node.title : tab?.title || node.title;
  const state = cls('row', 'link', tab ? 'open' : 'closed', tab && tab.id === model.activeTab?.id && 'active', away && 'away', ui.renaming === node.id && 'editing');
  return `<div class="${state}" ${attrs} title="${h(node.url)}">
    <img class="fi" src="${h(tab ? tabIcon(tab) : faviconUrl(node.url))}" alt="">
    <span class="title">${ui.renaming === node.id ? renameInput(node) : h(title)}</span>
    ${tab?.audible ? `<span class="audio">${icon(audio(tab), 13)}</span>` : ''}
    <span class="acts">${away ? rowAct(ACT.RESET_NODE, 'undo', 'pinBackToUrl', 13) : ''}${tab ? rowAct(ACT.CLOSE_NODE, 'minus', 'pinCloseTab') : ''}</span>
  </div>`;
}

// A collapsible container. Always rendered so opening and closing can animate;
// when closed it is collapsed to zero height and made inert.
function collapsible(key, open, html, innerAttrs = '') {
  return `<div class="${cls('children', !open && 'closed')}" data-key="${key}" ${open ? '' : 'inert'}><div ${innerAttrs || 'class="children-inner"'}>${html}</div></div>`;
}

const children = (nodeId, open, html) => collapsible(`children-${nodeId}`, open, html);

function folderRow(node, attrs, depth, model, ui) {
  const open = node.open !== false;
  return `<div class="${cls('row', 'folder', open && 'isopen', ui.renaming === node.id && 'editing')}" ${attrs} data-kind="${NODE.FOLDER}">
    <span class="glyph">${folderIcon({ open, mark: node.icon })}</span>
    <span class="title">${ui.renaming === node.id ? renameInput(node) : h(node.title)}</span>
    <span class="acts">${rowAct(ACT.NODE_MENU, 'more', 'menu')}</span>
  </div>${children(node.id, open, nodes(node.children || [], depth + 1, node.id, model, ui))}`;
}

// i18n keys for the status badge of a live entry.
const STATUS_LABEL = { success: 'liveStatusSuccess', failure: 'liveStatusFailure', pending: 'liveStatusPending' };

function liveItemRow(folder, item, source, indent, model) {
  const id = liveItemId(folder.id, item.key);
  const tab = model.tabOfNode(id);
  const details = [item.meta, item.draft && t('liveDraft'), STATUS_LABEL[item.status] && t(STATUS_LABEL[item.status]), item.date && timeAgo(item.date)].filter(Boolean);
  const subtitle = [item.subtitle, item.draft && t('liveDraft')].filter(Boolean).join(' · ');
  const state = cls('row', 'live-item', item.unread ? 'unread' : 'read', subtitle && 'two-line', tab && tab.id === model.activeTab?.id && 'active');
  const badge = STATUS_LABEL[item.status] ? `<i class="status ${item.status}"></i>` : '';
  const glyph = source?.itemIcon ? `<span class="src-icon">${icon(source.itemIcon, 18)}${badge}</span>` : `<img class="fi" src="${h(tab ? tabIcon(tab) : faviconUrl(item.url))}" alt="">`;
  return `<div class="${state}" data-key="${id}" data-live="${id}" data-folder="${folder.id}" draggable="true" ${indent} title="${h([item.title, details.join(' · ')].filter(Boolean).join('\n'))}">
    ${glyph}
    <span class="title"><span class="line">${h(item.title)}</span>${subtitle ? `<span class="sub">${h(subtitle)}</span>` : ''}</span>
    ${item.unread ? '<span class="dot"></span>' : ''}
    <span class="acts">${tab ? rowAct(ACT.CLOSE_LIVE, 'x', 'pinCloseTab') : ''}</span>
  </div>`;
}

function liveRows(node, attrs, depth, model, ui) {
  const open = node.open !== false;
  const entry = model.liveEntry(node.id);
  const unread = entry.items.filter((i) => i.unread).length;
  const busy = ui.busyFolders.has(node.id);
  const source = liveSource(node.source?.kind);
  const tip = [source ? t(source.nameKey) : '', entry.lastFetched ? timeAgo(entry.lastFetched) : ''].filter(Boolean).join(' · ');
  const head = `<div class="${cls('row', 'live', open && 'isopen', ui.renaming === node.id && 'editing')}" ${attrs} data-kind="${NODE.LIVE}" title="${h(tip)}">
    <span class="glyph live-glyph">${folderIcon({ open, mark: busy ? '' : node.icon || source?.icon || 'live' })}${busy ? `<span class="busy">${icon('reload', 9, 'spin')}</span>` : ''}</span>
    <span class="title">${ui.renaming === node.id ? renameInput(node) : h(node.title)}</span>
    ${entry.error ? `<span class="err" title="${h(entry.error)}">${icon('alert', 15)}</span>` : ''}
    ${unread ? `<span class="badge">${unread}</span>` : ''}
    <span class="acts">${rowAct(ACT.LIVE_REFRESH, 'reload', 'liveRefreshNow', 13)}${rowAct(ACT.NODE_MENU, 'more', 'menu')}</span>
  </div>`;
  const indent = `style="--depth:${depth + 1}"`;
  if (!entry.items.length) {
    const note = entry.error || t(entry.lastFetched ? 'liveEmpty' : 'loading');
    return head + children(node.id, open, `<div class="row live-item read note" data-key="${node.id}-note" ${indent}><span class="title">${h(note)}</span></div>`);
  }
  const expanded = ui.expandedLive.has(node.id);
  const hidden = entry.items.length - LIMITS.liveCollapsedItems;
  const items = (expanded ? entry.items : entry.items.slice(0, LIMITS.liveCollapsedItems)).map((item) => liveItemRow(node, item, source, indent, model));
  const more = hidden > 0 ? `<button class="row live-more" data-key="${node.id}-more" data-act="${ACT.LIVE_MORE}" data-folder="${node.id}" ${indent}><span class="title">${h(expanded ? t('liveShowLess') : t('liveShowMore', hidden))}</span></button>` : '';
  return head + children(node.id, open, items.join('') + more);
}

function nodes(list, depth, parentId, model, ui) {
  return list
    .map((node, i) => {
      const attrs = `data-key="${node.id}" data-node="${node.id}" data-zone="${ZONE.PINNED}" data-parent="${parentId || ''}" data-next="${list[i + 1]?.id || ''}" draggable="true" style="--depth:${depth}"`;
      if (node.type === NODE.FOLDER) return folderRow(node, attrs, depth, model, ui);
      if (node.type === NODE.LIVE) return liveRows(node, attrs, depth, model, ui);
      return linkRow(node, attrs, model, ui);
    })
    .join('');
}

// Two tabs in one split view share a row; each half is still its own tab.
function splitRow(splitViewId, model, ui) {
  const halves = model.splitTabs(splitViewId).map((tab) => {
    const state = cls('half', tab.id === model.activeTab?.id && 'active', ui.selected.has(tab.id) && 'selected');
    return `<div class="${state}" data-key="tab-${tab.id}" data-tab="${tab.id}" title="${h(tab.title)}\n${h(tab.url)}"><img class="fi" src="${h(tabIcon(tab))}" alt=""><span class="title">${h(isNewTabUrl(tab.url) ? t('newTab') : tab.title || tab.url)}</span></div>`;
  });
  return `<div class="row split" data-key="split-${splitViewId}" data-split="${splitViewId}">${halves.join('<span class="split-gap"></span>')}
    <span class="acts">${rowAct(ACT.EXIT_SPLIT, 'x', 'splitExit')}</span></div>`;
}

function todayRows(model, ui) {
  let currentGroup = null;
  const shownSplits = new Set();
  return model
    .todayTabs()
    .map((tab) => {
      const group = model.foreignGroupOf(tab);
      const heading = group && group.id !== currentGroup ? `<div class="group-head" data-key="group-${group.id}">${h(group.title || t('tabGroup'))}</div>` : '';
      currentGroup = group?.id ?? null;
      if (model.isSplit(tab)) {
        if (shownSplits.has(tab.splitViewId)) return heading;
        shownSplits.add(tab.splitViewId);
        return heading + splitRow(tab.splitViewId, model, ui);
      }
      const state = cls('row', 'tab', tab.id === model.activeTab?.id && 'active', ui.selected.has(tab.id) && 'selected');
      const sound = tab.audible || tab.mutedInfo?.muted ? `<button class="act audio" data-act="${ACT.MUTE_TAB}" title="${h(t('tabToggleMute'))}">${icon(audio(tab), 13)}</button>` : '';
      return `${heading}<div class="${state}" data-key="tab-${tab.id}" data-tab="${tab.id}" draggable="true" title="${h(tab.title)}\n${h(tab.url)}">
        <img class="fi" src="${h(tabIcon(tab))}" alt="">
        <span class="title">${h(isNewTabUrl(tab.url) ? t('newTab') : tab.title || tab.url)}</span>
        ${sound}<span class="acts">${rowAct(ACT.CLOSE_TAB, 'x', 'tabClose')}</span>
      </div>`;
    })
    .join('');
}

function selectionBar(ui) {
  const action = (act, iconName, key) => `<button data-act="${act}" title="${h(t(key))}">${icon(iconName, 14)}</button>`;
  return `<div class="selbar" data-key="selbar"><span class="count">${h(t('selectionCount', ui.selected.size))}</span>
    ${action(ACT.SEL_SPLIT, 'split', 'splitView')}${action(ACT.SEL_FOLDER, 'folder', 'selectionToFolder')}${action(ACT.SEL_ARCHIVE, 'archive', 'tabArchive')}${action(ACT.SEL_CLOSE, 'trash', 'tabClose')}${action(ACT.SEL_CLEAR, 'x', 'selectionClear')}
  </div>`;
}

function spacePane(model, ui) {
  const space = model.space;
  return `<div class="pane" data-key="pane-${space.id}">
    <div class="${cls('space-head', !space.collapsed && 'isopen')}" data-space-head="${space.id}" data-act="${ACT.SPACE_TOGGLE}">
      ${icon('chevronRight', 13, 'chev')}${space.emoji ? `<span class="emoji">${h(space.emoji)}</span>` : ''}<span class="name">${h(space.name)}</span>
      ${btn(ACT.SPACE_MENU, 'more', 'spaceMenu')}
    </div>
    ${collapsible('pinned', !space.collapsed, space.pinned.length ? nodes(space.pinned, 0, null, model, ui) : `<div class="empty-pinned">${h(t('pinnedEmpty'))}</div>`, `class="children-inner pinned" data-drop="${DROP.PINNED}"`)}
    <div class="divider"><div class="line"></div><button class="clear" data-act="${ACT.CLEAR_TODAY}" title="${h(t('todayClearHint'))}">${icon('archive', 12)} ${h(t('todayClear'))}</button></div>
    <div class="today" data-drop="${DROP.TODAY}">
      <button class="row newtab" data-key="newtab" data-act="${ACT.NEW_TAB}"><span class="glyph">${icon('plus')}</span><span class="title">${h(t('newTab'))}</span></button>
      ${todayRows(model, ui)}
    </div>
    ${ui.selected.size ? selectionBar(ui) : ''}
  </div>`;
}

function media(model) {
  const cards = model.mediaTabs().map(
    (tab) => `<div class="media-card" data-key="media-${tab.id}" data-media="${tab.id}">
      <img src="${h(tabIcon(tab))}" alt="">
      <div class="txt" data-act="${ACT.MEDIA_FOCUS}"><div class="t">${h(tab.title)}</div><div class="h">${h(hostOf(tab.url))}</div></div>
      ${btn(ACT.MEDIA_TOGGLE, tab.audible ? 'pause' : 'play', 'mediaPlayPause', { size: 14 })}${btn(ACT.MEDIA_MUTE, audio(tab), 'tabToggleMute', { size: 14 })}${btn(ACT.MEDIA_DISMISS, 'x', 'dismiss', { size: 13 })}
    </div>`,
  );
  return `<div class="media" data-key="media">${cards.join('')}</div>`;
}

function footer(model, ui) {
  const dots = model.spaces.map((space) => {
    const face = space.emoji ? h(space.emoji) : `<span class="pip" style="background:${spaceColor(space)}"></span>`;
    return `<button class="${cls('space-dot', space.id === model.spaceId && 'active')}" data-key="${space.id}" data-space="${space.id}" title="${h(space.name)}">${face}</button>`;
  });
  return `<div class="bottom" data-key="bottom">
    ${btn(ACT.LIBRARY_TOGGLE, 'archive', 'library', { extra: ui.view === SIDEBAR_VIEW.LIBRARY ? 'on' : '' })}
    <div class="spaces">${dots.join('')}</div>
    ${btn(ACT.PLUS_MENU, 'plus', 'create')}
  </div>`;
}

// One space's content; also used to preview the neighbouring space during a swipe.
export const renderSpacePane = spacePane;

export function renderSidebar(model, ui) {
  if (!model.space) return `<div class="loading">${h(t('loading'))}</div>`;
  const body = ui.view === SIDEBAR_VIEW.LIBRARY ? libraryPane(model, ui) : spacePane(model, ui);
  return `${top(model)}${favorites(model)}<div class="scroll" data-key="scroll">${body}</div>${media(model)}${footer(model, ui)}`;
}
