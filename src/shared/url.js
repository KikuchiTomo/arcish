import { CUSTOM_ENGINE, DEFAULT_SEARCH_ENGINE, QUERY_TOKEN, SEARCH_ENGINES } from '../config/search-engines.js';

const NEW_TAB_URLS = new Set(['chrome://newtab/', 'chrome://new-tab-page/', 'about:blank']);
const SCHEME = /^(https?:\/\/|chrome:\/\/|file:\/\/|about:|chrome-extension:\/\/)/i;
const BARE_HOST = /^(localhost(:\d+)?|[\w-]+(\.[\w-]+)+(:\d+)?|\d{1,3}(\.\d{1,3}){3}(:\d+)?)(\/.*)?$/i;
const INSECURE_HOST = /^(localhost|\d)/;
const WEB_URL = /^https?:/;
const SCRIPTABLE_URL = /^(https?|file):/;
const STORE_URL = /^https:\/\/(chromewebstore\.google\.com|chrome\.google\.com\/webstore)/;

export function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

export function isWebUrl(url) {
  return WEB_URL.test(url || '');
}

// Pages a content script can run on.
export function isScriptable(url) {
  return SCRIPTABLE_URL.test(url || '') && !STORE_URL.test(url);
}

export function isNewTabUrl(url) {
  return !url || NEW_TAB_URLS.has(url);
}

export function displayUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    if (!WEB_URL.test(u.protocol)) return url;
    return u.host.replace(/^www\./, '') + (u.pathname === '/' ? '' : u.pathname);
  } catch {
    return url;
  }
}

// Same page ignoring query/hash — detects a pinned tab that navigated away.
export function samePage(a, b) {
  try {
    const x = new URL(a);
    const y = new URL(b);
    return x.origin === y.origin && x.pathname.replace(/\/$/, '') === y.pathname.replace(/\/$/, '');
  } catch {
    return a === b;
  }
}

export function faviconUrl(pageUrl, size = 32) {
  const u = new URL(chrome.runtime.getURL('/_favicon/'));
  u.searchParams.set('pageUrl', pageUrl || 'about:blank');
  u.searchParams.set('size', String(size));
  return u.toString();
}

export function tabIcon(tab, size = 32) {
  const f = tab?.favIconUrl;
  return f && /^(https?:|data:)/.test(f) ? f : faviconUrl(tab?.url || tab?.pendingUrl, size);
}

export function looksLikeUrl(input) {
  const q = input.trim();
  return !!q && !/\s/.test(q) && (SCHEME.test(q) || BARE_HOST.test(q));
}

function engine(settings) {
  if (settings?.searchEngine === CUSTOM_ENGINE && settings.customSearch?.includes(QUERY_TOKEN)) {
    return { name: hostOf(settings.customSearch), url: settings.customSearch };
  }
  return SEARCH_ENGINES[settings?.searchEngine] || SEARCH_ENGINES[DEFAULT_SEARCH_ENGINE];
}

export function searchEngineName(settings) {
  return engine(settings).name;
}

export function searchUrl(query, settings) {
  return engine(settings).url.replace(QUERY_TOKEN, encodeURIComponent(query));
}

export function toUrlOrSearch(input, settings) {
  const q = input.trim();
  if (!looksLikeUrl(q)) return searchUrl(q, settings);
  if (SCHEME.test(q)) return q;
  return (INSECURE_HOST.test(q) ? 'http://' : 'https://') + q;
}

// Air Traffic Control patterns: "github.com" matches the host and its
// subdomains; patterns containing * or / are matched against the full URL.
export function matchPattern(pattern, url) {
  const p = (pattern || '').trim();
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (!p) return false;
  if (!/[*/]/.test(p)) {
    const host = u.host.toLowerCase().replace(/^www\./, '');
    const want = p.toLowerCase().replace(/^www\./, '');
    return host === want || host.endsWith('.' + want);
  }
  const re = new RegExp('^' + p.split('*').map((x) => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*'), 'i');
  return re.test(url) || re.test(url.replace(/^https?:\/\//, ''));
}
