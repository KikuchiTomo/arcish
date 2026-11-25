// Toasts, clipboard and the Little Window toolbar.
(() => {
  const content = globalThis.__arcishContent;
  if (!content) return;
  const { MSG, PUSH } = globalThis.__arcishProtocol;
  const BAR_STYLE = `
    .bar{position:fixed;top:10px;right:10px;display:flex;gap:4px;padding:4px;border-radius:12px;background:rgba(30,28,38,.78);
      backdrop-filter:blur(16px);box-shadow:0 6px 24px rgba(0,0,0,.25);pointer-events:auto;opacity:.5;transition:opacity .15s}
    .bar:hover{opacity:1}
    .bar button{all:unset;cursor:pointer;color:#fff;font-size:12px;font-weight:500;padding:6px 10px;border-radius:8px}
    .bar button:hover{background:rgba(255,255,255,.14)}`;

  async function copy(text, ctx) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard API needs focus/permission; fall back to a hidden textarea.
      const area = Object.assign(document.createElement('textarea'), { value: text });
      area.style.cssText = 'position:fixed;opacity:0';
      document.documentElement.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    ctx.toast(ctx.t('toastUrlCopied'));
  }

  // Shown only inside Little Windows: send the page to the main window.
  function miniToolbar(ctx) {
    const bar = Object.assign(document.createElement('div'), { className: 'bar' });
    const toMain = Object.assign(document.createElement('button'), { textContent: `⤢ ${ctx.t('miniOpenInMain')}` });
    const copyUrl = Object.assign(document.createElement('button'), { textContent: '⎘', title: ctx.t('miniCopyUrl') });
    toMain.addEventListener('click', () => ctx.send(MSG.MINI_TO_MAIN));
    copyUrl.addEventListener('click', () => copy(location.href, ctx));
    bar.append(toMain, copyUrl);
    ctx.ui(BAR_STYLE).appendChild(bar);
  }

  content.register({
    push: {
      [PUSH.TOAST]: (message, ctx) => ctx.toast(message.text),
      [PUSH.COPY]: (message, ctx) => copy(message.text, ctx),
    },
    onHello(hello, ctx) {
      if (hello.mini) ctx.whenBody(() => miniToolbar(ctx));
    },
  });
})();
