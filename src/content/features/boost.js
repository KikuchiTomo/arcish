// Boosts: per-site custom CSS and zapped elements. A <style> element exists
// only on sites that actually have a boost.
(() => {
  const content = globalThis.__arcishContent;
  if (!content) return;
  const { LOCAL } = globalThis.__arcishProtocol;
  const STYLE_ID = 'arcish-boost';
  let style = null;

  function cssFor(boost) {
    if (!boost || boost.enabled === false) return '';
    return [boost.css || '', ...(boost.zaps || []).map((selector) => `${selector}{display:none!important}`)].join('\n').trim();
  }

  function apply(boosts, host) {
    const css = cssFor(boosts?.[host]);
    if (!css) {
      style?.remove();
      style = null;
      return;
    }
    style ??= Object.assign(document.createElement('style'), { id: STYLE_ID });
    style.textContent = css;
    if (!style.isConnected) (document.head || document.documentElement).appendChild(style);
  }

  content.register({
    init(ctx) {
      chrome.storage.local.get(LOCAL.BOOSTS).then((stored) => apply(stored[LOCAL.BOOSTS], ctx.host));
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes[LOCAL.BOOSTS]) apply(changes[LOCAL.BOOSTS].newValue, ctx.host);
      });
    },
  });
})();
