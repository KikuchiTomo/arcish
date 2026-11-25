// Command bar: builds the context, runs providers and renders results.
import { DEFAULT_SETTINGS } from '../config/defaults.js';
import { spaceColor } from '../config/colors.js';
import { morph } from '../shared/dom/morph.js';
import { initI18n, localizeDom, t } from '../shared/i18n.js';
import { icon } from '../shared/icons.js';
import { windowSpaceId } from '../shared/membership.js';
import { MSG, OPEN_WHERE, PALETTE_MODE, rpc } from '../shared/messages.js';
import { LOCAL, SESSION } from '../shared/storage-keys.js';
import { escapeHtml as h } from '../shared/text.js';
import { isNewTabUrl } from '../shared/url.js';
import { resolveHost } from './hosts.js';
import { PROVIDERS } from './providers.js';

const params = new URLSearchParams(location.search);
const input = document.getElementById('q');
const resultsEl = document.getElementById('results');
const host = resolveHost(params);
document.body.dataset.host = host.kind;
host.ready(); // tell the embedding page the frame loaded (it falls back to a window otherwise)

await initI18n();
localizeDom();

const [local, session, tab] = await Promise.all([chrome.storage.local.get(Object.values(LOCAL)), chrome.storage.session.get(Object.values(SESSION)), host.tab(params)]);
const settings = { ...DEFAULT_SETTINGS, ...local[LOCAL.SETTINGS] };
const windowId = tab?.windowId ?? (Number(params.get('windowId')) || null);
const spaces = local[LOCAL.SPACES] || [];
const spaceId = windowSpaceId(windowId, session, local, spaces);
const mode = params.get('mode') === PALETTE_MODE.CURRENT && tab ? PALETTE_MODE.CURRENT : PALETTE_MODE.NEW;

const ctx = {
  host,
  tab,
  windowId,
  settings,
  local,
  spaceId,
  // Open a URL honouring modifiers: alt = Little Window, shift = split view,
  // meta/ctrl = main window (from a Little Window).
  open(url, mods = {}) {
    if (mods.meta && host.promote) return host.promote(url);
    if (mods.alt) return rpc(MSG.TAB_OPEN, { url, where: OPEN_WHERE.MINI });
    if (mods.shift && tab) return rpc(MSG.TAB_OPEN, { url, where: OPEN_WHERE.SPLIT, tabId: tab.id });
    if (host.navigate) return host.navigate(url);
    if (mode === PALETTE_MODE.CURRENT) return rpc(MSG.TAB_OPEN, { url, where: OPEN_WHERE.CURRENT, tabId: tab.id });
    return rpc(MSG.TAB_OPEN, { url, windowId });
  },
};

// ---- colour ----
document.documentElement.style.setProperty('--space', spaceColor(spaces.find((s) => s.id === spaceId)));
document.documentElement.dataset.scheme = settings.colorScheme;
document.getElementById('lead').innerHTML = icon(mode === PALETTE_MODE.CURRENT ? 'globe' : 'search', 18);
input.placeholder ||= t(mode === PALETTE_MODE.CURRENT ? 'palettePlaceholderCurrent' : 'palettePlaceholder');

// ---- results ----
let sections = []; // one entry per provider: Item[]
let flat = []; // items in display order
let selected = 0;
let generation = 0;

function render() {
  flat = sections.flat();
  selected = Math.min(selected, Math.max(0, flat.length - 1));
  let index = 0;
  const html = PROVIDERS.map((provider, p) => {
    const items = sections[p] || [];
    if (!items.length) return '';
    const heading = provider.titleKey ? `<div class="sec" data-key="sec-${provider.id}">${h(t(provider.titleKey))}</div>` : '';
    const rows = items.map((item) => {
      const i = index++;
      const glyph = item.iconUrl ? `<img src="${h(item.iconUrl)}" alt="">` : icon(item.icon || 'globe', 16);
      return `<button class="item ${i === selected ? 'sel' : ''}" data-key="${h(item.id)}" data-i="${i}">
        <span class="ico">${glyph}</span>
        <span class="txt"><span class="t">${h(item.title)}</span>${item.subtitle ? `<span class="s">${h(item.subtitle)}</span>` : ''}</span>
        ${item.tag ? `<span class="tag">${h(item.tag)}</span>` : ''}
      </button>`;
    });
    return heading + rows.join('');
  }).join('');
  morph(resultsEl, html);
  resultsEl.querySelector('.sel')?.scrollIntoView({ block: 'nearest' });
}

// Providers resolve independently; results from an outdated query are dropped.
function search(query) {
  const mine = ++generation;
  selected = 0;
  PROVIDERS.forEach((provider, p) => {
    provider
      .search(query, ctx)
      .catch(() => [])
      .then((items) => {
        if (mine !== generation) return;
        sections[p] = items;
        render();
      });
  });
}

async function run(item, mods) {
  if (!item) return;
  try {
    await item.run(mods);
  } catch (e) {
    host.toast(String(e.message || e), tab);
  }
  host.close();
}

const modsOf = (e) => ({ shift: e.shiftKey, alt: e.altKey, meta: e.metaKey || e.ctrlKey });

input.addEventListener('input', () => search(input.value.trim()));
input.addEventListener('keydown', (e) => {
  const step = { ArrowDown: 1, ArrowUp: -1 }[e.key] ?? (e.ctrlKey && { n: 1, p: -1 }[e.key]);
  if (step) {
    e.preventDefault();
    selected = (selected + step + flat.length) % Math.max(1, flat.length);
    return render();
  }
  if (e.key === 'Enter' && !e.isComposing) {
    e.preventDefault();
    return run(flat[selected], modsOf(e));
  }
  if (e.key === 'Escape') host.close();
  return null;
});
resultsEl.addEventListener('click', (e) => {
  const el = e.target.closest('[data-i]');
  if (el) run(flat[Number(el.dataset.i)], modsOf(e));
});
resultsEl.addEventListener('mousemove', (e) => {
  const el = e.target.closest('[data-i]');
  if (!el || Number(el.dataset.i) === selected) return;
  selected = Number(el.dataset.i);
  render();
});
document.querySelector('.backdrop').addEventListener('click', () => host.close());
if (host.closeOnBlur) window.addEventListener('blur', () => host.close());

if (mode === PALETTE_MODE.CURRENT && !isNewTabUrl(tab.url)) {
  input.value = tab.url;
  input.select();
}
search(input.value.trim());
input.focus();
