// Composition root: builds the service object graph. Every dependency is
// passed in explicitly, so the graph can be built against a fake browser API
// in tests.
import { liveSource } from '../live-sources/index.js';
import * as i18n from '../shared/i18n.js';
import { BindingRegistry } from './core/bindings.js';
import { KeyedMutex } from './core/mutex.js';
import { StateStore } from './core/store.js';
import { TabAuthority } from './core/tab-authority.js';
import { WindowClassifier } from './core/window-classifier.js';
import { ArchiveService } from './services/archive-service.js';
import { BoostService } from './services/boost-service.js';
import { CommandBarService } from './services/command-bar-service.js';
import { DisplayService } from './services/display-service.js';
import { ItemService } from './services/item-service.js';
import { LiveFolderService } from './services/live-folder-service.js';
import { MediaService } from './services/media-service.js';
import { Membership } from './services/membership/index.js';
import { MiniWindowService } from './services/mini-window-service.js';
import { SettingsService } from './services/settings-service.js';
import { SpaceService } from './services/space-service.js';
import { SplitService } from './services/split-service.js';
import { TabService } from './services/tab-service.js';

export function createServices(api, { sources = liveSource } = {}) {
  const store = new StateStore(api);
  const mutex = new KeyedMutex();
  const windows = new WindowClassifier({ api, store });
  const bindings = new BindingRegistry({ api, store });
  const authority = new TabAuthority({ store, bindings });
  const display = new DisplayService({ api });
  const spaces = new SpaceService({ api, store, windows, mutex, i18n });
  const membership = new Membership({ api, store, mutex, spaces, authority });
  spaces.useMembership(membership);
  const live = new LiveFolderService({ api, store, sources, i18n });
  const items = new ItemService({ api, store, bindings, spaces, live, authority, mutex, i18n });
  const archive = new ArchiveService({ api, store, spaces, bindings, windows });
  const split = new SplitService({ api, store, i18n });
  const mini = new MiniWindowService({ api, store, spaces, display });
  const commandBar = new CommandBarService({ api });
  const tabs = new TabService({ api, spaces, split, mini });
  const media = new MediaService({ api, store });
  const boosts = new BoostService({ store });
  const settings = new SettingsService({ store });
  return { api, store, spaces, membership, bindings, windows, display, items, live, archive, split, mini, commandBar, tabs, media, boosts, settings, i18n };
}
