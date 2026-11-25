// Content script core. Loaded as a classic script (after shared/protocol.js)
// so it works on every page regardless of the page's CSP. Design rules:
//   - nothing is added to the page until a feature actually needs UI
//   - page key presses are never intercepted
//   - top frame only
(() => {
  if (globalThis.__arcishContent || window.top !== window) return;

  const { MSG, LOCAL, TOAST_MS } = globalThis.__arcishProtocol;
  const features = [];
  const pushHandlers = new Map();
  let strings = {};
  let settings = {};
  let shadow = null;
  let toastTimer = null;

  const UI_STYLE = `
    :host{all:initial}
    *{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Hiragino Sans","Noto Sans JP",system-ui,sans-serif}
    .toast{position:fixed;left:50%;bottom:28px;transform:translate(-50%,12px);opacity:0;background:rgba(28,26,36,.92);color:#fff;
      padding:9px 16px;border-radius:12px;font-size:13px;font-weight:500;box-shadow:0 8px 30px rgba(0,0,0,.25);
      transition:opacity .18s ease,transform .18s cubic-bezier(.2,.8,.2,1)}
    .toast.show{opacity:1;transform:translate(-50%,0)}`;

  const ctx = {
    host: location.host,
    send: (type, payload = {}) => chrome.runtime.sendMessage({ type, ...payload }).catch(() => null),
    t: (key) => strings[key] || key,
    get settings() {
      return settings;
    },
    // Shadow root for extension UI; created on first use, isolated from page CSS.
    ui(extraStyle = '') {
      if (!shadow?.host.isConnected) {
        const host = document.createElement('arcish-ui');
        host.style.cssText = 'all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483647;';
        shadow = host.attachShadow({ mode: 'closed' });
        shadow.appendChild(Object.assign(document.createElement('style'), { textContent: UI_STYLE }));
        (document.body || document.documentElement).appendChild(host);
      }
      if (extraStyle && !shadow.querySelector(`style[data-for="${CSS.escape(extraStyle.slice(0, 24))}"]`)) {
        const style = Object.assign(document.createElement('style'), { textContent: extraStyle });
        style.dataset.for = extraStyle.slice(0, 24);
        shadow.appendChild(style);
      }
      return shadow;
    },
    toast(text) {
      const root = ctx.ui();
      const el = root.querySelector('.toast') || root.appendChild(Object.assign(document.createElement('div'), { className: 'toast' }));
      el.textContent = text;
      requestAnimationFrame(() => el.classList.add('show'));
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => el.classList.remove('show'), TOAST_MS);
    },
    whenBody(fn) {
      if (document.body) fn();
      else document.addEventListener('DOMContentLoaded', fn, { once: true });
    },
  };

  globalThis.__arcishContent = {
    // feature: { init?(ctx), push?: { [type]: (message) => void }, onHello?(hello, ctx), onSettings?(settings, ctx) }
    register(feature) {
      features.push(feature);
    },
    start() {
      for (const f of features) {
        f.init?.(ctx);
        for (const [type, handler] of Object.entries(f.push || {})) pushHandlers.set(type, handler);
      }
      chrome.runtime.onMessage.addListener((message, _sender, respond) => {
        const handler = pushHandlers.get(message?.type);
        if (!handler) return false;
        handler(message, ctx);
        respond({ ok: true });
        return false;
      });
      chrome.storage.local.get(LOCAL.SETTINGS).then((stored) => {
        settings = stored[LOCAL.SETTINGS] || {};
      });
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes[LOCAL.SETTINGS]) settings = changes[LOCAL.SETTINGS].newValue || {};
      });
      ctx.send(MSG.CONTENT_HELLO).then((res) => {
        const hello = res?.data;
        if (!hello) return;
        strings = hello.strings || {};
        for (const f of features) f.onHello?.(hello, ctx);
      });
    },
  };
})();
