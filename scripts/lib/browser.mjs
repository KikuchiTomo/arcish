// Drives a throw-away headless Chrome with the extension loaded, over the
// DevTools protocol. Shared by the smoke test and the store asset generator.
//
//   const browser = await launchBrowser({ extensionDir });
//   const page = await browser.openPage(url);
//   await page.evaluate('document.title');
//   await browser.close();
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DEFAULT_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const WORKER_PATH = '/src/background/index.js';
const DEFAULT_TIMEOUT_MS = 20_000;
const POLL_MS = 200;
const RELOAD_SETTLE_MS = 1500; // time for the previous worker to go away when the extension is replaced

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function waitFor(fn, what, timeout = DEFAULT_TIMEOUT_MS) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const value = await fn();
      if (value) return value;
    } catch {
      /* not there yet */
    }
    await sleep(POLL_MS);
  }
  throw new Error(`timed out waiting for ${what}`);
}

// A free port, so runs never collide with each other or with another Chrome.
function freePort() {
  return new Promise((resolve) => {
    const probe = createServer().listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

// Minimal DevTools protocol client for one target (a page or the service worker).
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
  const send = (method, params = {}) =>
    new Promise((resolve) => {
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

  // Size the viewport. `scale` is the device pixel ratio of the capture.
  const setViewport = async (width, height, { scale = 2, scheme = 'light' } = {}) => {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false });
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
  };

  // Capture the viewport. `format` is 'png' or 'jpeg'; returns the bytes and writes `file` when given.
  const capture = async ({ file, format = 'png', quality } = {}) => {
    const { result } = await send('Page.captureScreenshot', { format, ...(quality ? { quality } : {}) });
    const bytes = Buffer.from(result.data, 'base64');
    if (file) writeFileSync(file, bytes);
    return bytes;
  };

  // Run a script in every document the target loads from now on, before the page's own scripts.
  const preload = async (source) => {
    await send('Page.enable'); // preload scripts only run once the Page domain is enabled
    return send('Page.addScriptToEvaluateOnNewDocument', { source });
  };
  const navigate = (url) => send('Page.navigate', { url });

  return { evaluate, setViewport, capture, preload, navigate, send, errors, close: () => ws.close() };
}

export async function launchBrowser({ extensionDir, chromePath = process.env.CHROME_BIN || DEFAULT_CHROME, flags = [], port } = {}) {
  const debugPort = port || (await freePort());
  const profile = mkdtempSync(join(tmpdir(), 'arcish-browser-'));
  // Branded Chrome ignores --load-extension, so the extension is loaded
  // through the DevTools protocol (Extensions.loadUnpacked), which is only
  // available on the debugging pipe. Everything else uses the debugging port.
  const chrome = spawn(
    chromePath,
    ['--headless=new', `--user-data-dir=${profile}`, `--remote-debugging-port=${debugPort}`, '--remote-debugging-pipe', '--enable-unsafe-extension-debugging', '--no-first-run', '--no-default-browser-check', ...flags, 'about:blank'],
    { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] },
  );
  for (const stream of [chrome.stdio[3], chrome.stdio[4]]) stream.on('error', () => {}); // an early exit shows up as a timeout, not a crash

  let commandId = 0;
  const waiting = new Map();
  let buffer = '';
  chrome.stdio[4].on('data', (chunk) => {
    buffer += chunk;
    for (let end = buffer.indexOf('\0'); end >= 0; end = buffer.indexOf('\0')) {
      const message = JSON.parse(buffer.slice(0, end));
      buffer = buffer.slice(end + 1);
      const settle = waiting.get(message.id);
      if (!settle) continue;
      waiting.delete(message.id);
      if (message.error) settle.reject(new Error(message.error.message));
      else settle.resolve(message.result);
    }
  });
  const pipeCommand = (method, params) =>
    new Promise((resolve, reject) => {
      waiting.set(++commandId, { resolve, reject });
      chrome.stdio[3].write(`${JSON.stringify({ id: commandId, method, params })}\0`);
    });

  const endpoint = `http://127.0.0.1:${debugPort}`;
  const targets = async () => (await fetch(`${endpoint}/json/list`)).json();
  const findWorker = async () => (await targets()).find((t) => t.type === 'service_worker' && t.url.endsWith(WORKER_PATH));

  await waitFor(targets, 'Chrome');

  // (Re)load the extension and attach to its service worker. Loading it again
  // replaces the running copy, the way an update does.
  let loaded = false;
  const loadExtension = async () => {
    await pipeCommand('Extensions.loadUnpacked', { path: extensionDir });
    if (loaded) await sleep(RELOAD_SETTLE_MS);
    loaded = true;
    const worker = await waitFor(findWorker, 'service worker');
    return { worker: await attach(worker), baseUrl: worker.url.replace(WORKER_PATH, '') };
  };

  const openPage = async (url) => {
    const target = await (await fetch(`${endpoint}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json();
    return attach(target);
  };

  const close = async () => {
    chrome.kill();
    await sleep(300);
    rmSync(profile, { recursive: true, force: true });
  };

  return { targets, attach, openPage, loadExtension, close };
}
