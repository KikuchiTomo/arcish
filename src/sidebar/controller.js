// Input handling: one delegated listener per event type; behaviour is looked
// up in tables keyed by the element's data-act.
import { PATHS } from '../config/defaults.js';
import { MSG, PALETTE_MODE } from '../shared/messages.js';
import { NODE, SIDEBAR_VIEW } from '../shared/storage-keys.js';
import { clearArchiveDialog, liveItemMenu, nodeMenu, plusMenu, spaceMenu, tabMenu } from './menus.js';
import { LIBRARY_SECTION } from './library-sections.js';
import { ACT } from './ui-state.js';

const MIDDLE_BUTTON = 1;
const FALLBACK_ICON = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20M2 12h20"/></svg>',
)}`;

// What an event target refers to, read from data-* attributes.
function describe(target) {
  const closest = (selector) => target.closest(selector);
  const num = (el, key) => (el ? Number(el.dataset[key]) : null);
  return {
    actEl: closest('[data-act]'),
    tabId: num(closest('[data-tab]'), 'tab'),
    nodeEl: closest('[data-node]'),
    liveEl: closest('[data-live]'),
    spaceDot: closest('.space-dot'),
    archiveId: closest('[data-archive]')?.dataset.archive ?? null,
    downloadId: num(closest('[data-download]'), 'download'),
    librarySpaceId: closest('[data-library-space]')?.dataset.librarySpace ?? null,
    boostHost: closest('[data-boost]')?.dataset.boost ?? null,
    splitViewId: num(closest('[data-split]'), 'split'),
    mediaTabId: num(closest('[data-media]'), 'media'),
  };
}

function takeSelection(ui) {
  const ids = [...ui.selected];
  ui.selected.clear();
  return ids;
}

// data-act -> handler(ctx, target)
const ACTIONS = {
  [ACT.CLOSE_SIDEBAR]: () => window.close(), // closing the panel's own page closes the side panel
  [ACT.BACK]: ({ model }) => model.activeTab && chrome.tabs.goBack(model.activeTab.id).catch(() => {}),
  [ACT.FORWARD]: ({ model }) => model.activeTab && chrome.tabs.goForward(model.activeTab.id).catch(() => {}),
  [ACT.RELOAD]: ({ model }) => model.activeTab && chrome.tabs.reload(model.activeTab.id),
  [ACT.SPLIT]: ({ act }) => act(MSG.SPLIT_TOGGLE),
  [ACT.MINI]: ({ act }) => act(MSG.MINI_OPEN),
  [ACT.URLBAR]: ({ openCommandBar }) => openCommandBar(PALETTE_MODE.CURRENT),
  [ACT.NEW_TAB]: ({ openCommandBar }) => openCommandBar(PALETTE_MODE.NEW),
  [ACT.CLOSE_TAB]: ({ act }, { tabId }) => act(MSG.TAB_CLOSE, { tabIds: [tabId] }),
  [ACT.MUTE_TAB]: ({ act }, { tabId }) => act(MSG.TAB_MUTE, { tabId }),
  [ACT.CLOSE_NODE]: ({ act }, { nodeEl }) => act(MSG.NODE_CLOSE_TAB, { nodeId: nodeEl.dataset.node }),
  [ACT.RESET_NODE]: ({ act }, { nodeEl }) => act(MSG.NODE_RESET, { nodeId: nodeEl.dataset.node }),
  [ACT.NODE_MENU]: (ctx, { nodeEl, actEl }) => menuBelow(ctx, actEl, nodeMenu(ctx, nodeEl.dataset.node, nodeEl.dataset.zone)),
  [ACT.LIVE_REFRESH]: ({ refreshLive }, { nodeEl }) => refreshLive(nodeEl.dataset.node),
  [ACT.CLOSE_LIVE]: ({ act }, { liveEl }) => act(MSG.NODE_CLOSE_TAB, { nodeId: liveEl.dataset.live }),
  [ACT.LIVE_MORE]: ({ ui, render }, { actEl }) => {
    const folderId = actEl.dataset.folder;
    if (!ui.expandedLive.delete(folderId)) ui.expandedLive.add(folderId);
    render();
  },
  [ACT.SPACE_TOGGLE]: ({ act, model, render }) => {
    model.space.collapsed = !model.space.collapsed; // shown at once; storage follows
    render();
    return act(MSG.SPACE_UPDATE, { id: model.spaceId, patch: { collapsed: model.space.collapsed } });
  },
  [ACT.SPACE_MENU]: (ctx, { actEl }) => menuBelow(ctx, actEl, spaceMenu(ctx, ctx.model.space)),
  [ACT.CLEAR_TODAY]: ({ act, model }) => act(MSG.TODAY_CLEAR, { spaceId: model.spaceId }),
  [ACT.EXIT_SPLIT]: ({ act }, { splitViewId }) => act(MSG.SPLIT_EXIT, { splitViewId }),
  [ACT.LIBRARY_TOGGLE]: ({ ui, setView }) => setView(ui.view === SIDEBAR_VIEW.LIBRARY ? SIDEBAR_VIEW.SPACE : SIDEBAR_VIEW.LIBRARY),
  [ACT.LIBRARY_SECTION]: ({ ui, model, render }, { actEl }) => {
    ui.librarySection = actEl.dataset.section;
    ui.libraryQuery = '';
    if (ui.librarySection === LIBRARY_SECTION.DOWNLOADS) model.loadDownloads();
    render();
  },
  [ACT.ARCHIVE_DELETE]: ({ act }, { archiveId }) => act(MSG.ARCHIVE_DELETE, { id: archiveId }),
  [ACT.ARCHIVE_CLEAR]: (ctx) => clearArchiveDialog(ctx),
  [ACT.SETTINGS]: () => chrome.runtime.openOptionsPage(),
  [ACT.PLUS_MENU]: (ctx, { actEl }) => menuAbove(ctx, actEl, plusMenu(ctx)),
  [ACT.MEDIA_TOGGLE]: ({ act }, { mediaTabId }) => act(MSG.MEDIA_TOGGLE, { tabId: mediaTabId }),
  [ACT.MEDIA_MUTE]: ({ act }, { mediaTabId }) => act(MSG.TAB_MUTE, { tabId: mediaTabId }),
  [ACT.MEDIA_DISMISS]: ({ act }, { mediaTabId }) => act(MSG.MEDIA_DISMISS, { tabId: mediaTabId }),
  [ACT.MEDIA_FOCUS]: ({ act }, { mediaTabId }) => act(MSG.TAB_ACTIVATE, { tabId: mediaTabId }), // may be in another window
  [ACT.SEL_SPLIT]: ({ ui, splitTabs }) => splitTabs([...ui.selected]),
  [ACT.SEL_FOLDER]: ({ ui, newFolder }) => newFolder(null, takeSelection(ui)),
  [ACT.SEL_ARCHIVE]: ({ ui, act }) => act(MSG.TAB_ARCHIVE, { tabIds: takeSelection(ui) }),
  [ACT.SEL_CLOSE]: ({ ui, act }) => act(MSG.TAB_CLOSE, { tabIds: takeSelection(ui) }),
  [ACT.SEL_CLEAR]: ({ ui, render }) => {
    ui.selected.clear();
    render();
  },
};

function menuBelow({ overlay }, anchor, items) {
  const box = anchor.getBoundingClientRect();
  overlay.menu(box.left, box.bottom + 4, items);
}

function menuAbove({ overlay }, anchor, items) {
  const box = anchor.getBoundingClientRect();
  overlay.menu(box.left, box.top - items.length * 32, items);
}

// Open the file; if it cannot be opened (moved, or blocked by Chrome), reveal it instead.
async function openDownload(id) {
  try {
    await chrome.downloads.open(id);
  } catch {
    chrome.downloads.show(id);
  }
}

// Activating a tab is a plain browser action: do it from here, and show the
// selection at once instead of waiting for Chrome's events to come back.
function activateTab({ model, render }, tabId) {
  model.showActiveTab(tabId);
  render();
  return chrome.tabs.update(tabId, { active: true });
}

// An item that is already open just needs its tab shown; otherwise the
// service worker opens and binds a new tab.
function openNode(ctx, nodeId) {
  const tab = ctx.model.tabOfNode(nodeId);
  if (tab?.windowId === ctx.model.windowId) {
    ctx.model.showActiveTab(tab.id);
    ctx.render();
  }
  return ctx.act(MSG.NODE_OPEN, { nodeId });
}

// Show the space immediately, then let the service worker do the real switch.
function switchSpace({ model, act, setView }, spaceId) {
  model.showSpace(spaceId);
  setView(SIDEBAR_VIEW.SPACE);
  return act(MSG.SPACE_SWITCH, { spaceId });
}

function clickTab(ctx, tabId, event) {
  const { ui, model, act, render } = ctx;
  if (event.metaKey || event.ctrlKey) {
    if (!ui.selected.delete(tabId)) ui.selected.add(tabId);
    ui.anchorTab = tabId;
    return render();
  }
  if (event.shiftKey && ui.anchorTab != null) {
    const order = model.todayTabs().map((tab) => tab.id);
    const [from, to] = [order.indexOf(ui.anchorTab), order.indexOf(tabId)].sort((a, b) => a - b);
    if (from >= 0) for (const id of order.slice(from, to + 1)) ui.selected.add(id);
    return render();
  }
  ui.selected.clear();
  ui.anchorTab = tabId;
  return activateTab(ctx, tabId);
}

function onClick(ctx, event) {
  if (event.target.closest('input')) return;
  const target = describe(event.target);
  const { act, setView } = ctx;
  const run = () => {
    if (target.actEl) return ACTIONS[target.actEl.dataset.act]?.(ctx, target);
    if (target.tabId != null) return clickTab(ctx, target.tabId, event);
    if (target.liveEl) return openNode(ctx, target.liveEl.dataset.live);
    if (target.nodeEl) {
      const nodeId = target.nodeEl.dataset.node;
      if (![NODE.FOLDER, NODE.LIVE].includes(target.nodeEl.dataset.kind)) return openNode(ctx, nodeId);
      const node = ctx.model.findNode(nodeId);
      node.open = node.open === false; // shown at once; storage follows
      ctx.render();
      return act(MSG.NODE_TOGGLE, { nodeId, open: node.open });
    }
    if (target.spaceDot) return switchSpace(ctx, target.spaceDot.dataset.space);
    if (target.archiveId) return act(MSG.ARCHIVE_RESTORE, { id: target.archiveId });
    if (target.downloadId != null) return openDownload(target.downloadId);
    if (target.librarySpaceId) return switchSpace(ctx, target.librarySpaceId);
    if (target.boostHost) return chrome.tabs.create({ url: `${chrome.runtime.getURL(PATHS.options)}#boost=${encodeURIComponent(target.boostHost)}` });
    return null;
  };
  Promise.resolve(run()).catch(() => {});
}

function onAuxClick({ act }, event) {
  if (event.button !== MIDDLE_BUTTON) return;
  const target = describe(event.target);
  if (target.tabId != null) act(MSG.TAB_CLOSE, { tabIds: [target.tabId] });
  else if (target.nodeEl) act(MSG.NODE_CLOSE_TAB, { nodeId: target.nodeEl.dataset.node });
}

function onContextMenu(ctx, event) {
  const { model, overlay } = ctx;
  const target = describe(event.target);
  let items = null;
  if (target.tabId != null) items = tabMenu(ctx, model.tab(target.tabId));
  else if (target.liveEl) items = liveItemMenu(ctx, target.liveEl.dataset.live);
  else if (target.nodeEl) items = nodeMenu(ctx, target.nodeEl.dataset.node, target.nodeEl.dataset.zone);
  else if (target.spaceDot) items = spaceMenu(ctx, model.spaces.find((s) => s.id === target.spaceDot.dataset.space));
  else if (event.target.closest('.pane')) items = spaceMenu(ctx, model.space);
  if (!items) return;
  event.preventDefault();
  overlay.menu(event.clientX, event.clientY, items);
}

// Shortcuts that apply while the sidebar itself has focus.
function onKeyDown(ctx, event) {
  if (event.target.closest?.('input, textarea, select')) return;
  const { ui, model, overlay, act, render, setView } = ctx;
  const mod = event.metaKey || event.ctrlKey;
  const key = event.key.toLowerCase();
  if (event.key === 'Escape') {
    if (overlay.isOpen) return overlay.close();
    if (ui.selected.size) {
      ui.selected.clear();
      return render();
    }
    if (ui.view !== SIDEBAR_VIEW.SPACE) return setView(SIDEBAR_VIEW.SPACE);
    return null;
  }
  const paletteMode = mod && { t: PALETTE_MODE.NEW, l: PALETTE_MODE.CURRENT }[key];
  if (paletteMode) {
    event.preventDefault();
    return ctx.openCommandBar(paletteMode);
  }
  if (event.ctrlKey && /^[1-9]$/.test(event.key)) {
    const space = model.spaces[Number(event.key) - 1];
    return space && switchSpace(ctx, space.id);
  }
  return null;
}

export function installController(ctx) {
  const { app, ui, render } = ctx;
  app.addEventListener('click', (e) => onClick(ctx, e));
  app.addEventListener('auxclick', (e) => onAuxClick(ctx, e));
  app.addEventListener('contextmenu', (e) => onContextMenu(ctx, e));
  app.addEventListener('input', (e) => {
    if (!e.target.matches('[data-library-search]')) return;
    ui.libraryQuery = e.target.value;
    render();
  });
  document.addEventListener('keydown', (e) => onKeyDown(ctx, e));
  // Broken favicons fall back to a neutral globe.
  document.addEventListener(
    'error',
    (e) => {
      if (e.target.tagName === 'IMG' && e.target.src !== FALLBACK_ICON) e.target.src = FALLBACK_ICON;
    },
    true,
  );
}
