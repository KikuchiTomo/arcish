// Entry point of the service worker: boot sequence and event wiring.
// The object graph is built in ./container.js; no business logic lives here.
import { DEFAULT_SPACES } from '../config/defaults.js';
import { LOCAL, SESSION } from '../shared/storage-keys.js';
import { createServices } from './container.js';
import { MessageRouter } from './core/router.js';
import { scheduleAlarms, wireBrowserEvents } from './wiring/browser-events.js';
import { buildCommands } from './wiring/commands.js';
import { buildContextMenus, installContextMenus } from './wiring/context-menus.js';
import { buildRoutes } from './wiring/routes.js';

const services = createServices(chrome);
const { api, store, spaces, membership, items, live, tabs, settings, i18n } = services;
const contextMenus = buildContextMenus(services);
const commands = buildCommands(services);

// ---- boot ----
async function firstRun() {
  for (const preset of DEFAULT_SPACES) await spaces.create({ ...preset, name: i18n.t(preset.nameKey) });
  store.local[LOCAL.INITIALIZED] = true;
  await store.save(LOCAL.INITIALIZED);
}

// Session storage is empty after a browser restart or an extension reload:
// that is when tab ids changed and state must be re-derived.
async function restoreSession() {
  await spaces.reconcile();
  await items.rebind();
  store.session[SESSION.BOOTED] = true;
  await store.saveSession(SESSION.BOOTED);
}

let booting = null;
function booted() {
  booting ??= (async () => {
    await store.ready();
    await i18n.initI18n(store.settings.language);
    if (!store.local[LOCAL.INITIALIZED]) await firstRun();
    if (!store.session[SESSION.BOOTED]) await restoreSession();
    await live.updateBadge();
  })().catch((e) => {
    booting = null;
    console.error('[arcish] boot failed', e);
    throw e;
  });
  return booting;
}

// Every listener waits for boot and reports its own failures.
function on(event, handler) {
  event.addListener((...args) => {
    booted()
      .then(() => handler(...args))
      .catch((e) => console.error('[arcish]', e));
  });
}

// ---- reactions to settings changes ----
settings.onChange(async (changed, previous) => {
  if (changed.has('language')) {
    await i18n.initI18n(store.settings.language);
    installContextMenus(api, contextMenus, i18n);
  }
  if (changed.has('spaceMode')) await membership.migrate(previous.spaceMode);
  if (changed.has('githubToken') || changed.has('liveRefreshMinutes')) await live.refresh({ force: true });
});

// ---- wiring ----
wireBrowserEvents({ ...services, on });
new MessageRouter({ before: booted }).register(buildRoutes(services)).listen(api.runtime);

on(api.commands.onCommand, async (name, tab) => {
  const target = tab || (await tabs.active());
  if (target) await commands[name]?.(target);
});

on(api.contextMenus.onClicked, (info, tab) => contextMenus.find((m) => m.id === info.menuItemId)?.run(info, tab));

function setup() {
  api.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  booted().then(() => installContextMenus(api, contextMenus, i18n));
}

api.runtime.onInstalled.addListener(() => {
  scheduleAlarms(api);
  setup();
});
api.runtime.onStartup.addListener(setup);

booted();
