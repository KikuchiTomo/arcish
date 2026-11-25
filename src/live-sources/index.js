// Live Folder source registry.
//
// A source is a plain object:
//   kind          unique id stored with the folder
//   nameKey       i18n key for the picker
//   icon          icon name, shown inside the folder icon
//   itemIcon?     icon name for entries (default: the entry's favicon)
//   hintKey?      i18n key for a help line in the dialog
//   fields        [{ name, type: 'text'|'url'|'select', labelKey, placeholder?, required?,
//                    defaultValue?, options?: [{ value, labelKey }], presets?: [{ labelKey, value }] }]
//   defaultTitle  (source, t) => string
//   fetch         async (source, ctx) => [{ id, url, title, date?, subtitle?, meta?, draft?, status? }]
//                 subtitle: second line; meta: tooltip detail; status: success | failure | pending
//                 ctx = { settings, limit }
//
// To add a source, create a module exporting such an object and list it here.
import rss from './rss.js';
import { githubIssues, githubPulls, githubSearch } from './github.js';
import hackerNews from './hacker-news.js';

export const LIVE_SOURCES = Object.freeze([githubSearch, githubPulls, githubIssues, rss, hackerNews]);

const byKind = new Map(LIVE_SOURCES.map((s) => [s.kind, s]));

export function liveSource(kind) {
  return byKind.get(kind) || null;
}

export const DEFAULT_LIVE_SOURCE = LIVE_SOURCES[0];
