// Sidebar composition root: model -> render -> morph, plus the shared
// context object handed to the controller, menus and dialogs.
import { PATHS, TIMINGS } from '../config/defaults.js';
import { morph } from '../shared/dom/morph.js';
import { initI18n, t } from '../shared/i18n.js';
import { FRAME, MSG, PALETTE_HOST, rpc } from '../shared/messages.js';
import { SESSION, SIDEBAR_VIEW } from '../shared/storage-keys.js';
import { debounce } from '../shared/text.js';
import { installController } from './controller.js';
import { installDragAndDrop } from './dnd.js';
import { SidebarModel } from './model.js';
import { cascade, motion, motionEnabled, slidePanes, snapshot } from './motion.js';
import { renderSidebar } from './render.js';
import { installSwipe } from './swipe.js';
import { createUiState } from './ui-state.js';
import { Overlay } from './ui/overlay.js';

const app = document.getElementById('app');
const windowId = (await chrome.windows.getCurrent()).id;
const model = new SidebarModel(windowId);
const ui = createUiState();
let language;
let renderHeld = false;

// The stylesheet derives every tint from this one custom property.
function applyColor(color) {
  document.documentElement.style.setProperty('--space', color);
  document.documentElement.dataset.scheme = model.settings.colorScheme;
}

function render() {
  if (model.pendingView) {
    ui.view = model.pendingView;
    chrome.storage.session.set({ [SESSION.SIDEBAR_VIEW]: null });
  }
  applyColor(model.color);
  // Changing space, or opening/closing the Library, slides the old content
  // out and the new content in from the side it lives on.
  const order = (id) => model.spaces.findIndex((space) => space.id === id);
  const viewChanged = ui.shownView && ui.shownView !== ui.view;
  const spaceChanged = ui.view === SIDEBAR_VIEW.SPACE && ui.shownSpaceId && ui.shownSpaceId !== model.spaceId;
  const scroller = app.querySelector('.scroll');
  const ghost = (viewChanged || spaceChanged) && scroller && motionEnabled() ? snapshot(scroller) : null;
  let direction = order(model.spaceId) > order(ui.shownSpaceId) ? 1 : -1;
  if (viewChanged) direction = ui.view === SIDEBAR_VIEW.LIBRARY ? -1 : 1; // the Library sits to the left of the spaces
  morph(app, renderSidebar(model, ui), motion);
  if (ghost) slidePanes(app.querySelector('.scroll'), ghost, direction);
  if (viewChanged && ui.view === SIDEBAR_VIEW.LIBRARY) cascade(app.querySelectorAll('.lib-rail button, .lib-list > *'));
  ui.shownSpaceId = model.spaceId;
  ui.shownView = ui.view;
}

// Rendering waits while the user is dragging, renaming or filling a dialog.
const rerender = debounce(async () => {
  if (ui.dragging || ui.renaming || ui.swiping || overlay.hasDialog) {
    renderHeld = true;
    return;
  }
  renderHeld = false;
  if (model.settings.language !== language) {
    language = model.settings.language;
    await initI18n(language);
  }
  render();
}, TIMINGS.renderDebounceMs);

const flush = () => renderHeld && rerender();
// Closing a dialog re-renders, which also discards any live preview (e.g. a colour not saved).
const overlay = new Overlay(document.getElementById('overlay'), { onClose: () => rerender() });

async function act(type, payload = {}) {
  try {
    return await rpc(type, { windowId, ...payload });
  } catch (e) {
    overlay.toast(e.message);
    throw e;
  }
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    overlay.toast(t('toastUrlCopied'));
  } catch {
    overlay.toast(t('toastCopyFailed'));
  }
}

function rename(nodeId) {
  ui.renaming = nodeId;
  render();
  const input = app.querySelector(`[data-rename="${nodeId}"]`);
  if (!input) {
    ui.renaming = null;
    return;
  }
  input.focus();
  input.select();
  let done = false;
  const finish = async (commit) => {
    if (done) return;
    done = true;
    ui.renaming = null;
    if (commit) await act(MSG.NODE_RENAME, { nodeId, title: input.value }).catch(() => {});
    rerender();
  };
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
}

// The new folder appears through a storage event; start renaming once it has.
async function newFolder(parentId, tabIds = []) {
  const id = await act(MSG.FOLDER_CREATE, { spaceId: model.spaceId, parentId, tabIds });
  const waitForNode = () => (model.findNode(id) ? rename(id) : setTimeout(waitForNode, TIMINGS.renderDebounceMs));
  waitForNode();
}

async function refreshLive(folderId) {
  ui.busyFolders.add(folderId);
  render();
  try {
    await act(MSG.LIVE_REFRESH, { folderId });
  } finally {
    ui.busyFolders.delete(folderId);
    rerender();
  }
}

async function splitTabs(tabIds) {
  let ids = tabIds;
  if (ids.length < 2) {
    const active = model.activeTab;
    if (!active || active.id === ids[0]) return overlay.toast(t('errorSplitNeedsTwo'));
    ids = [active.id, ids[0]];
  }
  ui.selected.clear();
  await act(MSG.SPLIT_CREATE, { tabIds: ids });
}

// The command bar opens inside the sidebar: the keyboard focus is already
// here, and Chrome does not let a page take focus away from the side panel.
function openCommandBar(mode) {
  overlay.close();
  const params = new URLSearchParams({ host: PALETTE_HOST.PANEL, mode, tabId: String(model.activeTab?.id ?? ''), windowId: String(windowId) });
  const frame = Object.assign(document.createElement('iframe'), { className: 'palette-frame', src: `${chrome.runtime.getURL(PATHS.palette)}?${params}` });
  frame.allow = 'clipboard-write';
  frame.addEventListener('load', () => frame.focus());
  const onMessage = (event) => {
    if (event.source !== frame.contentWindow || event.data?.channel !== FRAME.CHANNEL) return;
    if (event.data.type === FRAME.TOAST) overlay.toast(event.data.text);
    if (event.data.type === FRAME.CLOSE) {
      window.removeEventListener('message', onMessage);
      frame.remove();
    }
  };
  window.addEventListener('message', onMessage);
  overlay.mount(frame);
}

function setView(view) {
  ui.view = view;
  ui.libraryQuery = '';
  render();
}

const ctx = { app, model, ui, overlay, act, copy, rename, newFolder, refreshLive, splitTabs, openCommandBar, applyColor, render, rerender, flush, setView };

await initI18n();
await model.init();
language = model.settings.language;
model.onChange(rerender);
// A stopped service worker makes the next click wait for a cold start; a
// light ping while the sidebar is visible keeps it running.
setInterval(() => document.visibilityState === 'visible' && rpc(MSG.PING).catch(() => {}), TIMINGS.keepAliveMs);
installController(ctx);
installDragAndDrop(ctx);
installSwipe(ctx);
render();
