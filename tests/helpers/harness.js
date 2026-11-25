// Builds the real service graph on top of the fake browser API.
import { createFakeChrome } from './fake-chrome.js';

export async function createHarness({ settings = {}, sources } = {}) {
  const fake = createFakeChrome();
  globalThis.chrome = fake.api; // shared modules (i18n, url helpers) read the global
  const { createServices } = await import('../../src/background/container.js');
  const { LOCAL, SESSION } = await import('../../src/shared/storage-keys.js');

  const win = fake.addWindow();
  const first = fake.addTab({ windowId: win.id, url: 'https://start.example/', active: true });

  const services = createServices(fake.api, sources ? { sources } : undefined);
  await services.store.ready();
  Object.assign(services.store.settings, settings);
  const personal = await services.spaces.create({ name: 'Personal' });
  const work = await services.spaces.create({ name: 'Work' });
  await services.spaces.reconcile();
  await services.items.rebind();

  // What the browser-event wiring does when a tab appears / goes away.
  const openTab = async (props) => {
    const tab = fake.addTab({ windowId: win.id, ...props });
    await services.spaces.adopt(tab.id);
    return tab;
  };
  const closeTab = async (tabId) => {
    await fake.api.tabs.remove(tabId);
    await services.bindings.unbindTab(tabId);
    await services.membership.onTabRemoved(tabId);
  };

  return { ...services, fake, win, first, personal, work, openTab, closeTab, LOCAL, SESSION };
}
