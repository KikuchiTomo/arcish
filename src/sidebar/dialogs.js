// Dialog definitions. Forms are generated from data (themes, live source
// field schemas), so adding a colour or a source needs no changes here.
import { EMOJI_SUGGESTIONS } from '../config/defaults.js';
import { FOLDER_MARKS, MARK_MAX_CHARS } from '../config/folder-icons.js';
import { PALETTE, spaceColor } from '../config/colors.js';
import { DEFAULT_LIVE_SOURCE, LIVE_SOURCES, liveSource } from '../live-sources/index.js';
import { t } from '../shared/i18n.js';
import { folderIcon, hasIcon } from '../shared/icons.js';
import { MSG } from '../shared/messages.js';
import { escapeHtml as h } from '../shared/text.js';

const actions = (submitKey, { danger = false, extra = '' } = {}) => `<div class="actions">${extra}<span class="grow"></span>
  <button type="button" class="btn" data-cancel>${h(t('cancel'))}</button>
  <button type="submit" class="btn primary ${danger ? 'destructive' : ''}">${h(t(submitKey))}</button></div>`;

export function confirmDialog(overlay, { title, note, submitKey, onConfirm }) {
  overlay.dialog(`<h3>${h(title)}</h3><div class="note">${h(note)}</div>${actions(submitKey, { danger: true })}`, { onSubmit: onConfirm });
}

// ---- space: colour, icon, name ----
const swatchesHtml = (color) => `<div class="swatches">
    ${PALETTE.map((p) => `<button type="button" class="swatch ${p.color === color ? 'on' : ''}" data-color="${p.color}" title="${h(t(p.nameKey))}" style="background:${p.color}"></button>`).join('')}
    <label class="swatch custom ${PALETTE.some((p) => p.color === color) ? '' : 'on'}" title="${h(t('colorCustom'))}" style="--picked:${color}"><input type="color" name="color" value="${color}"></label>
  </div>`;

// Wires the swatches of `swatchesHtml`; `onPick(color)` fires on every change.
function bindSwatches(form, onPick) {
  const custom = form.querySelector('.swatch.custom');
  const pick = (value, swatch) => {
    for (const el of form.querySelectorAll('.swatch')) el.classList.toggle('on', el === swatch);
    custom.style.setProperty('--picked', value);
    onPick(value);
  };
  form.addEventListener('click', (e) => {
    const swatch = e.target.closest('[data-color]');
    if (!swatch) return;
    form.color.value = swatch.dataset.color;
    pick(swatch.dataset.color, swatch);
  });
  form.color.addEventListener('input', () => pick(form.color.value, custom));
}

const emojiGridHtml = () => `<div class="emojis">${EMOJI_SUGGESTIONS.map((e) => `<button type="button" data-emoji="${e}">${e}</button>`).join('')}</div>`;

export function newSpaceDialog({ overlay, model, act, applyColor }) {
  const html = `<h3>${h(t('spaceNew'))}</h3>
    <label>${h(t('name'))}</label>
    <div class="row2"><input type="text" class="emoji-in" name="emoji" maxlength="4"><input type="text" name="name" autofocus></div>
    ${emojiGridHtml()}
    <label>${h(t('color'))}</label>${swatchesHtml(PALETTE[model.spaces.length % PALETTE.length].color)}
    ${actions('create')}`;
  overlay.dialog(html, {
    onMount(form) {
      bindSwatches(form, applyColor); // live preview
      form.addEventListener('click', (e) => {
        const emoji = e.target.closest('[data-emoji]');
        if (emoji) form.emoji.value = emoji.dataset.emoji;
      });
    },
    onSubmit: ({ name, emoji, color }) => act(MSG.SPACE_CREATE, { name, emoji, color }),
  });
}

export function spaceColorDialog({ overlay, act, applyColor }, space) {
  overlay.dialog(`<h3>${h(t('spaceEditColor'))}</h3>${swatchesHtml(spaceColor(space))}${actions('save')}`, {
    onMount: (form) => bindSwatches(form, applyColor), // live preview; closing without saving re-renders the real colour
    onSubmit: ({ color }) => act(MSG.SPACE_UPDATE, { id: space.id, patch: { color } }),
  });
}

export function spaceIconDialog({ overlay, act }, space) {
  const save = (emoji) => act(MSG.SPACE_UPDATE, { id: space.id, patch: { emoji } });
  const html = `<h3>${h(t('spaceChangeIcon'))}</h3>${emojiGridHtml()}
    <label>${h(t('folderIconCustom'))}</label><input type="text" name="emoji" value="${h(space.emoji || '')}" maxlength="4" autofocus>
    ${actions('save')}`;
  overlay.dialog(html, {
    onMount(form, close) {
      form.addEventListener('click', (e) => {
        const emoji = e.target.closest('[data-emoji]');
        if (!emoji) return;
        close();
        save(emoji.dataset.emoji).catch(() => {});
      });
    },
    onSubmit: ({ emoji }) => save(emoji),
  });
}

export function spaceNameDialog({ overlay, act }, space) {
  overlay.dialog(`<h3>${h(t('spaceRename'))}</h3><input type="text" name="name" value="${h(space.name)}" autofocus>${actions('save')}`, {
    onSubmit: ({ name }) => act(MSG.SPACE_UPDATE, { id: space.id, patch: { name } }),
  });
}

export function deleteSpaceDialog({ overlay, act }, space) {
  confirmDialog(overlay, {
    title: t('spaceDeleteTitle', space.name),
    note: t('spaceDeleteNote'),
    submitKey: 'delete',
    onConfirm: () => act(MSG.SPACE_DELETE, { id: space.id }),
  });
}

// Pick the mark on a folder's icon: a built-in glyph, an emoji / short text, or none.
export function folderIconDialog({ overlay, act }, node) {
  const current = node.icon || '';
  const choice = (mark) => `<button type="button" class="mark-choice ${mark === current ? 'on' : ''}" data-mark="${h(mark)}">${folderIcon({ mark, size: 26 })}</button>`;
  const html = `<h3>${h(t('folderChangeIcon'))}</h3>
    <div class="mark-grid">${['', ...FOLDER_MARKS].map(choice).join('')}</div>
    <label>${h(t('folderIconCustom'))}</label>
    <input type="text" name="mark" maxlength="${MARK_MAX_CHARS * 2}" value="${h(hasIcon(current) ? '' : current)}" placeholder="🙂">
    ${actions('save')}`;
  const apply = (icon) => act(MSG.NODE_SET_ICON, { nodeId: node.id, icon });
  overlay.dialog(html, {
    onMount(form, close) {
      form.addEventListener('click', (e) => {
        const picked = e.target.closest('[data-mark]');
        if (!picked) return;
        close();
        apply(picked.dataset.mark).catch(() => {});
      });
    },
    onSubmit: ({ mark }) => apply(mark.trim() || current),
  });
}

function fieldHtml(field, value) {
  const current = value ?? field.defaultValue ?? '';
  const label = `<label>${h(t(field.labelKey))}</label>`;
  if (field.type === 'select') {
    const options = field.options.map((o) => `<option value="${h(o.value)}" ${o.value === current ? 'selected' : ''}>${h(t(o.labelKey))}</option>`);
    return `${label}<select name="${field.name}">${options.join('')}</select>`;
  }
  const presets = field.presets ? `<div class="presets">${field.presets.map((p) => `<button type="button" data-preset="${field.name}" data-value="${h(p.value)}">${h(t(p.labelKey))}</button>`).join('')}</div>` : '';
  return `${label}<input type="${field.type}" name="${field.name}" value="${h(current)}" placeholder="${h(field.placeholder || '')}" ${field.required ? 'required' : ''}>${presets}`;
}

function sourceFields(source, values = {}) {
  return source.fields.map((f) => fieldHtml(f, values[f.name])).join('') + (source.hintKey ? `<div class="note">${h(t(source.hintKey))}</div>` : '');
}

// `preset` preselects a source and `parentId` places a new folder inside another one.
export function liveFolderDialog({ overlay, model, act, ui, rerender }, folder = null, { preset = null, parentId = null } = {}) {
  let source = liveSource(folder?.source?.kind) || preset || DEFAULT_LIVE_SOURCE;
  const html = `<h3>${h(t(folder ? 'liveEdit' : 'liveNew'))}</h3>
    <div class="seg">${LIVE_SOURCES.map((s) => `<button type="button" class="${s === source ? 'on' : ''}" data-kind="${s.kind}">${h(t(s.nameKey))}</button>`).join('')}</div>
    <div class="fields">${sourceFields(source, folder?.source)}</div>
    <label>${h(t('liveNameOptional'))}</label><input type="text" name="title" value="${h(folder?.title || '')}">
    ${actions(folder ? 'save' : 'create')}`;
  overlay.dialog(html, {
    onMount(form) {
      form.addEventListener('click', (e) => {
        const kind = e.target.closest('[data-kind]');
        if (kind) {
          source = liveSource(kind.dataset.kind);
          for (const el of form.querySelectorAll('[data-kind]')) el.classList.toggle('on', el === kind);
          form.querySelector('.fields').innerHTML = sourceFields(source);
          form.querySelector('.fields input, .fields select')?.focus();
        }
        const preset = e.target.closest('[data-preset]');
        if (preset) form.elements[preset.dataset.preset].value = preset.dataset.value;
      });
    },
    async onSubmit(data) {
      const definition = { kind: source.kind };
      for (const field of source.fields) definition[field.name] = (data[field.name] || '').trim();
      const title = data.title.trim() || source.defaultTitle(definition, t);
      if (!folder) return act(MSG.LIVE_CREATE, { spaceId: model.spaceId, parentId, title, source: definition });
      ui.busyFolders.add(folder.id);
      rerender();
      try {
        await act(MSG.LIVE_UPDATE, { folderId: folder.id, title, source: definition });
      } finally {
        ui.busyFolders.delete(folder.id);
        rerender();
      }
    },
  });
}
