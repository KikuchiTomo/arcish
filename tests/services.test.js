// Behavioural tests of the service layer against a fake browser API.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHarness } from './helpers/harness.js';

const SPACE_MODE = { SIDEBAR: 'sidebar', GROUPS: 'groups' };

test('first run adopts existing tabs into the first space without touching the tab strip', async () => {
  const h = await createHarness();
  assert.equal(h.spaces.spaceOf(h.fake.tab(h.first.id)), h.personal.id);
  assert.equal(h.fake.tab(h.first.id).groupId, -1, 'sidebar mode must not create tab groups');
  assert.equal(h.fake.groups.size, 0);
});

test('new tabs join the active space; link-opened tabs follow their opener', async () => {
  const h = await createHarness();
  await h.spaces.switchTo(h.win.id, h.work.id);
  const typed = await h.openTab({ url: 'https://a.example/' });
  assert.equal(h.spaces.spaceOf(typed), h.work.id);
  await h.spaces.switchTo(h.win.id, h.personal.id);
  const fromLink = await h.openTab({ url: 'https://b.example/', openerTabId: typed.id });
  assert.equal(h.spaces.spaceOf(fromLink), h.work.id);
});

test('switching to an empty space leaves the current tab alone (sidebar mode)', async () => {
  const h = await createHarness();
  const before = h.fake.tabs.size;
  await h.spaces.switchTo(h.win.id, h.work.id);
  assert.equal(h.spaces.activeIn(h.win.id), h.work.id);
  assert.equal(h.fake.tabs.size, before, 'no tab may be created');
  assert.equal(h.fake.tab(h.first.id).active, true);
});

test('switching spaces re-activates the tab last used there', async () => {
  const h = await createHarness();
  const a = await h.openTab({ url: 'https://a.example/', active: true });
  await h.spaces.onTabActivated(h.fake.tab(a.id));
  await h.spaces.switchTo(h.win.id, h.work.id);
  const b = await h.openTab({ url: 'https://b.example/', active: true });
  await h.spaces.onTabActivated(h.fake.tab(b.id));
  await h.spaces.switchTo(h.win.id, h.personal.id);
  assert.equal(h.fake.tab(a.id).active, true);
});

test('closing the active tab keeps the window in its space', async () => {
  const h = await createHarness();
  const stay = await h.openTab({ url: 'https://stay.example/', active: true });
  await h.spaces.onTabActivated(h.fake.tab(stay.id));
  const closing = await h.openTab({ url: 'https://closing.example/', active: true });
  await h.spaces.onTabActivated(h.fake.tab(closing.id));
  await h.spaces.switchTo(h.win.id, h.work.id);
  const other = await h.openTab({ url: 'https://other.example/' });
  await h.spaces.switchTo(h.win.id, h.personal.id);
  assert.equal(h.fake.tab(closing.id).active, true);

  // Chrome closes the tab and happens to activate one from the other space.
  await h.closeTab(closing.id);
  await h.fake.api.tabs.update(other.id, { active: true });
  await h.spaces.onTabActivated(h.fake.tab(other.id), { afterClose: true });
  assert.equal(h.spaces.activeIn(h.win.id), h.personal.id, 'the sidebar does not jump to another space');
  const shown = h.fake.tabsOf(h.win.id).find((t) => t.active);
  assert.equal(h.spaces.spaceOf(shown), h.personal.id, 'a tab of the same space is shown instead');

  // Activating a tab of another space on purpose still switches.
  await h.fake.api.tabs.update(other.id, { active: true });
  await h.spaces.onTabActivated(h.fake.tab(other.id));
  assert.equal(h.spaces.activeIn(h.win.id), h.work.id);
});

test('a pinned item is a bookmark that becomes a tab: open, close, reopen', async () => {
  const h = await createHarness();
  const tab = await h.openTab({ url: 'https://docs.example/', title: 'Docs' });
  const nodeId = await h.items.pinTab(tab.id);
  assert.equal(h.bindings.tabIdOf(nodeId), tab.id);
  assert.equal(h.personal.pinned[0].url, 'https://docs.example/');

  await h.closeTab(tab.id);
  assert.equal(h.bindings.tabIdOf(nodeId), null, 'closing the tab only unbinds');
  assert.equal(h.personal.pinned.length, 1, 'the pinned item survives');

  const reopened = await h.items.open(nodeId, h.win.id);
  assert.notEqual(reopened, tab.id);
  assert.equal(h.fake.tab(reopened).url, 'https://docs.example/');
  assert.equal(h.spaces.spaceOf(h.fake.tab(reopened)), h.personal.id);
  assert.equal(await h.items.open(nodeId, h.win.id), reopened, 'opening again focuses the same tab');
});

test('a pinned tab that navigated away can be reset or adopt the new URL', async () => {
  const h = await createHarness();
  const tab = await h.openTab({ url: 'https://docs.example/' });
  const nodeId = await h.items.pinTab(tab.id);
  h.fake.tab(tab.id).url = 'https://docs.example/other';
  await h.items.reset(nodeId);
  assert.equal(h.fake.tab(tab.id).url, 'https://docs.example/');
  h.fake.tab(tab.id).url = 'https://docs.example/new-home';
  await h.items.adoptTabUrl(nodeId);
  assert.equal(h.personal.pinned[0].url, 'https://docs.example/new-home');
});

test('favorites open as Chrome pinned tabs and move to/from a space', async () => {
  const h = await createHarness();
  const tab = await h.openTab({ url: 'https://mail.example/' });
  const nodeId = await h.items.favoriteTab(tab.id);
  assert.equal(h.fake.tab(tab.id).pinned, true);
  assert.equal(h.store.local[h.LOCAL.FAVORITES].length, 1);

  await h.items.move(nodeId, { zone: 'pinned', spaceId: h.work.id });
  assert.equal(h.fake.tab(tab.id).pinned, false);
  assert.equal(h.store.local[h.LOCAL.FAVORITES].length, 0);
  assert.equal(h.work.pinned[0].id, nodeId);
  assert.equal(h.spaces.spaceOf(h.fake.tab(tab.id)), h.work.id);
  assert.equal(h.bindings.tabIdOf(nodeId), tab.id, 'the binding survives the move');

  await h.items.move(nodeId, { zone: 'today', spaceId: h.work.id });
  assert.equal(h.work.pinned.length, 0);
  assert.equal(h.bindings.nodeIdOf(tab.id), null, 'it is a plain tab again');
  assert.ok(h.fake.tab(tab.id), 'the tab stays open');
});

test('Chrome-side pinning is adopted; unpinning never deletes the favorite', async () => {
  const h = await createHarness();
  const tab = await h.openTab({ url: 'https://cal.example/' });
  await h.fake.api.tabs.update(tab.id, { pinned: true });
  await h.items.onChromePinChanged(h.fake.tab(tab.id));
  const favorites = h.store.local[h.LOCAL.FAVORITES];
  assert.equal(favorites.length, 1);
  await h.fake.api.tabs.update(tab.id, { pinned: false });
  await h.items.onChromePinChanged(h.fake.tab(tab.id));
  assert.equal(favorites.length, 1, 'favorite kept');
  assert.equal(h.bindings.tabIdOf(favorites[0].id), null);
});

test('folders hold pinned items; removing a folder releases or closes its tabs', async () => {
  const h = await createHarness();
  const a = await h.openTab({ url: 'https://a.example/' });
  const b = await h.openTab({ url: 'https://b.example/' });
  const folderId = await h.items.createFolder({ spaceId: h.personal.id, title: 'Read', tabIds: [a.id, b.id] });
  assert.equal(h.personal.pinned[0].children.length, 2);
  await h.items.remove(folderId, { closeTab: true });
  assert.equal(h.personal.pinned.length, 0);
  assert.equal(h.fake.tab(a.id), undefined);
  assert.equal(h.fake.tab(b.id), undefined);
});

test('bindings are rebuilt by URL after a restart', async () => {
  const h = await createHarness();
  const tab = await h.openTab({ url: 'https://docs.example/' });
  const nodeId = await h.items.pinTab(tab.id);
  h.store.session[h.SESSION.BINDINGS] = {};
  h.store.local[h.LOCAL.BINDINGS_BACKUP] = {}; // a new browser session: tab ids mean nothing
  await h.items.rebind();
  assert.equal(h.bindings.tabIdOf(nodeId), tab.id);
});

test('an extension update keeps favorites attached even after their tabs navigated', async () => {
  const h = await createHarness();
  const mail = await h.openTab({ url: 'https://mail.example/' });
  const chat = await h.openTab({ url: 'https://chat.example/' });
  const mailId = await h.items.favoriteTab(mail.id);
  const chatId = await h.items.favoriteTab(chat.id);
  const docs = await h.openTab({ url: 'https://docs.example/start' });
  const docsId = await h.items.pinTab(docs.id);
  // The tabs moved on from the saved URLs, as mail and chat apps do.
  h.fake.tab(mail.id).url = 'https://mail.example/u/0/#inbox';
  h.fake.tab(chat.id).url = 'https://chat.example/client/T1/C2';
  h.fake.tab(docs.id).url = 'https://docs.example/somewhere/else';
  await h.bindings.backup();

  h.store.session[h.SESSION.BINDINGS] = {}; // what updating the extension does
  await h.items.rebind();
  assert.deepEqual([h.bindings.tabIdOf(mailId), h.bindings.tabIdOf(chatId), h.bindings.tabIdOf(docsId)], [mail.id, chat.id, docs.id]);
  assert.equal(h.store.local[h.LOCAL.FAVORITES].length, 2, 'no duplicate favorites are created');

  // Without a usable backup (browser restart) a pinned tab on the same site is still recognised.
  h.store.session[h.SESSION.BINDINGS] = {};
  h.store.local[h.LOCAL.BINDINGS_BACKUP] = { [mailId]: { tabId: 99999, url: 'https://mail.example/' } };
  await h.items.rebind();
  assert.deepEqual([h.bindings.tabIdOf(mailId), h.bindings.tabIdOf(chatId)], [mail.id, chat.id]);
  assert.equal(h.store.local[h.LOCAL.FAVORITES].length, 2);
});

test('live folders: first fetch is read, later entries are unread, errors are kept', async () => {
  let feed = [{ id: '1', url: 'https://x.example/1', title: 'One' }];
  let failure = null;
  const source = { kind: 'test', fetch: async () => (failure ? Promise.reject(failure) : feed) };
  const h = await createHarness({ sources: (kind) => (kind === 'test' ? source : null) });
  const folderId = await h.items.createLiveFolder({ spaceId: h.personal.id, title: 'Feed', source: { kind: 'test' } });

  await h.live.refresh({ folderId });
  let entry = h.store.local[h.LOCAL.LIVE_CACHE][folderId];
  assert.deepEqual(entry.items.map((i) => i.unread), [false]);
  assert.equal(h.fake.badge.text, '');

  feed = [{ id: '2', url: 'https://x.example/2', title: 'Two' }, ...feed];
  await h.live.refresh({ folderId });
  entry = h.store.local[h.LOCAL.LIVE_CACHE][folderId];
  assert.deepEqual(entry.items.map((i) => i.unread), [true, false]);
  assert.equal(h.fake.badge.text, '1');

  // Opening an entry binds a tab and marks it read.
  const liveId = `live:${folderId}:${entry.items[0].key}`;
  const tabId = await h.items.open(liveId, h.win.id);
  assert.equal(h.fake.tab(tabId).url, 'https://x.example/2');
  assert.equal(h.fake.badge.text, '');

  failure = new Error('boom');
  await h.live.refresh({ folderId });
  entry = h.store.local[h.LOCAL.LIVE_CACHE][folderId];
  assert.equal(entry.error, 'boom');
  assert.equal(entry.items.length, 2, 'old entries stay visible on failure');

  await h.items.remove(folderId);
  assert.equal(h.store.local[h.LOCAL.LIVE_CACHE][folderId], undefined);
});

test('archive: clear keeps pinned tabs, restore returns the tab to its space', async () => {
  const h = await createHarness();
  const pinnedTab = await h.openTab({ url: 'https://keep.example/' });
  await h.items.pinTab(pinnedTab.id);
  const plain = await h.openTab({ url: 'https://old.example/', title: 'Old' });
  await h.archive.clearToday(h.win.id, h.personal.id);
  assert.ok(h.fake.tab(pinnedTab.id), 'pinned tab untouched');
  assert.equal(h.fake.tab(plain.id), undefined);
  const archive = h.store.local[h.LOCAL.ARCHIVE];
  assert.deepEqual(archive.map((e) => e.url).sort(), ['https://old.example/', 'https://start.example/']);

  await h.spaces.switchTo(h.win.id, h.work.id);
  await h.archive.restore(archive.find((e) => e.title === 'Old').id, h.win.id);
  const restored = h.fake.tabsOf(h.win.id).find((t) => t.url === 'https://old.example/');
  assert.equal(h.spaces.spaceOf(restored), h.personal.id);
  assert.equal(h.spaces.activeIn(h.win.id), h.personal.id);
});

test('auto-archive is off by default and never closes active, pinned or bound tabs', async () => {
  const h = await createHarness();
  const idle = await h.openTab({ url: 'https://idle.example/' });
  h.fake.tab(idle.id).lastAccessed = 0;
  h.fake.tab(h.first.id).lastAccessed = 0; // active tab
  await h.archive.autoArchive();
  assert.ok(h.fake.tab(idle.id), 'default settings must not close tabs');

  h.store.settings.archiveAfter = 60;
  const bound = await h.openTab({ url: 'https://bound.example/' });
  await h.items.pinTab(bound.id);
  h.fake.tab(bound.id).lastAccessed = 0;
  await h.archive.autoArchive();
  assert.equal(h.fake.tab(idle.id), undefined);
  assert.ok(h.fake.tab(bound.id));
  assert.ok(h.fake.tab(h.first.id));
});

test('air traffic control routes new tabs by URL', async () => {
  const h = await createHarness();
  h.store.settings.atcRules = [{ id: 'r', pattern: 'github.com', spaceId: h.work.id }];
  const tab = await h.openTab({ url: 'https://gist.github.com/x' });
  assert.equal(h.spaces.spaceOf(tab), h.work.id);
  const other = await h.openTab({ url: 'https://example.com/' });
  assert.equal(h.spaces.spaceOf(other), h.personal.id);
});

test('split view puts two tabs side by side in the same window and can be undone', async () => {
  const h = await createHarness();
  const a = await h.openTab({ url: 'https://a.example/', active: true });
  const b = await h.openTab({ url: 'https://b.example/' });
  const windows = h.fake.windows.size;
  const splitViewId = await h.split.create([a.id, b.id]);
  assert.equal(h.fake.windows.size, windows, 'no extra window is opened');
  assert.deepEqual([h.fake.tab(a.id).splitViewId, h.fake.tab(b.id).splitViewId], [splitViewId, splitViewId]);
  assert.equal(h.fake.tab(a.id).windowId, h.fake.tab(b.id).windowId);

  await h.split.toggle(h.win.id); // the active tab is split: toggling ends it
  assert.deepEqual([h.fake.tab(a.id).splitViewId, h.fake.tab(b.id).splitViewId], [-1, -1]);
  await assert.rejects(h.split.create([a.id]), /errorSplitNeedsTwo/);

  // "open link in split view" pairs the tab with a new one
  await h.split.withUrl(a.id, 'https://c.example/');
  const partner = h.fake.tabsOf(h.win.id).find((t) => t.url === 'https://c.example/');
  assert.equal(partner.splitViewId, h.fake.tab(a.id).splitViewId);
  h.store.settings.archiveAfter = 60;
  partner.lastAccessed = 0;
  await h.archive.autoArchive();
  assert.ok(h.fake.tab(partner.id), 'tabs in a split view are never auto-archived');
});

test('little window opens as a popup and promotes its page to the main window', async () => {
  const h = await createHarness();
  h.store.session[h.SESSION.LAST_NORMAL_WINDOW] = h.win.id;
  const miniId = await h.mini.open('https://peek.example/');
  assert.equal(h.fake.windows.get(miniId).type, 'popup');
  assert.equal(h.mini.isMini(miniId), true);
  const miniTab = h.fake.tabsOf(miniId)[0];
  await h.mini.promote(miniTab.id);
  assert.equal(h.fake.windows.has(miniId), false);
  const moved = h.fake.tabsOf(h.win.id).find((t) => t.url === 'https://peek.example/');
  assert.equal(h.spaces.spaceOf(moved), h.personal.id);
});

test('tab-group mode mirrors spaces as groups and migrates both ways', async () => {
  const h = await createHarness();
  const a = await h.openTab({ url: 'https://a.example/' });
  await h.spaces.switchTo(h.win.id, h.work.id);
  const b = await h.openTab({ url: 'https://b.example/', active: true });

  h.store.settings.spaceMode = SPACE_MODE.GROUPS;
  await h.membership.migrate(SPACE_MODE.SIDEBAR);
  const groupOf = (id) => h.fake.groups.get(h.fake.tab(id).groupId);
  assert.equal(groupOf(a.id).title, 'Personal');
  assert.equal(groupOf(b.id).title, 'Work');
  assert.equal(groupOf(a.id).collapsed, true, 'inactive space collapses');
  assert.equal(groupOf(b.id).collapsed, false);
  assert.equal(h.spaces.spaceOf(h.fake.tab(a.id)), h.personal.id);

  h.store.settings.spaceMode = SPACE_MODE.SIDEBAR;
  await h.membership.migrate(SPACE_MODE.GROUPS);
  assert.equal(h.fake.groups.size, 0, 'our groups are dissolved');
  assert.equal(h.spaces.spaceOf(h.fake.tab(a.id)), h.personal.id);
  assert.equal(h.spaces.spaceOf(h.fake.tab(b.id)), h.work.id);
});

test('tab-group mode leaves groups the user made alone', async () => {
  const h = await createHarness({ settings: { spaceMode: SPACE_MODE.GROUPS } });
  const mine = h.fake.addTab({ windowId: h.win.id, url: 'https://mine.example/' });
  const userGroup = await h.fake.api.tabs.group({ tabIds: [mine.id] });
  await h.fake.api.tabGroups.update(userGroup, { title: 'My group' });
  await h.spaces.adopt(mine.id);
  await h.spaces.reconcile();
  assert.equal(h.fake.tab(mine.id).groupId, userGroup);
  assert.equal(h.fake.groups.get(userGroup).title, 'My group');
  assert.equal(h.spaces.spaceOf(h.fake.tab(mine.id)), null);
});

test('pinned tabs follow the order of the Favorites, and a drag in Chrome reorders Favorites', async () => {
  const h = await createHarness();
  const names = ['a', 'b', 'c'];
  const tabs = {};
  const ids = {};
  for (const name of names) {
    tabs[name] = await h.openTab({ url: `https://${name}.example/` });
    ids[name] = await h.items.favoriteTab(tabs[name].id);
  }
  const strip = () => h.fake.tabsOf(h.win.id).filter((t) => t.pinned).map((t) => new URL(t.url).host[0]);
  const favorites = () => h.store.local[h.LOCAL.FAVORITES].map((node) => new URL(node.url).host[0]);
  const dragInChrome = async (name, index) => {
    await h.fake.api.tabs.move(tabs[name].id, { index });
    await h.items.onPinnedTabMoved(tabs[name].id);
  };

  // Reordering in the sidebar moves the pinned tabs, so "go to tab N" matches.
  await h.items.move(ids.c, { zone: 'fav', beforeId: ids.a });
  assert.deepEqual(favorites(), ['c', 'a', 'b']);
  assert.deepEqual(strip(), ['c', 'a', 'b']);

  // A closed favorite keeps its place; reopening puts its tab back in position.
  await h.closeTab(tabs.a.id);
  assert.deepEqual(strip(), ['c', 'b']);
  await h.items.open(ids.a, h.win.id);
  assert.deepEqual(strip(), ['c', 'a', 'b']);
  tabs.a = h.fake.tab(h.bindings.tabIdOf(ids.a));

  // Dragging a pinned tab in Chrome: by default the Favorites take that order…
  await dragInChrome('b', 0);
  assert.deepEqual(favorites(), ['b', 'c', 'a']);
  // …with tab authority the tabs are put back instead.
  h.store.settings.tabAuthority = 'pinned';
  await dragInChrome('a', 0);
  assert.deepEqual(favorites(), ['b', 'c', 'a']);
  assert.deepEqual(strip(), ['b', 'c', 'a']);
});

test('tab authority: none follows Chrome, pinned protects bound tabs, all protects every tab', async () => {
  const h = await createHarness();
  const fav = await h.openTab({ url: 'https://fav.example/' });
  const favId = await h.items.favoriteTab(fav.id);
  const plain = await h.openTab({ url: 'https://plain.example/' });
  const chromePin = async (tab, pinned) => {
    await h.fake.api.tabs.update(tab.id, { pinned });
    await h.items.onChromePinChanged(h.fake.tab(tab.id));
  };

  h.store.settings.tabAuthority = 'pinned';
  await chromePin(fav, false);
  assert.equal(h.fake.tab(fav.id).pinned, true, 'a favorite is pinned again');
  assert.equal(h.bindings.tabIdOf(favId), fav.id);
  await chromePin(plain, true);
  assert.equal(h.store.local[h.LOCAL.FAVORITES].length, 2, 'other tabs still follow Chrome: pinning adopts them');

  h.store.settings.tabAuthority = 'all';
  const other = await h.openTab({ url: 'https://other.example/' });
  await chromePin(other, true);
  assert.equal(h.fake.tab(other.id).pinned, false, 'a tab that is not a favorite is unpinned again');
  assert.equal(h.store.local[h.LOCAL.FAVORITES].length, 2);

  h.store.settings.tabAuthority = 'none';
  await chromePin(fav, false);
  assert.equal(h.fake.tab(fav.id).pinned, false);
  assert.equal(h.bindings.tabIdOf(favId), null, 'Chrome wins: the tab is detached, the favorite stays');
  assert.equal(h.store.local[h.LOCAL.FAVORITES].length, 2);
});

test('tab authority in tab-group mode: a tab dragged to another group is put back, or followed', async () => {
  const h = await createHarness({ settings: { spaceMode: SPACE_MODE.GROUPS } });
  const tab = await h.openTab({ url: 'https://a.example/' });
  await h.spaces.switchTo(h.win.id, h.work.id);
  const workTab = h.fake.tabsOf(h.win.id).find((t) => h.spaces.spaceOf(t) === h.work.id);
  const workGroup = workTab.groupId;
  const personalGroup = h.fake.tab(tab.id).groupId;
  const dragInChrome = async (groupId) => {
    await h.fake.api.tabs.group({ tabIds: [tab.id], groupId });
    await h.membership.onTabGroupChanged(tab.id);
  };

  await dragInChrome(workGroup); // default: Chrome wins
  assert.equal(h.spaces.spaceOf(h.fake.tab(tab.id)), h.work.id);

  h.store.settings.tabAuthority = 'all';
  await dragInChrome(personalGroup);
  assert.equal(h.fake.tab(tab.id).groupId, workGroup, 'the tab is put back into its space');

  h.store.settings.tabAuthority = 'pinned'; // an unpinned tab is not covered
  await dragInChrome(personalGroup);
  assert.equal(h.spaces.spaceOf(h.fake.tab(tab.id)), h.personal.id);
  await h.items.pinTab(tab.id);
  await dragInChrome(workGroup);
  assert.equal(h.fake.tab(tab.id).groupId, personalGroup, 'a pinned item\'s tab is put back');
});

test('deleting a space archives its tabs and falls back to another space', async () => {
  const h = await createHarness();
  await h.spaces.switchTo(h.win.id, h.work.id);
  const tab = await h.openTab({ url: 'https://w.example/', active: true });
  await h.spaces.remove(h.work.id, (tabs) => h.archive.archive(tabs, 'space-deleted'));
  assert.equal(h.spaces.get(h.work.id), null);
  assert.equal(h.fake.tab(tab.id), undefined);
  assert.equal(h.spaces.activeIn(h.win.id), h.personal.id);
  await assert.rejects(h.spaces.remove(h.personal.id, async () => {}));
});

test('settings changes notify listeners and backups round-trip', async () => {
  const h = await createHarness();
  const seen = [];
  h.settings.onChange((changed) => void seen.push(...changed));
  await h.settings.update({ archiveAfter: 720, unknownKey: 1 });
  assert.deepEqual(seen, ['archiveAfter']);
  await h.settings.update({ archiveAfter: 720 });
  assert.equal(seen.length, 1, 'no event when nothing changed');
  const backup = structuredClone(h.settings.exportBackup());
  backup.settings.searchEngine = 'kagi';
  await h.settings.importBackup(backup);
  assert.equal(h.store.settings.searchEngine, 'kagi');
});
