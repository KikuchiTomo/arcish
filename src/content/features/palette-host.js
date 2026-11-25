// Hosts the command bar as an overlay iframe. If the frame does not report
// ready in time (e.g. the page's policy blocked it) the overlay is removed and
// the service worker opens the command bar in its own window instead.
(() => {
  const content = globalThis.__arcishContent;
  if (!content) return;
  const { MSG, PUSH, FRAME, PALETTE_HOST, PALETTE_PATH, PALETTE_READY_TIMEOUT_MS } = globalThis.__arcishProtocol;
  const FRAME_STYLE =
    'all:initial;position:fixed;inset:0;width:100vw;height:100vh;border:0;z-index:2147483647;background:transparent;color-scheme:normal;display:block;';

  let frame = null;
  let previousFocus = null;
  let readyTimer = null;
  let ctx = null;

  function onFrameMessage(event) {
    if (!frame || event.source !== frame.contentWindow || event.data?.channel !== FRAME.CHANNEL) return;
    if (event.data.type === FRAME.READY) clearTimeout(readyTimer);
    if (event.data.type === FRAME.CLOSE) close();
    if (event.data.type === FRAME.TOAST) ctx.toast(event.data.text);
  }

  function close() {
    if (!frame) return;
    clearTimeout(readyTimer);
    window.removeEventListener('message', onFrameMessage);
    frame.remove();
    frame = null;
    try {
      previousFocus?.focus?.();
    } catch {
      /* the element may be gone */
    }
  }

  function open(mode) {
    close();
    previousFocus = document.activeElement;
    const params = new URLSearchParams({ host: PALETTE_HOST.OVERLAY, mode });
    frame = document.createElement('iframe');
    frame.src = `${chrome.runtime.getURL(PALETTE_PATH)}?${params}`;
    frame.allow = 'clipboard-write';
    frame.style.cssText = FRAME_STYLE;
    frame.addEventListener('load', () => frame?.focus());
    window.addEventListener('message', onFrameMessage);
    document.documentElement.appendChild(frame);
    readyTimer = setTimeout(() => {
      close();
      ctx.send(MSG.PALETTE_FALLBACK, { mode });
    }, PALETTE_READY_TIMEOUT_MS);
  }

  content.register({
    init(context) {
      ctx = context;
    },
    push: { [PUSH.PALETTE_OPEN]: (message) => open(message.mode) },
  });
})();
