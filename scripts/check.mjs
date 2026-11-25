#!/usr/bin/env node
// Project checks with no dependencies:   node scripts/check.mjs
//   1. every JS file parses
//   2. locale files are valid, have the same keys, and placeholders match
//   3. every i18n key referenced in code/manifest/HTML exists, none is unused
//   4. every file referenced by the manifest exists
//   5. every relative import resolves, and every imported name is exported
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rel = (p) => relative(root, p);
const errors = [];
const fail = (msg) => errors.push(msg);

function files(dir, ext) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path, ext) : path.endsWith(ext) ? [path] : [];
  });
}

const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
const classicScripts = new Set(manifest.content_scripts.flatMap((c) => c.js));
const sources = files(join(root, 'src'), '.js');

// 1. syntax
for (const file of sources) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (e) {
    fail(`syntax: ${rel(file)}\n${e.stderr}`);
  }
}

// 2. locales
const localeDir = join(root, '_locales');
const locales = Object.fromEntries(readdirSync(localeDir).map((code) => [code, JSON.parse(readFileSync(join(localeDir, code, 'messages.json'), 'utf8'))]));
const base = locales[manifest.default_locale];
if (!base) fail(`default locale "${manifest.default_locale}" is missing`);
const placeholders = (text) => [...new Set(text.match(/\$\d/g) || [])].sort().join(',');
for (const [code, messages] of Object.entries(locales)) {
  for (const key of Object.keys(base)) {
    if (!messages[key]) fail(`locale ${code}: missing "${key}"`);
    else if (placeholders(messages[key].message) !== placeholders(base[key].message)) fail(`locale ${code}: placeholders differ for "${key}"`);
  }
  for (const key of Object.keys(messages)) if (!base[key]) fail(`locale ${code}: extra key "${key}"`);
}

// 3. key usage — a key counts as used when it appears as a quoted string, a
// data-i18n attribute, a __MSG_ reference, or via a `prefix_` + value lookup.
const haystack = [...sources, ...files(join(root, 'src'), '.html'), join(root, 'manifest.json')].map((f) => readFileSync(f, 'utf8')).join('\n');
const dynamicPrefixes = [...[...haystack.matchAll(/keyed\('([A-Za-z]+)'/g)].map((m) => `${m[1]}_`), ...[...haystack.matchAll(/t\(`([A-Za-z]+_)\$\{/g)].map((m) => m[1])];
for (const key of Object.keys(base || {})) {
  const quoted = new RegExp(`['"\`]${key}['"\`]|__MSG_${key}__`).test(haystack);
  if (!quoted && !dynamicPrefixes.some((p) => key.startsWith(p))) fail(`i18n: "${key}" is never used`);
}
const referenced = new Set([
  ...[...haystack.matchAll(/\bt\(\s*'([A-Za-z0-9_]+)'/g)].map((m) => m[1]),
  ...[...haystack.matchAll(/\b[a-zA-Z]*Key:\s*'([A-Za-z0-9_]+)'/g)].map((m) => m[1]),
  ...[...haystack.matchAll(/data-i18n(?:-[a-z]+)?="([A-Za-z0-9_]+)"/g)].map((m) => m[1]),
  ...[...haystack.matchAll(/__MSG_([A-Za-z0-9_]+)__/g)].map((m) => m[1]),
  ...[...haystack.matchAll(/\b(?:item|btn|rowAct|action|SourceError)\((?:ACT\.[A-Z_]+,\s*)?(?:'[a-zA-Z]+',\s*)?'([A-Za-z0-9_]+)'/g)].map((m) => m[1]),
]);
const icons = new Set([...readFileSync(join(root, 'src/shared/icons.js'), 'utf8').matchAll(/^\s{2}([a-zA-Z]+):/gm)].map((m) => m[1]));
for (const key of referenced) if (base && !base[key] && !icons.has(key)) fail(`i18n: "${key}" is referenced but not defined`);

// 4. manifest file references
const manifestFiles = [
  manifest.background.service_worker,
  manifest.side_panel.default_path,
  manifest.options_page,
  ...Object.values(manifest.icons),
  ...classicScripts,
  ...manifest.web_accessible_resources.flatMap((w) => w.resources),
];
for (const file of manifestFiles) if (!existsSync(join(root, file))) fail(`manifest: missing file ${file}`);

// 5. imports
function exportsOf(code) {
  const names = new Set();
  for (const m of code.matchAll(/^export\s+(?:async\s+)?(?:function\*?|class|const|let)\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  for (const m of code.matchAll(/^export\s+(?:const|let)\s+\{([^}]+)\}/gm)) for (const n of m[1].split(',')) names.add(n.split(':').pop().trim());
  for (const m of code.matchAll(/^export\s+\{([^}]+)\}/gm)) for (const n of m[1].split(',')) names.add(n.split(/\s+as\s+/).pop().trim());
  if (/^export\s+default\b/m.test(code)) names.add('default');
  names.delete('');
  return names;
}
const exportCache = new Map();
for (const file of sources) {
  const code = readFileSync(file, 'utf8');
  for (const m of code.matchAll(/^import\s+([^'"]*?)\s*(?:from\s+)?['"](\.[^'"]+)['"]/gm)) {
    const target = join(dirname(file), m[2]);
    if (!existsSync(target)) {
      fail(`import: ${rel(file)} -> ${m[2]} does not exist`);
      continue;
    }
    if (!exportCache.has(target)) exportCache.set(target, exportsOf(readFileSync(target, 'utf8')));
    const available = exportCache.get(target);
    const clause = m[1].trim();
    if (!clause || clause.startsWith('*')) continue;
    const named = clause.match(/\{([^}]*)\}/)?.[1] ?? '';
    const wanted = named.split(',').map((n) => n.trim().split(/\s+as\s+/)[0]).filter(Boolean);
    if (clause.replace(/\{[^}]*\}/, '').replace(',', '').trim()) wanted.push('default');
    for (const name of wanted) if (!available.has(name)) fail(`import: ${rel(file)} imports "${name}" which ${rel(target)} does not export`);
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  console.error(`\n${errors.length} problem(s)`);
  process.exit(1);
}
console.log(`ok — ${sources.length} scripts, ${Object.keys(locales).length} locales, ${Object.keys(base).length} messages`);
