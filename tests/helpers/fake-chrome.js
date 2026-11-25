// A small in-memory stand-in for the parts of the Chrome extension API the
// services use. Behaviour follows Chrome where it matters to the services:
// pinned tabs leave their group, closing a window's last tab closes the
// window, tab ids are unique and never reused.
const NO_GROUP = -1;
const NO_SPLIT = -1;

// chrome.events.Event stand-in.
function event() {
  const listeners = [];
  return { addListener: (fn) => void listeners.push(fn), emit: (...args) => listeners.forEach((fn) => fn(...args)) };
}

function storageArea(area, onChanged) {
  const data = {};
  return {
    data,
    async get(keys) {
      if (keys == null) return structuredClone(data);
      const list = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(list.filter((k) => k in data).map((k) => [k, structuredClone(data[k])]));
    },
    async set(values) {
      const changes = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { oldValue: data[key], newValue: structuredClone(value) }]));
      Object.assign(data, structuredClone(values));
      onChanged.emit(changes, area);
    },
  };
}

export function createFakeChrome() {
  let nextId = 1;
  const tabs = new Map();
  const windows = new Map();
  const groups = new Map();
  const sent = []; // messages pushed to tabs
  const badge = { text: '' };
  const downloads = []; // DownloadItem-like objects shown by the Library
  const opened = []; // download ids opened

  const tabsOf = (windowId) => [...tabs.values()].filter((t) => t.windowId === windowId).sort((a, b) => a.index - b.index);
  const reindex = (windowId) => tabsOf(windowId).forEach((t, i) => (t.index = i));
  const copy = (value) => structuredClone(value);
  const must = (map, id, what) => {
    if (!map.has(id)) throw new Error(`No ${what} with id: ${id}`);
    return map.get(id);
  };
  const dropEmptyGroups = () => {
    for (const id of groups.keys()) if (![...tabs.values()].some((t) => t.groupId === id)) groups.delete(id);
  };

  function addWindow({ type = 'normal', left = 0, top = 0, width = 1200, height = 800, focused = true } = {}) {
    const win = { id: nextId++, type, left, top, width, height, state: 'normal', focused };
    windows.set(win.id, win);
    return win;
  }

  function addTab({ windowId, url = 'chrome://newtab/', title, active = false, pinned = false, openerTabId } = {}) {
    const tab = { id: nextId++, windowId, url, title: title ?? url, active, pinned, groupId: NO_GROUP, splitViewId: NO_SPLIT, index: tabsOf(windowId).length, lastAccessed: Date.now(), audible: false, mutedInfo: { muted: false }, openerTabId };
    if (active) for (const t of tabsOf(windowId)) t.active = false;
    tabs.set(tab.id, tab);
    return tab;
  }

  const storageChanged = event();
  const tabEvent = event(); // fired after any change to tabs (UI models just reload)
  const tabsChanged = () => tabEvent.emit(0, {});
  let messageHandler = null; // set by tests that route runtime messages to the services

  const api = {
    storage: { local: storageArea('local', storageChanged), session: storageArea('session', storageChanged), onChanged: storageChanged },
    runtime: {
      getURL: (path) => `chrome-extension://fake/${path.replace(/^\//, '')}`,
      openOptionsPage: async () => {},
      onMessage: event(),
      sendMessage: async (message) => (messageHandler ? messageHandler(message) : undefined),
    },
    bookmarks: { search: async () => [] },
    downloads: { search: async () => downloads, getFileIcon: async () => null, open: async (id) => void opened.push(id), show: () => {}, onCreated: event(), onChanged: event(), onErased: event() },
    history: { search: async () => [] },
    sidePanel: { open: async () => {} },
    i18n: { getMessage: (key, subs = []) => [key, ...subs].join(' '), getUILanguage: () => 'en' },
    action: { setBadgeText: async ({ text }) => void (badge.text = text), setBadgeBackgroundColor: async () => {} },
    system: { display: { getInfo: async () => [{ isPrimary: true, bounds: { left: 0, top: 0, width: 1600, height: 1000 }, workArea: { left: 0, top: 0, width: 1600, height: 1000 } }] } },
    scripting: { executeScript: async () => [] },
    tabs: {
      onCreated: tabEvent,
      onRemoved: tabEvent,
      onUpdated: { addListener: (fn) => tabEvent.addListener(() => fn(0, { title: '' })) },
      onMoved: tabEvent,
      onActivated: tabEvent,
      onAttached: tabEvent,
      onDetached: tabEvent,
      onReplaced: tabEvent,
      async getCurrent() {
        return undefined;
      },
      async goBack() {},
      async goForward() {},
      async reload() {},
      async get(id) {
        return copy(must(tabs, id, 'tab'));
      },
      async query(q = {}) {
        return [...tabs.values()]
          .filter((t) => (q.windowId == null || t.windowId === q.windowId) && (q.active == null || t.active === q.active) && (q.windowType == null || windows.get(t.windowId)?.type === q.windowType))
          .sort((a, b) => a.windowId - b.windowId || a.index - b.index)
          .map(copy);
      },
      async create({ windowId, url, active = true, pinned = false } = {}) {
        return copy(addTab({ windowId: windowId ?? [...windows.keys()][0], url, active, pinned }));
      },
      async update(id, props) {
        const tab = must(tabs, id, 'tab');
        if (props.active) for (const t of tabsOf(tab.windowId)) t.active = t.id === id;
        if (props.pinned !== undefined) {
          tab.pinned = props.pinned;
          if (props.pinned) tab.groupId = NO_GROUP;
          dropEmptyGroups();
        }
        if (props.url) tab.url = props.url;
        if (props.muted !== undefined) tab.mutedInfo = { muted: props.muted };
        return copy(tab);
      },
      async remove(ids) {
        for (const id of [].concat(ids)) {
          const tab = tabs.get(id);
          if (!tab) continue;
          tabs.delete(id);
          reindex(tab.windowId);
          if (!tabsOf(tab.windowId).length) windows.delete(tab.windowId);
        }
        dropEmptyGroups();
      },
      async move(id, { windowId, index }) {
        const tab = must(tabs, id, 'tab');
        const from = tab.windowId;
        if (windowId != null && windowId !== from) {
          tab.windowId = windowId;
          tab.groupId = NO_GROUP;
          tab.active = false;
        }
        const siblings = tabsOf(tab.windowId).filter((t) => t.id !== id);
        siblings.splice(index < 0 ? siblings.length : index, 0, tab);
        siblings.forEach((t, i) => (t.index = i));
        if (from !== tab.windowId) {
          reindex(from);
          if (!tabsOf(from).length) windows.delete(from);
        }
        dropEmptyGroups();
        return copy(tab);
      },
      async group({ tabIds, groupId, createProperties }) {
        const ids = [].concat(tabIds);
        let id = groupId;
        if (id == null) {
          id = nextId++;
          groups.set(id, { id, windowId: createProperties?.windowId ?? must(tabs, ids[0], 'tab').windowId, title: '', color: 'grey', collapsed: false });
        }
        for (const tabId of ids) {
          const tab = must(tabs, tabId, 'tab');
          if (tab.pinned) throw new Error('Pinned tabs cannot be grouped.');
          tab.groupId = id;
        }
        dropEmptyGroups();
        return id;
      },
      async ungroup(ids) {
        for (const id of [].concat(ids)) must(tabs, id, 'tab').groupId = NO_GROUP;
        dropEmptyGroups();
      },
      async createSplit(ids) {
        if (!Array.isArray(ids) || ids.length !== 2) throw new Error('No matching signature.');
        const splitViewId = nextId++;
        for (const id of ids) must(tabs, id, 'tab').splitViewId = splitViewId;
        return splitViewId;
      },
      async unsplit(splitViewId) {
        for (const tab of tabs.values()) if (tab.splitViewId === splitViewId) tab.splitViewId = NO_SPLIT;
      },
      async duplicate(id) {
        const tab = must(tabs, id, 'tab');
        return copy(addTab({ windowId: tab.windowId, url: tab.url, title: tab.title }));
      },
      async sendMessage(id, message) {
        must(tabs, id, 'tab');
        sent.push({ tabId: id, message });
      },
    },
    tabGroups: {
      onCreated: tabEvent,
      onUpdated: tabEvent,
      onRemoved: tabEvent,
      async query(q = {}) {
        return [...groups.values()].filter((g) => q.windowId == null || g.windowId === q.windowId).map(copy);
      },
      async update(id, props) {
        return copy(Object.assign(must(groups, id, 'group'), props));
      },
    },
    windows: {
      async getCurrent() {
        return copy([...windows.values()].find((w) => w.type === 'normal'));
      },
      async get(id) {
        return copy(must(windows, id, 'window'));
      },
      async getAll({ populate = false, windowTypes } = {}) {
        return [...windows.values()].filter((w) => !windowTypes || windowTypes.includes(w.type)).map((w) => ({ ...copy(w), ...(populate ? { tabs: tabsOf(w.id).map(copy) } : {}) }));
      },
      async getLastFocused() {
        return copy([...windows.values()].find((w) => w.focused) || [...windows.values()][0]);
      },
      async update(id, props) {
        return copy(Object.assign(must(windows, id, 'window'), props));
      },
      async create({ tabId, url, type = 'normal', left = 0, top = 0, width = 800, height = 600 } = {}) {
        const win = addWindow({ type, left, top, width, height, focused: false });
        if (tabId != null) await api.tabs.move(tabId, { windowId: win.id, index: 0 });
        else addTab({ windowId: win.id, url, active: true });
        if (tabId != null) tabs.get(tabId).active = true;
        return copy(win);
      },
      async remove(id) {
        for (const t of tabsOf(id)) tabs.delete(t.id);
        windows.delete(id);
      },
    },
  };

  // Notify UI models after every mutating tabs/windows call.
  for (const area of [api.tabs, api.tabGroups, api.windows]) {
    for (const name of ['create', 'update', 'remove', 'move', 'group', 'ungroup', 'duplicate', 'createSplit', 'unsplit']) {
      const original = area[name];
      if (!original) continue;
      area[name] = async (...args) => {
        const result = await original(...args);
        tabsChanged();
        return result;
      };
    }
  }

  return { api, addWindow, addTab, tabs, windows, groups, sent, badge, downloads, opened, tab: (id) => tabs.get(id), tabsOf, tabsChanged, routeMessages: (handler) => void (messageHandler = handler) };
}
