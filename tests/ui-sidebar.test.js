// Boots the real sidebar page under jsdom and drives it like a user.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { click, createPageHarness, installDom, pageHtml, settle } from './helpers/dom.js';

installDom(pageHtml('src/sidebar/sidebar.html'));
const feed = [{ id: '1', url: 'https://news.example/1', title: 'First story' }];
const h = await createPageHarness({ sources: (kind) => (kind === 'test' ? { kind, nameKey: 'liveSourceRss', fetch: async () => feed } : null) });

// State the sidebar should show.
const docs = await h.openTab({ url: 'https://docs.example/', title: 'Docs' });
const pinnedId = await h.items.pinTab(docs.id);
const mail = await h.openTab({ url: 'https://mail.example/', title: 'Mail' });
await h.items.favoriteTab(mail.id);
const folderId = await h.items.createFolder({ spaceId: h.personal.id, title: 'Reading' });
const liveId = await h.items.createLiveFolder({ spaceId: h.personal.id, title: 'News', source: { kind: 'test' } });
await h.live.refresh({ folderId: liveId });
const today = await h.openTab({ url: 'https://today.example/', title: 'Today tab' });

await import('../src/sidebar/main.js');
const app = document.getElementById('app');
const row = (selector) => app.querySelector(selector);
const titles = (selector) => [...app.querySelectorAll(`${selector} .title`)].map((el) => el.textContent.trim());

test('renders favorites, pinned tree, live folder entries and today tabs', () => {
  assert.equal(app.querySelectorAll('.fav').length, 1);
  assert.deepEqual(titles('.pinned .row'), ['Docs', 'Reading', 'News', 'First story']);
  assert.ok(row(`[data-node="${pinnedId}"]`).classList.contains('open'));
  assert.deepEqual(titles('.today .row.tab').sort(), ['Today tab', 'https://start.example/']);
  assert.equal(app.querySelectorAll('.space-dot').length, 2);
  assert.match(row('.space-head .name').textContent, /Personal/);
});

test('clicking a today tab activates it', async () => {
  click(row(`[data-tab="${today.id}"]`));
  await settle();
  assert.equal(h.fake.tab(today.id).active, true);
  assert.ok(row(`[data-tab="${today.id}"]`).classList.contains('active'));
});

test('closing a pinned tab keeps the item; clicking it opens a new tab', async () => {
  click(row(`[data-node="${pinnedId}"] [data-act="close-node"]`));
  await settle();
  await h.bindings.unbindTab(docs.id);
  assert.equal(h.fake.tab(docs.id), undefined);
  assert.ok(row(`[data-node="${pinnedId}"]`).classList.contains('closed'));

  click(row(`[data-node="${pinnedId}"]`));
  await settle();
  const reopened = h.fake.tab(h.bindings.tabIdOf(pinnedId));
  assert.equal(reopened.url, 'https://docs.example/');
  assert.ok(row(`[data-node="${pinnedId}"]`).classList.contains('open'));
});

test('clicking a folder toggles it; clicking a live entry opens it', async () => {
  const kids = row(`[data-key="children-${folderId}"]`);
  assert.equal(kids.classList.contains('closed'), false);
  click(row(`[data-node="${folderId}"]`));
  await settle();
  assert.equal(row(`[data-node="${folderId}"]`).classList.contains('isopen'), false);
  assert.equal(row(`[data-key="children-${folderId}"]`), kids, 'the same element collapses, so the transition can run');
  assert.ok(kids.classList.contains('closed') && kids.hasAttribute('inert'));
  click(row('[data-live]'));
  await settle();
  assert.ok(h.fake.tabsOf(h.win.id).some((t) => t.url === 'https://news.example/1'));
});

test('long live folders collapse behind "show more"', async () => {
  for (let i = 2; i <= 9; i++) feed.push({ id: String(i), url: `https://news.example/${i}`, title: `Story ${i}` });
  await h.live.refresh({ folderId: liveId });
  await settle();
  assert.equal(app.querySelectorAll('[data-live]').length, 6);
  click(row('[data-act="live-more"]'));
  await settle();
  assert.equal(app.querySelectorAll('[data-live]').length, 9);
});

test('cmd+click selects tabs and the selection bar archives them', async () => {
  click(row(`[data-tab="${today.id}"]`), { metaKey: true });
  await settle();
  assert.ok(row('.selbar'));
  click(row('[data-act="sel-archive"]'));
  await settle();
  assert.equal(h.fake.tab(today.id), undefined);
  assert.equal(h.store.local[h.LOCAL.ARCHIVE][0].url, 'https://today.example/');
});

test('the library lists archived tabs by day and restores on click', async () => {
  click(row('.bottom [data-act="library-toggle"]'));
  await settle();
  assert.deepEqual([...app.querySelectorAll('.lib-rail [data-section]')].map((el) => el.dataset.section), ['archive', 'downloads', 'spaces', 'boosts']);
  assert.ok(row('.lib-day'), 'entries are grouped under a day heading');
  const entry = row('[data-archive]');
  assert.match(entry.textContent, /Today tab/);
  assert.match(entry.querySelector('.sub').textContent, /today\.example/);
  click(entry);
  await settle();
  assert.ok(h.fake.tabsOf(h.win.id).some((t) => t.url === 'https://today.example/'));
});

test('library sections: downloads open files, spaces switch, back returns', async () => {
  h.fake.downloads.push({ id: 7, filename: '/Users/me/Downloads/report.pdf', url: 'https://files.example/report.pdf', fileSize: 2048, exists: true, startTime: new Date().toISOString() });
  click(row('[data-section="downloads"]'));
  await settle();
  const file = row('[data-download="7"]');
  assert.equal(file.querySelector('.line').textContent, 'report.pdf');
  assert.match(file.querySelector('.sub').textContent, /files\.example/);
  click(file);
  await settle();
  assert.deepEqual(h.fake.opened, [7]);

  click(row('[data-section="spaces"]'));
  await settle();
  assert.equal(app.querySelectorAll('[data-library-space]').length, 2);
  click(row('.lib-rail [data-act="library-toggle"]'));
  await settle();
  assert.ok(row('.pinned'));
});

test('switching space swaps the pinned list and the colour', async () => {
  const before = document.documentElement.style.getPropertyValue('--space');
  click(app.querySelector(`.space-dot[data-space="${h.work.id}"]`));
  await settle();
  assert.match(row('.space-head .name').textContent, /Work/);
  assert.equal(app.querySelectorAll('.pinned .row').length, 0);
  assert.equal(app.querySelectorAll('.fav').length, 1, 'favorites are shared by all spaces');
  assert.notEqual(document.documentElement.style.getPropertyValue('--space'), before);
});

test('context menu on a favorite offers moving it into the space', async () => {
  const fav = row('.fav');
  fav.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
  const items = [...document.querySelectorAll('#overlay .mi')];
  assert.ok(items.length >= 5);
  click(items.find((el) => el.textContent.includes('favMoveToPinned')));
  await settle();
  assert.equal(app.querySelectorAll('.fav').length, 0);
  assert.deepEqual(titles('.pinned .row'), ['Mail']);
  assert.equal(h.fake.tab(mail.id).pinned, false);
});

test('"new tab" opens the command bar inside the sidebar, where the focus is', async () => {
  click(row('[data-act="new-tab"]'));
  const frame = document.querySelector('#overlay iframe.palette-frame');
  assert.ok(frame, 'the command bar is hosted by the sidebar itself');
  const params = new URL(frame.src).searchParams;
  assert.equal(params.get('host'), 'panel');
  assert.equal(params.get('mode'), 'new');
  assert.equal(Number(params.get('windowId')), h.win.id);
  assert.equal(h.calls.some((m) => m.type === 'palette:open'), false, 'no overlay is injected into the page');
  window.dispatchEvent(new window.MessageEvent('message', { source: frame.contentWindow, data: { channel: 'arcish', type: 'palette:close' } }));
  assert.equal(document.querySelector('#overlay iframe'), null);
});

test('a split view shows as one row with two halves and can be ended', async () => {
  const left = await h.openTab({ url: 'https://left.example/', title: 'Left' });
  const right = await h.openTab({ url: 'https://right.example/', title: 'Right' });
  const splitViewId = await h.split.create([left.id, right.id]);
  await settle();
  const pair = row(`[data-split="${splitViewId}"]`);
  assert.deepEqual([...pair.querySelectorAll('.half .title')].map((el) => el.textContent), ['Left', 'Right']);
  click(pair.querySelector(`[data-tab="${right.id}"]`));
  await settle();
  assert.equal(h.fake.tab(right.id).active, true);
  click(row(`[data-split="${splitViewId}"] [data-act="exit-split"]`));
  await settle();
  assert.equal(row('[data-split]'), null);
  assert.ok(row(`.row.tab[data-tab="${left.id}"]`));
});

test('rename is only in the context menu; double-click does nothing', async () => {
  const folder = row('.row.folder') || (click(app.querySelector(`.space-dot[data-space="${h.personal.id}"]`)), await settle(), row('.row.folder'));
  folder.querySelector('.title').dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true }));
  await settle();
  assert.equal(app.querySelector('input.rename'), null);
  folder.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
  click([...document.querySelectorAll('#overlay .mi')].find((el) => el.textContent.includes('rename')));
  const input = app.querySelector('input.rename');
  assert.ok(input);
  input.value = 'Renamed';
  input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await settle();
  assert.ok(titles('.pinned .row').includes('Renamed'));
});

test('a settings change re-renders without a reload', async () => {
  await h.settings.update({ colorScheme: 'dark' });
  await settle();
  assert.equal(document.documentElement.dataset.scheme, 'dark');
});
