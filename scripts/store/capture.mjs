// Captures the real extension UI (with the dummy data) as images that the
// store screenshots and the promo film are composed from.
import { sleep, waitFor } from '../lib/browser.mjs';

const PANEL = { width: 320, height: 660 };
const PALETTE = { width: 720, height: 460 };
const SETTINGS = { width: 1000, height: 700 };
const PANEL_MARK = '#arcish-panel';
const SETTLE_MS = 700; // longer than the sidebar's own transitions
const TRANSPARENT = { r: 0, g: 0, b: 0, a: 0 };

// Send a message to the service worker from an extension page.
export const rpcFrom = (page) => (message) => page.evaluate(`chrome.runtime.sendMessage(${JSON.stringify(message)}).then(JSON.stringify)`).then(JSON.parse);

// Popup windows opened for capturing must not linger: their tabs would show up in later captures.
export const closePopups = (worker) => worker.evaluate('chrome.windows.getAll({ windowTypes: ["popup"] }).then((all) => Promise.all(all.map((w) => chrome.windows.remove(w.id)))).then(() => 1)');

// Close the tab a page lives in. The worker does the closing: a page cannot
// report back from closing itself.
async function closeTab(worker, page) {
  const tabId = await page.evaluate('chrome.tabs.getCurrent().then((tab) => tab.id)');
  page.close();
  await worker.evaluate(`chrome.tabs.remove(${tabId}).then(() => 1)`);
}

// An extension page in a window of its own (so it is not listed among the main window's tabs).
export async function openDetached({ browser, worker, url, mark }) {
  await worker.evaluate(`chrome.windows.create({ url: 'about:blank${mark}', type: 'popup', width: 420, height: 900 }).then(() => 1)`);
  const target = await waitFor(async () => (await browser.targets()).find((t) => t.url.endsWith(mark)), 'detached window');
  const page = await browser.attach(target);
  return { page, open: () => page.navigate(url) };
}

// The sidebar normally lives in the side panel of a browser window. Headless
// Chrome has no side panel, so it runs in a window of its own, and a one-line
// shim loaded before the page makes it report the main window as its own.
// It then shows the main window's tabs, exactly as the real panel would.
const panelShim = (windowId) => `chrome.windows.getCurrent = async () => ({ id: ${windowId} });`;

async function openPanel({ browser, worker, baseUrl, windowId }) {
  const { page: panel, open } = await openDetached({ browser, worker, url: `${baseUrl}/src/sidebar/sidebar.html`, mark: PANEL_MARK });
  await panel.preload(panelShim(windowId));
  await open();
  await panel.setViewport(PANEL.width, PANEL.height);
  await waitFor(() => panel.evaluate('!!document.querySelector(".space-dot")'), 'sidebar');
  await sleep(SETTLE_MS);
  return panel;
}

// Returns { name: pngBuffer } for one language.
export async function captureUi({ browser, worker, baseUrl, demo, site, language }) {
  const { windowId, tabs, folders, live, spaces } = demo;
  const shots = {};

  // ---- sidebar states
  const panel = await openPanel({ browser, worker, baseUrl, windowId });
  const rpc = rpcFrom(panel);
  await rpc({ type: 'settings:update', patch: { language } });
  // Show a space with one of its tabs active.
  const showSpace = async (spaceId, activePath) => {
    await rpc({ type: 'space:switch', windowId, spaceId });
    await worker.evaluate(`chrome.tabs.update(${tabs[activePath]}, { active: true }).then(() => 1)`);
    await sleep(SETTLE_MS);
  };
  const snap = async (name) => {
    await sleep(SETTLE_MS);
    shots[name] = await panel.capture();
  };
  await showSpace(spaces.personal.id, 'weather');
  await snap('panel-personal');
  await showSpace(spaces.personal.id, 'reads'); // a pinned item selected
  await snap('panel-personal-pinned');
  await showSpace(spaces.personal.id, 'weather');
  await showSpace(spaces.research.id, 'paper');
  await snap('panel-research');
  await showSpace(spaces.work.id, 'board');
  await snap('panel-work');
  await rpc({ type: 'node:toggle', nodeId: live.pulls, open: false });
  await snap('panel-work-closed');
  await rpc({ type: 'node:toggle', nodeId: live.pulls, open: true });
  await rpc({ type: 'node:toggle', nodeId: folders.project, open: false });
  await snap('panel-work-folder-closed');
  await rpc({ type: 'node:toggle', nodeId: folders.project, open: true });
  await showSpace(spaces.personal.id, 'weather');
  await panel.evaluate('document.querySelector(".bottom [data-act=\\"library-toggle\\"]").click()');
  await snap('panel-library');
  await panel.evaluate('document.querySelector(".lib-rail [data-act=\\"library-toggle\\"]").click()');
  await showSpace(spaces.work.id, 'board');
  panel.close();
  await closePopups(worker);

  // ---- command bar, as the overlay it is on a page (transparent around the card)
  const palette = await browser.openPage(`${baseUrl}/src/palette/palette.html?host=overlay&mode=new`);
  await palette.setViewport(PALETTE.width, PALETTE.height);
  await palette.send('Emulation.setDefaultBackgroundColorOverride', { color: TRANSPARENT });
  await waitFor(() => palette.evaluate('!!document.querySelector("#results .item")'), 'command bar');
  // Only the card is captured; whatever shows it supplies the dimmed page behind.
  await palette.evaluate('document.querySelector(".backdrop").style.display = "none"');
  for (const query of ['', 'd', 'de', 'des']) {
    await palette.evaluate(`(() => { const q = document.getElementById('q'); q.value = ${JSON.stringify(query)}; q.dispatchEvent(new Event('input', { bubbles: true })); q.blur(); })()`);
    await sleep(350);
    shots[`palette-${query.length}`] = await palette.capture();
  }
  await closeTab(worker, palette);

  // ---- settings
  const settings = await browser.openPage(`${baseUrl}/src/options/options.html#chrome`);
  await settings.setViewport(SETTINGS.width, SETTINGS.height);
  await waitFor(() => settings.evaluate('!!document.querySelector(".cards")'), 'settings');
  // The page fades in; capture it fully shown rather than part-way through.
  await settings.evaluate('document.querySelector(".page").style.animation = "none"');
  await sleep(400);
  shots.settings = await settings.capture();
  await closeTab(worker, settings);

  for (const [name, body] of Object.entries(shots)) site.publish(`ui/${language}/${name}.png`, body);
  return shots;
}

export const SIZES = { PANEL, PALETTE, SETTINGS };
