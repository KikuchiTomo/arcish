// Settings page: a navigation rail and one section at a time.
//
// A section is { id, icon, titleKey, noteKey?, fields? , panel? }:
//   fields  simple settings, rendered generically from a schema
//           type: select | segmented | cards | toggle | number | text | password | link
//   panel   (state) => html, for the list editors (spaces, routing, boosts, data)
// To add a setting, add a default in config/defaults.js and one field below.
import { ARCHIVE_OPTIONS, COLOR_SCHEMES, DEFAULT_SETTINGS, PATHS } from '../config/defaults.js';
import { PALETTE, spaceColor } from '../config/colors.js';
import { AUTO_LOCALE, SUPPORTED_LOCALES } from '../config/locales.js';
import { CUSTOM_ENGINE, QUERY_TOKEN, SEARCH_ENGINES } from '../config/search-engines.js';
import { morph } from '../shared/dom/morph.js';
import { formatMinutes, initI18n, t } from '../shared/i18n.js';
import { icon } from '../shared/icons.js';
import { MSG, rpc } from '../shared/messages.js';
import { LOCAL, SPACE_MODE, TAB_AUTHORITY } from '../shared/storage-keys.js';
import { escapeHtml as h, spaceLabel, uid } from '../shared/text.js';

const BACKUP_FILE = 'arcish-backup.json';
const BOOST_PARAM = 'boost';
const app = document.getElementById('app');
let state = {};
let status = '';

const settingsNow = () => ({ ...DEFAULT_SETTINGS, ...state[LOCAL.SETTINGS] });
const spacesNow = () => state[LOCAL.SPACES] || [];
const boostsNow = () => state[LOCAL.BOOSTS] || {};
const option = (value, label, hint = '') => ({ value, label, hint });
const keyed = (prefix, values) => values.map((v) => option(v, t(`${prefix}_${v}`)));

// ---------------------------------------------------------------- list panels
function spacesPanel() {
  const rows = spacesNow().map(
    (space) => `<div class="item" data-key="${space.id}" data-space="${space.id}">
      <label class="color-dot" style="background:${spaceColor(space)}" title="${h(t('color'))}"><input type="color" data-space-field="color" value="${spaceColor(space)}" list="palette"></label>
      <input type="text" class="emoji" data-space-field="emoji" value="${h(space.emoji || '')}" maxlength="4" placeholder="🙂" title="${h(t('spaceChangeIcon'))}">
      <input type="text" class="grow" data-space-field="name" value="${h(space.name)}">
      <button class="btn ghost danger" data-space-remove ${spacesNow().length > 1 ? '' : 'disabled'} title="${h(t('delete'))}">${icon('trash', 15)}</button>
    </div>`,
  );
  return `<div class="list">${rows.join('')}</div>
    <datalist id="palette">${PALETTE.map((p) => `<option value="${p.color}">${h(t(p.nameKey))}</option>`).join('')}</datalist>
    <div class="toolbar"><button class="btn" data-space-add>${icon('plus', 15)} ${h(t('spaceNew'))}</button></div>`;
}

function routingPanel() {
  const spaceOptions = (selected) => spacesNow().map((s) => `<option value="${s.id}" ${s.id === selected ? 'selected' : ''}>${h(spaceLabel(s))}</option>`).join('');
  const rules = settingsNow().atcRules.map(
    (rule) => `<div class="item" data-key="${rule.id}" data-rule="${rule.id}">
      <input type="text" class="grow" data-rule-pattern value="${h(rule.pattern)}" placeholder="github.com">
      ${icon('forward', 15)}
      <select data-rule-space>${spaceOptions(rule.spaceId)}</select>
      <button class="btn ghost danger" data-rule-remove title="${h(t('delete'))}">${icon('trash', 15)}</button>
    </div>`,
  );
  return `<div class="list">${rules.join('') || `<div class="empty">${h(t('optRoutingEmpty'))}</div>`}</div>
    <div class="toolbar"><button class="btn" data-rule-add>${icon('plus', 15)} ${h(t('optRoutingAdd'))}</button></div>`;
}

function boostsPanel() {
  const cards = Object.entries(boostsNow()).map(
    ([host, boost]) => `<div class="boost" data-key="boost-${h(host)}" data-boost="${h(host)}">
      <div class="boost-head"><span class="host">${h(host)}</span>
        <input type="checkbox" class="switch" data-boost-enabled ${boost.enabled !== false ? 'checked' : ''}>
        <button class="btn ghost danger" data-boost-remove title="${h(t('delete'))}">${icon('trash', 15)}</button></div>
      <textarea data-boost-css spellcheck="false" placeholder="body { font-family: Georgia; }">${h(boost.css || '')}</textarea>
      <div class="zaps">${(boost.zaps || []).map((z, i) => `<span class="zap">${h(z)}<button data-zap-remove="${i}">×</button></span>`).join('')}</div>
    </div>`,
  );
  return `${cards.join('') || `<div class="empty">${h(t('optBoostsEmpty'))}</div>`}
    <div class="toolbar"><input type="text" class="grow" data-boost-host placeholder="example.com"><button class="btn" data-boost-add>${icon('plus', 15)} ${h(t('optBoostsAdd'))}</button></div>`;
}

function dataPanel() {
  return `<div class="field"><div class="label"><div>${h(t('optBackup'))}</div><div class="hint">${h(t('optBackupHint'))}</div></div>
      <div class="buttons"><button class="btn" data-export>${h(t('optExport'))}</button><button class="btn" data-import>${h(t('optImport'))}</button></div></div>
    <div class="field"><div class="label"><div>${h(t('shortcuts'))}</div><div class="hint">${h(t('optShortcutsHint'))}</div></div>
      <button class="btn" data-open-url="${h(PATHS.shortcuts)}">${h(t('optOpenChromeSettings'))}</button></div>
    ${status ? `<div class="status">${h(status)}</div>` : ''}
    <input type="file" accept="application/json" data-import-file hidden>`;
}

// ---------------------------------------------------------------- sections
const SECTIONS = () => [
  {
    id: 'general',
    icon: 'settings',
    titleKey: 'optGeneral',
    fields: [
      { key: 'language', type: 'select', labelKey: 'optLanguage', options: [option(AUTO_LOCALE, t('optLanguageAuto')), ...SUPPORTED_LOCALES.map((l) => option(l.code, l.label))] },
      { key: 'colorScheme', type: 'segmented', labelKey: 'optColorScheme', options: keyed('optScheme', COLOR_SCHEMES) },
      { key: 'searchEngine', type: 'select', labelKey: 'optSearchEngine', options: [...Object.entries(SEARCH_ENGINES).map(([id, e]) => option(id, e.name)), option(CUSTOM_ENGINE, t('optSearchCustom'))] },
      { key: 'customSearch', type: 'text', labelKey: 'optCustomSearch', hint: t('optCustomSearchHint', QUERY_TOKEN), showIf: (s) => s.searchEngine === CUSTOM_ENGINE },
      { key: 'newTabsOnTop', type: 'toggle', labelKey: 'optNewTabsOnTop' },
      { key: 'sidebarPosition', type: 'link', labelKey: 'optSidebarPosition', hintKey: 'optSidebarPositionHint', buttonKey: 'optOpenChromeSettings', url: PATHS.appearance },
    ],
  },
  { id: 'spaces', icon: 'layers', titleKey: 'paletteSpaces', noteKey: 'optSpacesNote', panel: spacesPanel },
  {
    id: 'chrome',
    icon: 'window',
    titleKey: 'optChrome',
    noteKey: 'optChromeNote',
    fields: [
      {
        key: 'spaceMode',
        type: 'cards',
        labelKey: 'optSpaceMode',
        options: Object.values(SPACE_MODE).map((mode) => option(mode, t(`optSpaceMode_${mode}`), t(`optSpaceModeHint_${mode}`))),
      },
      {
        key: 'tabAuthority',
        type: 'cards',
        labelKey: 'optTabAuthority',
        hintKey: 'optTabAuthorityHint',
        options: Object.values(TAB_AUTHORITY).map((mode) => option(mode, t(`optTabAuthority_${mode}`), t(`optTabAuthorityHint_${mode}`))),
      },
      { key: 'archiveAfter', type: 'select', numeric: true, labelKey: 'optArchiveAfter', hintKey: 'optArchiveAfterHint', options: ARCHIVE_OPTIONS.map((m) => option(m, m ? formatMinutes(m) : t('optNever'))) },
      { key: 'peekShiftClick', type: 'toggle', labelKey: 'optPeek', hintKey: 'optPeekHint' },
    ],
  },
  {
    id: 'windows',
    icon: 'mini',
    titleKey: 'optWindows',
    fields: [
      { key: 'miniWidth', type: 'number', labelKey: 'optMiniWidth', min: 320 },
      { key: 'miniHeight', type: 'number', labelKey: 'optMiniHeight', min: 320 },
    ],
  },
  {
    id: 'live',
    icon: 'live',
    titleKey: 'optLive',
    fields: [
      { key: 'liveRefreshMinutes', type: 'number', labelKey: 'optLiveRefresh', min: 5 },
      { key: 'githubToken', type: 'password', labelKey: 'optGithubToken', hintKey: 'optGithubTokenHint' },
    ],
  },
  { id: 'routing', icon: 'forward', titleKey: 'optRouting', noteKey: 'optRoutingNote', panel: routingPanel },
  { id: 'boosts', icon: 'zap', titleKey: 'optBoosts', noteKey: 'optBoostsNote', panel: boostsPanel },
  { id: 'data', icon: 'archive', titleKey: 'optData', panel: dataPanel },
];

const radios = (f, value, cls, body) =>
  `<div class="${cls}" role="radiogroup">${f.options.map((o) => `<label class="${String(o.value) === String(value) ? 'on' : ''}"><input type="radio" name="${f.key}" data-setting="${f.key}" value="${h(o.value)}" ${String(o.value) === String(value) ? 'checked' : ''}>${body(o)}</label>`).join('')}</div>`;

const CONTROLS = {
  select: (f, value) => `<select data-setting="${f.key}" ${f.numeric ? 'data-numeric' : ''}>${f.options.map((o) => `<option value="${h(o.value)}" ${String(o.value) === String(value) ? 'selected' : ''}>${h(o.label)}</option>`).join('')}</select>`,
  segmented: (f, value) => radios(f, value, 'segmented', (o) => `<span>${h(o.label)}</span>`),
  cards: (f, value) => radios(f, value, 'cards', (o) => `<span class="card-title">${h(o.label)}</span><span class="card-hint">${h(o.hint)}</span>`),
  toggle: (f, value) => `<input type="checkbox" class="switch" data-setting="${f.key}" ${value ? 'checked' : ''}>`,
  number: (f, value) => `<input type="number" data-setting="${f.key}" data-numeric value="${h(value)}" min="${f.min ?? 0}">`,
  text: (f, value) => `<input type="text" data-setting="${f.key}" value="${h(value)}">`,
  password: (f, value) => `<input type="password" data-setting="${f.key}" value="${h(value)}" autocomplete="off">`,
  link: (f) => `<button class="btn" data-open-url="${h(f.url)}">${h(t(f.buttonKey))}</button>`,
};

// Controls that need the full width sit under their label instead of beside it.
const STACKED = new Set(['cards']);

function fieldHtml(f, settings) {
  const hint = f.hint || (f.hintKey ? t(f.hintKey) : '');
  return `<div class="field ${STACKED.has(f.type) ? 'stacked' : ''}" data-key="${f.key}">
    <div class="label"><div>${h(t(f.labelKey))}</div>${hint ? `<div class="hint">${h(hint)}</div>` : ''}</div>${CONTROLS[f.type](f, settings[f.key])}
  </div>`;
}

function currentSectionId(sections) {
  const hash = location.hash.slice(1);
  if (new URLSearchParams(hash).has(BOOST_PARAM)) return 'boosts';
  return sections.some((s) => s.id === hash) ? hash : sections[0].id;
}

function render() {
  const settings = settingsNow();
  const sections = SECTIONS();
  const active = sections.find((s) => s.id === currentSectionId(sections));
  document.documentElement.dataset.scheme = settings.colorScheme;
  document.title = t('optTitle');
  const nav = sections.map((s) => `<a class="${s === active ? 'on' : ''}" href="#${s.id}" data-key="${s.id}">${icon(s.icon, 16)}<span>${h(t(s.titleKey))}</span></a>`);
  const body = active.panel ? active.panel() : active.fields.filter((f) => !f.showIf || f.showIf(settings)).map((f) => fieldHtml(f, settings)).join('');
  morph(
    app,
    `<aside class="nav" data-key="nav">
      <div class="brand"><img src="${chrome.runtime.getURL('icons/icon48.png')}" alt=""><span>Arcish</span></div>
      ${nav.join('')}
    </aside>
    <section class="page" data-key="page-${active.id}">
      <h1>${h(t(active.titleKey))}</h1>
      <p class="lead">${h(t(active.noteKey || 'optLead'))}</p>
      <div class="card">${body}</div>
    </section>`,
  );
}

// ---------------------------------------------------------------- events
const saveSettings = (patch) => rpc(MSG.SETTINGS_UPDATE, { patch });
const saveRules = (rules) => saveSettings({ atcRules: rules });

function readControl(el) {
  if (el.type === 'checkbox') return el.checked;
  return 'numeric' in el.dataset ? Number(el.value) : el.value;
}

app.addEventListener('change', async (e) => {
  const el = e.target;
  if (el.dataset.setting) return saveSettings({ [el.dataset.setting]: readControl(el) });
  const spaceEl = el.closest('[data-space]');
  if (spaceEl && el.dataset.spaceField) return rpc(MSG.SPACE_UPDATE, { id: spaceEl.dataset.space, patch: { [el.dataset.spaceField]: el.value } });
  const ruleEl = el.closest('[data-rule]');
  if (ruleEl) {
    const edited = { pattern: ruleEl.querySelector('[data-rule-pattern]').value.trim(), spaceId: ruleEl.querySelector('[data-rule-space]').value };
    return saveRules(settingsNow().atcRules.map((r) => (r.id === ruleEl.dataset.rule ? { ...r, ...edited } : r)));
  }
  const boostEl = el.closest('[data-boost]');
  if (boostEl) {
    return rpc(MSG.BOOST_SAVE, { host: boostEl.dataset.boost, boost: { enabled: boostEl.querySelector('[data-boost-enabled]').checked, css: boostEl.querySelector('[data-boost-css]').value } });
  }
  if ('importFile' in el.dataset && el.files[0]) {
    try {
      await rpc(MSG.BACKUP_IMPORT, { data: JSON.parse(await el.files[0].text()) });
      status = t('optImported');
    } catch (err) {
      status = String(err.message || err);
    }
    render();
  }
  return null;
});

// data attribute on the clicked button -> handler(button)
const CLICKS = {
  spaceAdd: () => rpc(MSG.SPACE_CREATE),
  spaceRemove: (el) => rpc(MSG.SPACE_DELETE, { id: el.closest('[data-space]').dataset.space }),
  ruleAdd: () => spacesNow()[0] && saveRules([...settingsNow().atcRules, { id: uid(), pattern: '', spaceId: spacesNow()[0].id }]),
  ruleRemove: (el) => saveRules(settingsNow().atcRules.filter((r) => r.id !== el.closest('[data-rule]').dataset.rule)),
  boostAdd: () => {
    const host = app.querySelector('[data-boost-host]').value.trim();
    return host && rpc(MSG.BOOST_SAVE, { host, boost: {} });
  },
  boostRemove: (el) => rpc(MSG.BOOST_DELETE, { host: el.closest('[data-boost]').dataset.boost }),
  zapRemove: (el) => {
    const host = el.closest('[data-boost]').dataset.boost;
    return rpc(MSG.BOOST_SAVE, { host, boost: { zaps: (boostsNow()[host].zaps || []).filter((_, i) => i !== Number(el.dataset.zapRemove)) } });
  },
  export: async () => {
    const blob = new Blob([JSON.stringify(await rpc(MSG.BACKUP_EXPORT), null, 2)], { type: 'application/json' });
    const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: BACKUP_FILE });
    link.click();
    URL.revokeObjectURL(link.href);
  },
  import: () => app.querySelector('[data-import-file]').click(),
  openUrl: (el) => chrome.tabs.create({ url: el.dataset.openUrl }),
};

app.addEventListener('click', (e) => {
  const button = e.target.closest('button');
  if (!button) return;
  const name = Object.keys(CLICKS).find((key) => key in button.dataset);
  if (name) Promise.resolve(CLICKS[name](button)).catch((err) => console.error('[arcish]', err));
});

window.addEventListener('hashchange', render);

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local') return;
  const previous = settingsNow().language;
  for (const [key, { newValue }] of Object.entries(changes)) state[key] = newValue;
  if (settingsNow().language !== previous) await initI18n(settingsNow().language);
  render();
});

// "#boost=<host>" (from the command bar or the Library) creates the boost and focuses it.
async function openRequestedBoost() {
  const host = new URLSearchParams(location.hash.slice(1)).get(BOOST_PARAM);
  if (!host) return;
  if (!boostsNow()[host]) await rpc(MSG.BOOST_SAVE, { host, boost: {} });
  requestAnimationFrame(() => app.querySelector(`[data-boost="${CSS.escape(host)}"] textarea`)?.focus());
}

state = await chrome.storage.local.get([LOCAL.SETTINGS, LOCAL.SPACES, LOCAL.BOOSTS]);
await initI18n();
render();
await openRequestedBoost();
