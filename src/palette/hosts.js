// Where the command bar is running. Each host knows how to find the tab it
// serves, how to close itself and how to surface a toast.
import { FRAME, MSG, PALETTE_HOST, PUSH, rpc } from '../shared/messages.js';

const post = (type, extra = {}) => window.parent.postMessage({ channel: FRAME.CHANNEL, type, ...extra }, '*');
const activeTab = async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0] || null;
const tabById = (id) => chrome.tabs.get(Number(id)).catch(() => null);

const HOSTS = {
  // An iframe laid over the page the user is on.
  [PALETTE_HOST.OVERLAY]: {
    tab: async () => (await chrome.tabs.getCurrent()) || activeTab(),
    ready: () => post(FRAME.READY),
    close: () => post(FRAME.CLOSE),
    toast: (text) => post(FRAME.TOAST, { text }),
  },
  // An iframe inside the sidebar. Used when the command bar is opened from the
  // sidebar: keyboard focus is already there, and a page cannot take it over.
  [PALETTE_HOST.PANEL]: {
    tab: (params) => (params.get('tabId') ? tabById(params.get('tabId')) : activeTab()),
    ready: () => {},
    close: () => post(FRAME.CLOSE),
    toast: (text) => post(FRAME.TOAST, { text }),
  },
  // A small standalone window (pages where an overlay is impossible).
  [PALETTE_HOST.WINDOW]: {
    tab: (params) => (params.get('tabId') ? tabById(params.get('tabId')) : activeTab()),
    ready: () => {},
    close: () => window.close(),
    closeOnBlur: true,
    toast: (text, tab) => tab && chrome.tabs.sendMessage(tab.id, { type: PUSH.TOAST, text }).catch(() => {}),
  },
  // The launcher page of a Little Window: results open in this very window.
  [PALETTE_HOST.MINI]: {
    tab: () => chrome.tabs.getCurrent(),
    ready: () => {},
    close: () => {},
    toast: () => {},
    navigate: (url) => location.assign(url),
    // Send the URL to the main window instead and close this Little Window.
    promote: async (url) => {
      await rpc(MSG.TAB_OPEN, { url });
      window.close();
    },
  },
};

export function resolveHost(params) {
  const kind = document.body.dataset.host || params.get('host');
  return { kind, ...(HOSTS[kind] || HOSTS[PALETTE_HOST.WINDOW]) };
}
