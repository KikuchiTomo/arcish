// Drag & drop between Favorites, Pinned (incl. folders), Today and the space
// switcher. `locate` turns a pointer position into a drop target; `DROPS`
// maps (payload kind, target kind) to the action to run.
import { MSG } from '../shared/messages.js';
import { NODE, ZONE } from '../shared/storage-keys.js';
import { hostOf } from '../shared/url.js';
import { DRAG, DROP } from './ui-state.js';

const MARK = Object.freeze({ BEFORE: 'drop-before', AFTER: 'drop-after', INTO: 'drop-into', ZONE: 'drop-zone' });
const TARGET = Object.freeze({ FAV: 'fav', PINNED: 'pinned', TODAY: 'today', REORDER: 'reorder', SPACE: 'space' });
const FOLDER_EDGE = 0.25; // top/bottom quarter of a folder row means "before/after", the middle "into"
const URI_LIST = 'text/uri-list';

function payloadFrom(model, el) {
  const tabEl = el.closest('[data-tab]');
  if (tabEl) {
    const tab = model.tab(Number(tabEl.dataset.tab));
    return tab && { el: tabEl, kind: DRAG.TAB, id: tab.id, url: tab.url, title: tab.title, isLink: true };
  }
  const liveEl = el.closest('[data-live]');
  if (liveEl) {
    const entry = model.liveItem(liveEl.dataset.live);
    return entry && { el: liveEl, kind: DRAG.LIVE, id: liveEl.dataset.live, url: entry.url, title: entry.title, isLink: true };
  }
  const nodeEl = el.closest('[data-node]');
  const node = nodeEl && model.findNode(nodeEl.dataset.node);
  return node ? { el: nodeEl, kind: DRAG.NODE, id: node.id, url: node.url, title: node.title, isLink: node.type === NODE.LINK } : null;
}

// Where would a drop at this pointer position land?
function locate(event, payload, model) {
  const at = (selector) => event.target.closest(selector);
  const dot = at('.space-dot');
  if (dot) return { el: dot, mark: MARK.INTO, kind: TARGET.SPACE, spaceId: dot.dataset.space };

  const favZone = at(`[data-drop="${DROP.FAV}"]`);
  if (favZone) {
    if (!payload.isLink) return null;
    const tile = at('.fav');
    if (!tile) return { el: favZone, mark: MARK.ZONE, kind: TARGET.FAV, beforeId: null };
    const box = tile.getBoundingClientRect();
    const before = event.clientX < box.left + box.width / 2;
    return { el: tile, mark: before ? MARK.BEFORE : MARK.AFTER, kind: TARGET.FAV, beforeId: before ? tile.dataset.node : tile.nextElementSibling?.dataset.node || null };
  }

  const pinnedZone = at(`[data-drop="${DROP.PINNED}"]`);
  if (pinnedZone) {
    const row = at(`[data-zone="${ZONE.PINNED}"]`);
    if (!row) return { el: pinnedZone, mark: MARK.ZONE, kind: TARGET.PINNED, parentId: null, beforeId: null };
    const box = row.getBoundingClientRect();
    const y = (event.clientY - box.top) / box.height;
    if (row.dataset.kind === NODE.FOLDER && y > FOLDER_EDGE && y < 1 - FOLDER_EDGE) {
      return { el: row, mark: MARK.INTO, kind: TARGET.PINNED, parentId: row.dataset.node, beforeId: null };
    }
    const before = y < 0.5;
    return { el: row, mark: before ? MARK.BEFORE : MARK.AFTER, kind: TARGET.PINNED, parentId: row.dataset.parent || null, beforeId: before ? row.dataset.node : row.dataset.next || null };
  }

  const todayZone = at(`[data-drop="${DROP.TODAY}"]`);
  if (!todayZone) return null;
  if (payload.kind === DRAG.NODE) return payload.isLink ? { el: todayZone, mark: MARK.ZONE, kind: TARGET.TODAY } : null;
  const row = at('[data-tab]');
  if (payload.kind !== DRAG.TAB || !row || Number(row.dataset.tab) === payload.id) return null;
  const box = row.getBoundingClientRect();
  const above = event.clientY < box.top + box.height / 2;
  // The list may be shown newest-first, i.e. reversed relative to tab indices.
  const beforeInStrip = model.newestFirst ? !above : above;
  return { el: row, mark: above ? MARK.BEFORE : MARK.AFTER, kind: TARGET.REORDER, refTabId: Number(row.dataset.tab), beforeInStrip };
}

// DROPS[payload kind][target kind] = (ctx, payload, target) => Promise
function buildDrops({ model, ui, act }) {
  const pinnedTarget = (target) => ({ zone: ZONE.PINNED, spaceId: model.spaceId, parentId: target.parentId, beforeId: target.beforeId });
  const draggedTabs = (payload) => (ui.selected.has(payload.id) ? [...ui.selected] : [payload.id]);
  const each = async (ids, fn) => {
    for (const id of ids) await fn(id);
  };
  const link = (payload) => ({ url: payload.url, title: payload.title });
  const addLinks = {
    [TARGET.FAV]: (p, target) => act(MSG.NODE_ADD_LINK, { zone: ZONE.FAV, beforeId: target.beforeId, ...link(p) }),
    [TARGET.PINNED]: (p, target) => act(MSG.NODE_ADD_LINK, { ...pinnedTarget(target), ...link(p) }),
    [TARGET.SPACE]: (p, target) => act(MSG.NODE_ADD_LINK, { zone: ZONE.PINNED, spaceId: target.spaceId, ...link(p) }),
  };
  return {
    [DRAG.TAB]: {
      [TARGET.FAV]: (p, target) => each(draggedTabs(p), (tabId) => act(MSG.TAB_FAVORITE, { tabId, beforeId: target.beforeId })),
      [TARGET.PINNED]: (p, target) => each(draggedTabs(p), (tabId) => act(MSG.TAB_PIN, { tabId, target: pinnedTarget(target) })),
      [TARGET.SPACE]: (p, target) => act(MSG.TABS_MOVE_TO_SPACE, { tabIds: draggedTabs(p), spaceId: target.spaceId }),
      [TARGET.REORDER]: (p, target) => act(MSG.TAB_MOVE, { tabId: p.id, [target.beforeInStrip ? 'beforeTabId' : 'afterTabId']: target.refTabId, spaceId: model.spaceId }),
    },
    [DRAG.NODE]: {
      [TARGET.FAV]: (p, target) => act(MSG.NODE_MOVE, { nodeId: p.id, target: { zone: ZONE.FAV, beforeId: target.beforeId } }),
      [TARGET.PINNED]: (p, target) => act(MSG.NODE_MOVE, { nodeId: p.id, target: pinnedTarget(target) }),
      [TARGET.TODAY]: (p) => act(MSG.NODE_MOVE, { nodeId: p.id, target: { zone: ZONE.TODAY, spaceId: model.spaceId, windowId: model.windowId } }),
      [TARGET.SPACE]: (p, target) => act(MSG.NODE_MOVE, { nodeId: p.id, target: { zone: ZONE.PINNED, spaceId: target.spaceId } }),
    },
    [DRAG.LIVE]: addLinks,
    [DRAG.EXTERNAL]: addLinks,
  };
}

export function installDragAndDrop(ctx) {
  const { app, model, ui, flush, rerender } = ctx;
  const drops = buildDrops(ctx);
  const clearMarks = () => {
    for (const el of app.querySelectorAll(`.${Object.values(MARK).join(',.')}`)) el.classList.remove(...Object.values(MARK));
  };
  const externalPayload = (event) => (event.dataTransfer.types.includes(URI_LIST) ? { kind: DRAG.EXTERNAL, isLink: true } : null);

  app.addEventListener('dragstart', (event) => {
    const payload = payloadFrom(model, event.target);
    if (!payload) return;
    ui.dragging = payload;
    event.dataTransfer.effectAllowed = 'copyMove';
    if (payload.url) {
      event.dataTransfer.setData(URI_LIST, payload.url);
      event.dataTransfer.setData('text/plain', payload.url);
    }
    payload.el.classList.add('dragging');
  });

  app.addEventListener('dragend', () => {
    ui.dragging?.el.classList.remove('dragging');
    ui.dragging = null;
    clearMarks();
    flush();
  });

  app.addEventListener('dragover', (event) => {
    clearMarks();
    const payload = ui.dragging || externalPayload(event);
    const target = payload && locate(event, payload, model);
    if (!target || !drops[payload.kind]?.[target.kind]) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = ui.dragging ? 'move' : 'copy';
    target.el.classList.add(target.mark);
  });

  app.addEventListener('dragleave', (event) => {
    if (!app.contains(event.relatedTarget)) clearMarks();
  });

  app.addEventListener('drop', async (event) => {
    clearMarks();
    let payload = ui.dragging || externalPayload(event);
    const target = payload && locate(event, payload, model);
    const drop = target && drops[payload.kind]?.[target.kind];
    if (!drop) return;
    event.preventDefault();
    if (payload.kind === DRAG.EXTERNAL) {
      const url = event.dataTransfer.getData(URI_LIST).split('\n').find((line) => line && !line.startsWith('#'));
      if (!url) return;
      payload = { ...payload, url, title: hostOf(url) };
    }
    ui.dragging = null;
    try {
      await drop(payload, target);
      if (payload.kind === DRAG.TAB) ui.selected.clear();
    } catch {
      /* the error toast was already shown */
    } finally {
      rerender();
    }
  });
}
