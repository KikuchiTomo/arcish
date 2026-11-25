// Boots the real settings page under jsdom.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPageHarness, installDom, pageHtml, settle, click } from './helpers/dom.js';

const h = await createPageHarness();
await h.boosts.save('example.com', { css: 'body{color:red}', zaps: ['#ad', '.banner'] });
installDom(pageHtml('src/options/options.html'), 'chrome-extension://fake/src/options/options.html');
await import('../src/options/options.js');

const app = document.getElementById('app');
const control = (key) => app.querySelector(`select[data-setting="${key}"], input[data-setting="${key}"]:not([type="radio"])`);
const chosen = (key) => app.querySelector(`input[type="radio"][data-setting="${key}"]:checked`)?.value;
const go = async (section) => {
  location.hash = `#${section}`;
  window.dispatchEvent(new window.Event('hashchange'));
  await settle(20);
};
const change = async (el, value) => {
  if (el.type === 'checkbox' || el.type === 'radio') el.checked = value;
  else el.value = value;
  el.dispatchEvent(new window.Event('change', { bubbles: true }));
  await settle();
};

test('the navigation lists every section and shows one at a time', async () => {
  assert.deepEqual([...app.querySelectorAll('.nav a')].map((a) => a.getAttribute('href')), ['#general', '#spaces', '#chrome', '#windows', '#live', '#routing', '#boosts', '#data']);
  assert.ok(control('language'));
  assert.equal(control('archiveAfter'), null);
  await go('windows');
  assert.ok(app.querySelector('.nav a[href="#windows"]').classList.contains('on'));
  assert.ok(control('miniWidth'));
  assert.equal(control('language'), null);
});

test('defaults do not change how Chrome behaves', async () => {
  await go('chrome');
  assert.equal(chosen('spaceMode'), 'sidebar');
  assert.equal(chosen('tabAuthority'), 'none');
  assert.equal(control('archiveAfter').value, '0');
  assert.equal(control('peekShiftClick').checked, false);
});

test('changing controls saves typed values and reveals dependent fields', async () => {
  await change(control('archiveAfter'), '720');
  assert.equal(h.store.settings.archiveAfter, 720);
  await change(control('peekShiftClick'), true);
  assert.equal(h.store.settings.peekShiftClick, true);
  await go('general');
  assert.equal(control('customSearch'), null, 'shown only for the custom engine');
  await change(control('searchEngine'), 'custom');
  assert.ok(control('customSearch'));
  await change(app.querySelector('input[data-setting="colorScheme"][value="dark"]'), true);
  assert.equal(h.store.settings.colorScheme, 'dark');
  assert.equal(document.documentElement.dataset.scheme, 'dark');
});

test('spaces can be renamed, recoloured, added and removed', async () => {
  await go('spaces');
  const row = app.querySelector(`[data-space="${h.work.id}"]`);
  await change(row.querySelector('[data-space-field="name"]'), 'Office');
  await change(row.querySelector('[data-space-field="color"]'), '#123456');
  await change(row.querySelector('[data-space-field="emoji"]'), '🏢');
  assert.deepEqual([h.work.name, h.work.color, h.work.emoji], ['Office', '#123456', '🏢']);
  click(app.querySelector('[data-space-add]'));
  await settle();
  assert.equal(app.querySelectorAll('[data-space]').length, 3);
  click(app.querySelector(`[data-space="${h.work.id}"] [data-space-remove]`));
  await settle();
  assert.equal(h.spaces.get(h.work.id), null);
});

test('routing rules can be added, edited and removed', async () => {
  await go('routing');
  click(app.querySelector('[data-rule-add]'));
  await settle();
  const rule = app.querySelector('[data-rule]');
  const pattern = rule.querySelector('[data-rule-pattern]');
  rule.querySelector('[data-rule-space]').value = h.personal.id;
  await change(pattern, 'github.com');
  assert.deepEqual(h.store.settings.atcRules.map((r) => [r.pattern, r.spaceId]), [['github.com', h.personal.id]]);
  click(app.querySelector('[data-rule-remove]'));
  await settle();
  assert.equal(h.store.settings.atcRules.length, 0);
});

test('boosts list CSS and zaps; a zap can be removed', async () => {
  await go('boosts');
  const boost = app.querySelector('[data-boost="example.com"]');
  assert.equal(boost.querySelector('textarea').value, 'body{color:red}');
  assert.equal(boost.querySelectorAll('.zap').length, 2);
  click(boost.querySelector('[data-zap-remove="0"]'));
  await settle();
  assert.deepEqual(h.store.local[h.LOCAL.BOOSTS]['example.com'].zaps, ['.banner']);
});
