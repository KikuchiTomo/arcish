// Runs an extension page under jsdom, wired to the real services through the
// real message routes (page -> runtime.sendMessage -> route -> service).
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { createHarness } from './harness.js';

const DOM_GLOBALS = ['window', 'document', 'Node', 'Element', 'HTMLElement', 'HTMLAnchorElement', 'FormData', 'Event', 'MouseEvent', 'KeyboardEvent', 'CustomEvent', 'getComputedStyle', 'requestAnimationFrame', 'location', 'innerWidth', 'innerHeight'];

export function installDom(html, url = 'chrome-extension://fake/page.html') {
  const dom = new JSDOM(html, { url, pretendToBeVisual: true });
  for (const name of DOM_GLOBALS) Object.defineProperty(globalThis, name, { value: dom.window[name], configurable: true, writable: true });
  Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
  dom.window.Element.prototype.scrollIntoView ??= () => {};
  globalThis.CSS ??= { escape: (s) => String(s).replace(/[^\w-]/g, '\\$&') };
  return dom;
}

// Body of an extension page without its <script> (the test imports the module itself).
export function pageHtml(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8').replace(/<script[^>]*><\/script>/g, '');
}

export async function createPageHarness(options) {
  const h = await createHarness(options);
  const { buildRoutes } = await import('../../src/background/wiring/routes.js');
  const routes = buildRoutes(h);
  const calls = [];
  h.fake.routeMessages(async (message) => {
    calls.push(message);
    try {
      return { data: await routes[message.type](message, { tab: null }) };
    } catch (e) {
      return { error: String(e.message || e) };
    }
  });
  return { ...h, calls };
}

export const settle = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms));

export function click(el, init = {}) {
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true, ...init }));
}
