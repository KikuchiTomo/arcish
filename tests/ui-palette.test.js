// Boots the real command bar under jsdom (window host).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPageHarness, installDom, pageHtml, settle } from './helpers/dom.js';

const h = await createPageHarness();
const github = await h.openTab({ url: 'https://github.com/', title: 'GitHub' });
const pinnedTab = await h.openTab({ url: 'https://docs.example/', title: 'Team docs' });
await h.items.pinTab(pinnedTab.id);

const url = `chrome-extension://fake/src/palette/palette.html?host=window&mode=new&tabId=${h.first.id}&windowId=${h.win.id}`;
const dom = installDom(pageHtml('src/palette/palette.html'), url);
dom.window.close = () => {};
await import('../src/palette/main.js');

const input = document.getElementById('q');
const results = () => [...document.querySelectorAll('#results .item')];
const type = async (value) => {
  input.value = value;
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
  await settle(30);
};
const press = (key, init = {}) => input.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));

test('with no query it suggests recent tabs and featured actions', () => {
  const text = results().map((el) => el.textContent);
  assert.ok(text.some((s) => s.includes('GitHub')));
  assert.ok(text.some((s) => s.includes('actionMini')));
});

test('typing finds open tabs and pinned items; the first row searches the web', async () => {
  await type('docs');
  const rows = results().map((el) => el.querySelector('.t').textContent);
  assert.equal(rows[0], 'docs');
  assert.ok(rows.includes('Team docs'));
  assert.ok(results()[0].classList.contains('sel'));
});

test('arrow keys move the selection; enter switches to the tab', async () => {
  await type('github');
  press('ArrowDown');
  assert.match(document.querySelector('#results .sel').textContent, /GitHub/);
  press('Enter');
  await settle();
  assert.equal(h.fake.tab(github.id).active, true);
});

test('enter on a URL opens a new tab in the current space', async () => {
  await type('example.org/page');
  press('Enter');
  await settle();
  const opened = h.fake.tabsOf(h.win.id).find((t) => t.url === 'https://example.org/page');
  assert.ok(opened);
  assert.equal(h.calls.at(-1).type, 'tab:open');
});

test('alt+enter opens the result in a Little Window', async () => {
  await type('peek.example');
  press('Enter', { altKey: true });
  await settle();
  const popup = [...h.fake.windows.values()].find((w) => w.type === 'popup');
  assert.ok(popup);
  assert.equal(h.fake.tabsOf(popup.id)[0].url, 'https://peek.example');
});

test('actions are searchable and run', async () => {
  await type('new space');
  const action = results().find((el) => el.textContent.includes('spaceNew'));
  assert.ok(action);
  action.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await settle();
  assert.equal(h.spaces.all().length, 3);
});
