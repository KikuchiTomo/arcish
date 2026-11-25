// Library: a rail of sections (archived tabs, downloads, spaces, boosts) and a
// searchable list of two-line rows grouped by day.
//
// A section is { id, icon, titleKey, searchKey?, headerAction?, rows(model, query), emptyKey, footer?(model) }
// and a row is  { key, attrs, iconHtml, title, subtitle, at?, action? }.
// To add a section, append one to LIBRARY_SECTIONS.
import { ARCHIVE_OPTIONS } from '../config/defaults.js';
import { spaceColor } from '../config/colors.js';
import { formatBytes, formatMinutes, relativeDay, t } from '../shared/i18n.js';
import { icon } from '../shared/icons.js';
import { escapeHtml as h } from '../shared/text.js';
import { collect } from '../shared/tree.js';
import { faviconUrl, hostOf } from '../shared/url.js';
import { NODE, SIDEBAR_VIEW } from '../shared/storage-keys.js';
import { LIBRARY_SECTION } from './library-sections.js';
import { ACT } from './ui-state.js';

const img = (src) => `<img class="fi" src="${h(src)}" alt="">`;
const glyph = (name) => `<span class="glyph">${icon(name, 18)}</span>`;
const matches = (query, ...fields) => !query || fields.join(' ').toLowerCase().includes(query);
const baseName = (path) => path.split(/[\\/]/).pop();

const archive = {
  id: LIBRARY_SECTION.ARCHIVE,
  icon: 'archive',
  titleKey: 'libraryArchived',
  searchKey: 'archiveSearch',
  emptyKey: 'archiveEmpty',
  headerAction: (model) => (model.archiveSize ? { act: ACT.ARCHIVE_CLEAR, icon: 'trash', titleKey: 'archiveClearAll' } : null),
  rows: (model, query) =>
    model.archive(query).map((entry) => ({
      key: entry.id,
      attrs: `data-archive="${entry.id}"`,
      iconHtml: img(entry.favIconUrl || faviconUrl(entry.url)),
      title: entry.title,
      subtitle: hostOf(entry.url),
      at: entry.archivedAt,
      action: { act: ACT.ARCHIVE_DELETE, icon: 'x', titleKey: 'delete' },
    })),
  footer(model) {
    const after = model.settings.archiveAfter;
    const policy = ARCHIVE_OPTIONS.includes(after) && after ? t('archivePolicy', formatMinutes(after)) : t('archivePolicyOff');
    return `${h(policy)} · <a data-act="${ACT.SETTINGS}">${h(t('change'))}</a>`;
  },
};

const downloads = {
  id: LIBRARY_SECTION.DOWNLOADS,
  icon: 'download',
  titleKey: 'libraryDownloads',
  searchKey: 'librarySearchDownloads',
  emptyKey: 'libraryDownloadsEmpty',
  rows: (model, query) =>
    model.downloads
      .filter((d) => d.filename && matches(query, d.filename, d.url))
      .map((d) => ({
        key: `download-${d.id}`,
        attrs: `data-download="${d.id}"`,
        iconHtml: model.fileIcons.get(d.id) ? img(model.fileIcons.get(d.id)) : glyph('note'),
        title: baseName(d.filename),
        subtitle: [hostOf(d.finalUrl || d.url), d.fileSize > 0 && formatBytes(d.fileSize), !d.exists && t('libraryDownloadMissing')].filter(Boolean).join(' · '),
        at: Date.parse(d.startTime) || null,
      })),
};

const spaces = {
  id: LIBRARY_SECTION.SPACES,
  icon: 'layers',
  titleKey: 'paletteSpaces',
  emptyKey: 'loading',
  rows: (model, query) =>
    model.spaces
      .filter((s) => matches(query, s.name))
      .map((space) => {
        const pinned = collect(space.pinned, (n) => n.type === NODE.LINK).length;
        const tabs = model.tabs.filter((tab) => model.spaceOfTab(tab) === space.id).length;
        return {
          key: `space-${space.id}`,
          attrs: `data-library-space="${space.id}"`,
          iconHtml: `<span class="space-chip" style="background:${spaceColor(space)}">${h(space.emoji || '')}</span>`,
          title: space.name,
          subtitle: t('librarySpaceSummary', pinned, tabs),
        };
      }),
};

const boosts = {
  id: LIBRARY_SECTION.BOOSTS,
  icon: 'zap',
  titleKey: 'optBoosts',
  emptyKey: 'optBoostsEmpty',
  rows: (model, query) =>
    Object.entries(model.boosts)
      .filter(([host]) => matches(query, host))
      .map(([host, boost]) => ({
        key: `boost-${host}`,
        attrs: `data-boost="${h(host)}"`,
        iconHtml: img(faviconUrl(`https://${host}/`)),
        title: host,
        subtitle: [boost.css?.trim() && 'CSS', boost.zaps?.length && t('libraryZaps', boost.zaps.length), boost.enabled === false && t('libraryBoostOff')].filter(Boolean).join(' · '),
      })),
};

export const LIBRARY_SECTIONS = Object.freeze([archive, downloads, spaces, boosts]);

const actionButton = ({ act, icon: name, titleKey }, cls = 'act') => `<button class="${cls}" data-act="${act}" title="${h(t(titleKey))}">${icon(name, 14)}</button>`;

function rowHtml(row) {
  return `<div class="row lib-row" data-key="${h(row.key)}" ${row.attrs} title="${h(row.title)}">
    ${row.iconHtml}
    <span class="title"><span class="line">${h(row.title)}</span>${row.subtitle ? `<span class="sub">${h(row.subtitle)}</span>` : ''}</span>
    <span class="acts">${row.action ? actionButton(row.action) : ''}</span>
  </div>`;
}

export function libraryPane(model, ui) {
  const section = LIBRARY_SECTIONS.find((s) => s.id === ui.librarySection) || LIBRARY_SECTIONS[0];
  const rows = section.rows(model, ui.libraryQuery.trim().toLowerCase());
  let lastDay = null;
  const list = rows.map((row) => {
    const day = row.at ? relativeDay(row.at) : null;
    const heading = day && day !== lastDay ? `<div class="lib-day" data-key="day-${h(day)}">${h(day)}</div>` : '';
    lastDay = day;
    return heading + rowHtml(row);
  });
  const rail = LIBRARY_SECTIONS.map(
    (s) => `<button class="${s === section ? 'on' : ''}" data-key="${s.id}" data-act="${ACT.LIBRARY_SECTION}" data-section="${s.id}">${icon(s.icon, 18)}<span>${h(t(s.titleKey))}</span></button>`,
  );
  const headerAction = section.headerAction?.(model);
  return `<div class="pane library" data-key="${SIDEBAR_VIEW.LIBRARY}">
    <nav class="lib-rail">
      <button data-key="back" data-act="${ACT.LIBRARY_TOGGLE}" title="${h(t('back'))}">${icon('back', 18)}</button>
      ${rail.join('')}
    </nav>
    <div class="lib-main">
      <div class="lib-head">
        <input class="search" data-key="search" data-library-search placeholder="${h(t(section.searchKey || 'search'))}" value="${h(ui.libraryQuery)}">
        ${headerAction ? actionButton(headerAction, 'icon-btn') : ''}
      </div>
      <div class="lib-list" data-key="list-${section.id}">${list.join('') || `<div class="hint empty">${h(t(section.emptyKey))}</div>`}</div>
      ${section.footer ? `<div class="hint">${section.footer(model)}</div>` : ''}
    </div>
  </div>`;
}
