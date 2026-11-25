#!/usr/bin/env node
// Real-browser smoke test:   node scripts/smoke.mjs
// Starts a throw-away headless Chrome (own profile, own port) with the
// extension loaded, and checks that the service worker boots and that the
// extension pages and the in-page command bar work without errors.
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The extension to test: the working tree, or an unpacked build (SMOKE_EXTENSION_DIR).
const ROOT = process.env.SMOKE_EXTENSION_DIR || join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
// A free port, so runs never collide with each other or with another Chrome.
const freePort = () =>
  new Promise((resolve) => {
    const probe = createServer().listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
const DEBUG_PORT = Number(process.env.SMOKE_PORT) || (await freePort());
const EXTRA_FLAGS = (process.env.SMOKE_CHROME_FLAGS || '').split(' ').filter(Boolean); // e.g. --no-sandbox on CI
const BOOT_TIMEOUT_MS = 20_000;
const SHOTS_DIR = process.env.SMOKE_SHOTS; // optional: directory for screenshots of the UI
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail });

async function targets() {
  return (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
}

async function waitFor(fn, what, timeout = BOOT_TIMEOUT_MS) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const value = await fn();
      if (value) return value;
    } catch {
      /* not up yet */
    }
    await sleep(200);
  }
  throw new Error(`timed out waiting for ${what}`);
}

// Minimal Chrome DevTools Protocol client.
async function attach(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.onmessage = ({ data }) => {
    const msg = JSON.parse(data);
    if (msg.id && pending.has(msg.id)) pending.get(msg.id)(msg);
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') errors.push(msg.params.entry.text);
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
  };
  const send = (method, params = {}) => new Promise((resolve) => {
    pending.set(++id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
  await send('Runtime.enable');
  await send('Log.enable');
  const evaluate = async (expression) => {
    const { result } = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const screenshot = async (file, width, height, prepare) => {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: false });
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: process.env.SMOKE_SCHEME || 'light' }] });
    await sleep(700);
    if (prepare) {
      await evaluate(prepare);
      await sleep(300);
    }
    const { result } = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(file, Buffer.from(result.data, 'base64'));
  };
  return { evaluate, screenshot, errors, close: () => ws.close() };
}

async function openPage(url) {
  const target = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json();
  return attach(target);
}

const site = createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/html', 'content-security-policy': "default-src 'self'; frame-src 'none'" });
  res.end('<!doctype html><title>Strict page</title><h1>Hello</h1><a id="link" href="/other">link</a>');
});
await new Promise((resolve) => site.listen(0, '127.0.0.1', resolve));
const siteUrl = `http://127.0.0.1:${site.address().port}/`;

const profile = mkdtempSync(join(tmpdir(), 'arcish-smoke-'));
// Branded Chrome ignores --load-extension, so the extension is loaded through
// the DevTools protocol (Extensions.loadUnpacked), which is only available on
// the debugging pipe. Everything else uses the debugging port.
const chrome = spawn(CHROME, [
  '--headless=new',
  `--user-data-dir=${profile}`,
  `--remote-debugging-port=${DEBUG_PORT}`,
  '--remote-debugging-pipe',
  '--enable-unsafe-extension-debugging',
  '--no-first-run',
  '--no-default-browser-check',
  ...EXTRA_FLAGS,
  'about:blank',
], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });

for (const stream of [chrome.stdio[3], chrome.stdio[4]]) stream.on('error', () => {}); // Chrome exiting early is reported by the checks, not by a crash

function pipeCommand(method, params) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    chrome.stdio[4].on('data', (chunk) => {
      buffer += chunk;
      for (let end = buffer.indexOf('\0'); end >= 0; end = buffer.indexOf('\0')) {
        const message = JSON.parse(buffer.slice(0, end));
        buffer = buffer.slice(end + 1);
        if (message.id === 1) (message.error ? reject(new Error(message.error.message)) : resolve(message.result));
      }
    });
    chrome.stdio[3].write(`${JSON.stringify({ id: 1, method, params })}\0`);
  });
}

try {
  await waitFor(targets, 'Chrome');
  await pipeCommand('Extensions.loadUnpacked', { path: ROOT });
  const worker = await waitFor(async () => (await targets()).find((t) => t.type === 'service_worker' && t.url.endsWith('/src/background/index.js')), 'service worker');
  const base = worker.url.replace('/src/background/index.js', '');
  const sw = await attach(worker);

  // 1. boot
  const state = await waitFor(async () => {
    const s = JSON.parse(await sw.evaluate('chrome.storage.local.get(null).then(JSON.stringify)'));
    return s.initialized && s;
  }, 'first run');
  check('service worker boots and creates the default spaces', state.spaces?.length === 2, JSON.stringify(state.spaces?.map((s) => s.name)));
  check('defaults leave Chrome behaviour alone', !state.settings || (!state.settings.archiveAfter && !state.settings.peekShiftClick));
  const groups = await sw.evaluate('chrome.tabGroups.query({}).then((g) => g.length)');
  check('no tab groups are created in the default mode', groups === 0, `groups=${groups}`);
  const menuTitle = await sw.evaluate('chrome.i18n.getMessage("menuOpenInMini")');
  check('locale messages are loaded', !!menuTitle, menuTitle);

  // 2. extension pages
  for (const [name, path, probe] of [
    ['sidebar', 'src/sidebar/sidebar.html', 'document.querySelectorAll(".space-dot").length === 2 && !!document.querySelector(".pinned")'],
    ['settings', 'src/options/options.html', 'document.querySelectorAll(".nav a").length === 8 && !!document.querySelector("[data-setting]")'],
    ['command bar (window host)', 'src/palette/palette.html?host=window&mode=new', '!!document.querySelector("#results .item")'],
    ['little window launcher', 'src/mini/mini.html', 'document.body.dataset.host === "mini" && !!document.querySelector("#q").placeholder'],
  ]) {
    const page = await openPage(`${base}/${path}`);
    const ok = await waitFor(() => page.evaluate(probe), name, 6000).catch(() => false);
    check(`${name} page renders`, ok && !page.errors.length, page.errors.join(' | '));
    page.close();
  }

  // 2b. opening the command bar from the sidebar puts the caret in its input
  const side = await openPage(`${base}/src/sidebar/sidebar.html`);
  await waitFor(() => side.evaluate('!!document.querySelector("[data-act=\\"new-tab\\"]")'), 'sidebar');
  await side.evaluate('document.querySelector("[data-act=\\"new-tab\\"]").click()');
  const focused = await waitFor(() => side.evaluate('document.activeElement?.className === "palette-frame" && document.activeElement.contentDocument?.activeElement?.id === "q"'), 'command bar focus', 5000).catch(() => false);
  check('command bar opened from the sidebar has keyboard focus', focused && !side.errors.length, side.errors.join(' | '));
  side.close();

  // 3. a web page with a strict CSP: content script + in-page command bar
  const page = await openPage(siteUrl);
  await waitFor(() => page.evaluate('document.readyState === "complete"'), 'test page');
  const tabId = await sw.evaluate(`chrome.tabs.query({ url: ${JSON.stringify(siteUrl + '*')} }).then((t) => t[0]?.id)`);
  check('nothing is injected into the page until needed', await page.evaluate('!document.querySelector("arcish-ui, iframe, #arcish-boost")'));
  check('new tabs join a space', await waitFor(() => sw.evaluate(`chrome.storage.session.get("tabSpace").then((s) => !!s.tabSpace?.[${tabId}])`), 'tab adoption', 5000).catch(() => false));

  // The content script may still be starting; retry until it answers.
  await waitFor(() => sw.evaluate(`chrome.tabs.sendMessage(${tabId}, { type: 'push:palette:open', mode: 'new' }).then(() => true)`), 'content script', 5000);
  await sleep(1500); // longer than the overlay's ready timeout
  const overlay = await page.evaluate('!!document.querySelector("iframe[src*=\\"palette.html\\"]")');
  const fallback = (await targets()).some((t) => t.url.includes('palette.html?host=window'));
  check('command bar opens on a strict-CSP page (overlay, or window fallback)', overlay || fallback, overlay ? 'overlay' : fallback ? 'window fallback' : 'neither');

  await sw.evaluate(`chrome.tabs.sendMessage(${tabId}, { type: 'push:toast', text: 'hi' })`);
  check('toast UI mounts in a shadow root', await waitFor(() => page.evaluate('!!document.querySelector("arcish-ui")'), 'toast', 3000).catch(() => false));
  check('test page has no script errors', !page.errors.length, page.errors.join(' | '));

  // 4. pin the page, close it, reopen it from the pinned item
  const windowId = await sw.evaluate(`chrome.tabs.get(${tabId}).then((t) => t.windowId)`);
  const rpc = (message) => page0.evaluate(`chrome.runtime.sendMessage(${JSON.stringify(message)}).then(JSON.stringify)`).then(JSON.parse);
  const page0 = await openPage(`${base}/src/options/options.html`);
  await rpc({ type: 'tab:pin', tabId });
  await sw.evaluate(`chrome.tabs.remove(${tabId})`);
  await sleep(400);
  const pinned = JSON.parse(await sw.evaluate('chrome.storage.local.get("spaces").then((s) => JSON.stringify(s.spaces.flatMap((x) => x.pinned)))'));
  check('a pinned item survives closing its tab', pinned.length === 1 && pinned[0].url === siteUrl, JSON.stringify(pinned));
  const reopened = await rpc({ type: 'node:open', nodeId: pinned[0].id, windowId });
  check('opening the pinned item creates a bound tab', Number.isInteger(reopened.data), JSON.stringify(reopened));

  // 4b. folders collapse to zero height (animated) and expand again
  const folderId = (await rpc({ type: 'folder:create', spaceId: state.spaces[0].id, title: 'Folder', tabIds: [reopened.data] })).data;
  const panel = await openPage(`${base}/src/sidebar/sidebar.html`);
  const kidsHeight = `document.querySelector('[data-key="children-${folderId}"]')?.getBoundingClientRect().height`;
  const openHeight = await waitFor(() => panel.evaluate(kidsHeight), 'folder children', 5000).catch(() => 0);
  const indent = await panel.evaluate(`(() => {
    const left = (el) => el.getBoundingClientRect().left;
    return left(document.querySelector('[data-key="children-${folderId}"] .row')) - left(document.querySelector('[data-node="${folderId}"]'));
  })()`);
  check('nested rows are indented as a whole box', indent > 0, `indent=${indent}px`);
  await panel.evaluate(`document.querySelector('[data-node="${folderId}"]').click()`);
  await sleep(120);
  const midHeight = await panel.evaluate(kidsHeight);
  await sleep(500);
  const closedHeight = await panel.evaluate(kidsHeight);
  check('folder closes with an animation', openHeight > 30 && midHeight > 0 && midHeight < openHeight && closedHeight === 0, `open=${openHeight} mid=${midHeight} closed=${closedHeight}`);
  panel.close();

  // 4c. switching space slides the old content out and settles on the new space
  const slider = await openPage(`${base}/src/sidebar/sidebar.html`);
  await waitFor(() => slider.evaluate('document.querySelectorAll(".space-dot").length === 2'), 'space dots', 5000).catch(() => false);
  await slider.evaluate('document.querySelectorAll(".space-dot")[1].click()');
  const sliding = await slider.evaluate('!!document.querySelector(".pane-ghost") && document.querySelector(".pane").getAnimations().length > 0');
  await sleep(700);
  const settled = await slider.evaluate('!document.querySelector(".pane-ghost") && document.querySelector(".space-head .name").textContent');
  check('switching space animates and lands on the new space', sliding && settled === state.spaces[1].name, `sliding=${sliding} settled=${settled}`);
  check('sidebar logged no errors', !slider.errors.length, slider.errors.join(' | '));
  await slider.evaluate('document.querySelectorAll(".space-dot")[0].click()');
  await sleep(600);

  // 4d. swiping follows the fingers: a short swipe springs back, a long one switches, the edge does nothing
  const wheel = (deltaX, times) => slider.evaluate(`(async () => { for (let i = 0; i < ${times}; i++) { document.querySelector('#app').dispatchEvent(new WheelEvent('wheel', { deltaX: ${deltaX}, bubbles: true })); await new Promise((r) => setTimeout(r, 16)); } return document.querySelector('.pane').style.transform; })()`);
  const spaceName = () => slider.evaluate('document.querySelector(".space-head .name").textContent');
  const edge = await wheel(-40, 4);
  const partial = await wheel(20, 3);
  await sleep(900);
  const afterPartial = await spaceName();
  await wheel(40, 14); // well past the middle of the panel
  await sleep(1100);
  const afterFull = await spaceName();
  check('swipe: no space beyond the edge', edge === '', `transform="${edge}"`);
  check('swipe: content follows the fingers and a short swipe springs back', /translateX\(-\d/.test(partial) && afterPartial === state.spaces[0].name, `transform="${partial}" then ${afterPartial}`);
  check('swipe: a long swipe switches space', afterFull === state.spaces[1].name, afterFull);
  check('sidebar logged no errors after swiping', !slider.errors.length, slider.errors.join(' | '));
  slider.close();

  check('service worker logged no errors', !sw.errors.length, sw.errors.join(' | '));

  // 5. optional screenshots of a populated sidebar, the command bar and settings
  if (SHOTS_DIR) {
    mkdirSync(SHOTS_DIR, { recursive: true });
    const spaceId = JSON.parse(await sw.evaluate('chrome.storage.local.get("spaces").then((s) => JSON.stringify(s.spaces[0].id))'));
    await rpc({ type: 'space:switch', windowId, spaceId }); // earlier checks left the window on the second space
    for (const url of ['https://github.com/', 'https://news.ycombinator.com/', 'https://developer.chrome.com/docs/extensions']) {
      const tab = await rpc({ type: 'tab:open', url, windowId });
      await sleep(1200);
      if (url.includes('github')) await rpc({ type: 'tab:favorite', tabId: tab.data.id });
    }
    await rpc({ type: 'folder:create', spaceId, title: 'Reading list' });
    await rpc({ type: 'live:create', spaceId, title: 'Hacker News', source: { kind: 'hn', tag: 'front_page' } });
    await rpc({ type: 'live:create', spaceId, title: 'Pull Requests', source: { kind: 'github-prs', repo: 'nodejs/node' } });
    // Rename lives in the context menu: open it on the folder and pick the first entry.
    const startRename = `(() => {
      document.querySelector('.row.folder').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 200 }));
      document.querySelector('#overlay .mi').click();
    })()`;
    const openLibrary = 'document.querySelector(".bottom [data-act=\\"library-toggle\\"]").click()';
    const openSpaceColor = `(() => {
      document.querySelector('.space-head').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 120 }));
      [...document.querySelectorAll('#overlay .mi')][2].click();
    })()`;
    // Give a nested row the hover look (a real pointer cannot be placed from here).
    const hoverChild = `(() => { const row = document.querySelector('.row[style*="--depth:1"]'); row.style.background = 'var(--hover)'; })()`;
    for (const [file, path, width, height, prepare] of [
      ['sidebar.png', 'src/sidebar/sidebar.html', 320, 860],
      ['sidebar-rename.png', 'src/sidebar/sidebar.html', 320, 420, startRename],
      ['sidebar-color.png', 'src/sidebar/sidebar.html', 320, 520, openSpaceColor],
      ['sidebar-hover.png', 'src/sidebar/sidebar.html', 320, 420, hoverChild],
      ['library.png', 'src/sidebar/sidebar.html', 320, 620, openLibrary],
      ['command-bar.png', 'src/palette/palette.html?host=window&mode=new', 700, 480],
      ['settings.png', 'src/options/options.html', 1000, 760],
      ['settings-spaces.png', 'src/options/options.html#spaces', 1000, 560],
      ['settings-chrome.png', 'src/options/options.html#chrome', 1000, 700],
    ]) {
      const shot = await openPage(`${base}/${path}`);
      await shot.screenshot(join(SHOTS_DIR, file), width, height, prepare);
      shot.close();
    }
  }

  // 5b. Chrome's pinned tabs keep the order of the Favorites (so "go to tab N" shortcuts match)
  const pinnedUrls = () => sw.evaluate(`chrome.tabs.query({ windowId: ${windowId}, pinned: true }).then((t) => JSON.stringify(t.sort((a, b) => a.index - b.index).map((x) => new URL(x.url).pathname)))`).then(JSON.parse);
  const favIds = [];
  for (const path of ['one', 'two', 'three']) {
    const id = (await rpc({ type: 'tab:open', url: siteUrl + path, windowId })).data.id;
    await sleep(500);
    favIds.push((await rpc({ type: 'tab:favorite', tabId: id })).data);
  }
  const base3 = (await pinnedUrls()).filter((p) => ['/one', '/two', '/three'].includes(p));
  await rpc({ type: 'node:move', nodeId: favIds[2], target: { zone: 'fav', beforeId: favIds[0] } });
  await sleep(500);
  const moved3 = (await pinnedUrls()).filter((p) => ['/one', '/two', '/three'].includes(p));
  check('pinned tabs follow the order of the Favorites', base3.join() === '/one,/two,/three' && moved3.join() === '/three,/one,/two', `${base3} -> ${moved3}`);

  // 6. replacing the extension (as an update does) keeps favorites attached to their tabs
  const favTab = (await rpc({ type: 'tab:open', url: `${siteUrl}mail`, windowId })).data.id;
  await sleep(600);
  await rpc({ type: 'tab:favorite', tabId: favTab });
  await sw.evaluate(`chrome.tabs.update(${favTab}, { url: ${JSON.stringify(siteUrl + 'mail/inbox?x=1')} }).then(() => 1)`);
  await sleep(800);
  const before = JSON.parse(await sw.evaluate('Promise.all([chrome.storage.local.get("favorites"), chrome.storage.session.get("bindings")]).then(([l, s]) => JSON.stringify({ favorites: l.favorites, bindings: s.bindings }))'));
  const favoriteId = before.favorites.at(-1).id;
  await sw.evaluate('chrome.storage.session.set({ smokeMarker: 1 }).then(() => 1)');
  await pipeCommand('Extensions.loadUnpacked', { path: ROOT }); // loading it again replaces the running copy, like an update
  await sleep(1500);
  const reloaded = await attach(await waitFor(async () => (await targets()).find((t) => t.type === 'service_worker' && t.url.endsWith('/src/background/index.js')), 'service worker after reload'));
  const after = await waitFor(async () => {
    const data = JSON.parse(await reloaded.evaluate('Promise.all([chrome.storage.local.get("favorites"), chrome.storage.session.get(["bindings", "booted"])]).then(([l, s]) => JSON.stringify({ favorites: l.favorites, ...s }))'));
    return data.booted && data;
  }, 'boot after reload');
  const sessionCleared = await reloaded.evaluate('chrome.storage.session.get("smokeMarker").then((s) => s.smokeMarker === undefined)');
  check('extension reload: session state was really lost (the scenario is real)', sessionCleared);
  check('extension reload: no duplicate favorites', after.favorites.length === before.favorites.length, `${before.favorites.length} -> ${after.favorites.length}`);
  check('extension reload: the favorite is still attached to its tab', after.bindings?.[favoriteId] === favTab, `tab ${favTab} -> ${after.bindings?.[favoriteId]}`);
  check('service worker logged no errors after reload', !reloaded.errors.length, reloaded.errors.join(' | '));
} catch (e) {
  check('smoke run completed', false, String(e.stack || e));
} finally {
  chrome.kill();
  site.close();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}

for (const r of results) console.log(`${r.ok ? '✔' : '✖'} ${r.name}${r.detail && !r.ok ? `\n    ${r.detail}` : r.detail ? `  (${r.detail})` : ''}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
