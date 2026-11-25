// Localisation. Strings live in _locales/<code>/messages.json (the standard
// Chrome format). By default the browser UI language is used; a language
// chosen in settings is loaded as an override dictionary.
import { AUTO_LOCALE, DEFAULT_LOCALE } from '../config/locales.js';
import { LOCAL } from './storage-keys.js';

let override = null; // { code, messages }

async function loadMessages(code) {
  const res = await fetch(chrome.runtime.getURL(`_locales/${code}/messages.json`));
  if (!res.ok) throw new Error(`missing locale: ${code}`);
  return res.json();
}

export async function initI18n(language) {
  let lang = language;
  if (lang === undefined) {
    const stored = await chrome.storage.local.get(LOCAL.SETTINGS);
    lang = stored[LOCAL.SETTINGS]?.language;
  }
  override = null;
  if (lang && lang !== AUTO_LOCALE) {
    try {
      override = { code: lang, messages: await loadMessages(lang) };
    } catch (e) {
      console.warn('[arcish] locale fallback', e);
    }
  }
  if (typeof document !== 'undefined') document.documentElement.lang = currentLocale();
}

export function currentLocale() {
  return override?.code || chrome.i18n.getUILanguage() || DEFAULT_LOCALE;
}

function substitute(message, subs) {
  return message.replace(/\$(\d)/g, (m, i) => (subs[i - 1] !== undefined ? String(subs[i - 1]) : m));
}

export function t(key, ...subs) {
  const entry = override?.messages[key];
  if (entry) return substitute(entry.message, subs);
  return chrome.i18n.getMessage(key, subs.map(String)) || key;
}

// Fill static markup: data-i18n (text), data-i18n-placeholder, data-i18n-title.
export function localizeDom(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-placeholder]')) el.placeholder = t(el.dataset.i18nPlaceholder);
  for (const el of root.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
}

// ---- locale-aware formatting (units come from Intl, not from message files) ----
const RELATIVE_STEPS = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

export function timeAgo(ts) {
  if (!ts) return '';
  const seconds = Math.max(0, (Date.now() - ts) / 1000);
  const rtf = new Intl.RelativeTimeFormat(currentLocale(), { numeric: 'auto', style: 'narrow' });
  for (const [unit, size] of RELATIVE_STEPS) if (seconds >= size) return rtf.format(-Math.floor(seconds / size), unit);
  return rtf.format(0, 'second');
}

// "today", "yesterday", "3 days ago", "2 weeks ago" … for list headings.
const DAY_MS = 24 * 3600 * 1000;
const DAY_STEPS = [
  ['year', 365],
  ['month', 30],
  ['week', 7],
];

export function relativeDay(ts) {
  const startOfDay = (value) => new Date(value).setHours(0, 0, 0, 0);
  const days = Math.max(0, Math.round((startOfDay(Date.now()) - startOfDay(ts)) / DAY_MS));
  const rtf = new Intl.RelativeTimeFormat(currentLocale(), { numeric: 'auto' });
  for (const [unit, size] of DAY_STEPS) if (days >= size) return rtf.format(-Math.floor(days / size), unit);
  return rtf.format(-days, 'day');
}

const BYTE_UNITS = ['byte', 'kilobyte', 'megabyte', 'gigabyte', 'terabyte'];

export function formatBytes(bytes) {
  const step = Math.min(BYTE_UNITS.length - 1, Math.floor(Math.log(Math.max(bytes, 1)) / Math.log(1024)));
  return new Intl.NumberFormat(currentLocale(), { style: 'unit', unit: BYTE_UNITS[step], unitDisplay: 'narrow', maximumFractionDigits: step ? 1 : 0 }).format(bytes / 1024 ** step);
}

export function formatMinutes(minutes) {
  const day = 24 * 60;
  const [value, unit] = minutes % day === 0 ? [minutes / day, 'day'] : minutes % 60 === 0 ? [minutes / 60, 'hour'] : [minutes, 'minute'];
  return new Intl.NumberFormat(currentLocale(), { style: 'unit', unit, unitDisplay: 'long' }).format(value);
}
