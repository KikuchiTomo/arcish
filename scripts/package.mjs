#!/usr/bin/env node
// Build the uploadable package:   node scripts/package.mjs
// Writes dist/arcish-<version>.zip containing only what the browser loads
// (the manifest and the files it reaches), so tests, scripts and tooling
// never ship. The version comes from manifest.json.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = 'dist';
const SHIPPED = ['manifest.json', '_locales', 'icons', 'src']; // everything the extension needs at run time
const EXCLUDED = ['*.DS_Store'];

const { version, short_name: name } = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
const archive = join(OUT_DIR, `${name.toLowerCase()}-${version}.zip`);

mkdirSync(join(ROOT, OUT_DIR), { recursive: true });
rmSync(join(ROOT, archive), { force: true });
// -X leaves out extra file attributes so the archive is the same on every machine.
execFileSync('zip', ['-r', '-X', '-q', archive, ...SHIPPED, '-x', ...EXCLUDED], { cwd: ROOT, stdio: 'inherit' });

const kilobytes = Math.round(statSync(join(ROOT, archive)).size / 1024);
console.log(`${archive} (${kilobytes} kB)`);
