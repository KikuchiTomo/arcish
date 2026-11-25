// Peek (opt-in): shift+click opens a link in a Little Window instead of a new
// browser window. Listens in the bubble phase and stands down whenever the
// page handled the click itself, so web apps that use shift+click keep working.
(() => {
  const content = globalThis.__arcishContent;
  if (!content) return;
  const { MSG } = globalThis.__arcishProtocol;
  const WEB_LINK = /^https?:/;

  function linkFrom(event) {
    const anchor = event.composedPath().find((n) => n instanceof HTMLAnchorElement && n.href);
    if (!anchor || !WEB_LINK.test(anchor.href) || anchor.hasAttribute('download')) return null;
    const url = new URL(anchor.href);
    const samePage = url.origin === location.origin && url.pathname === location.pathname && url.search === location.search;
    return samePage ? null : anchor;
  }

  content.register({
    init(ctx) {
      window.addEventListener('click', (event) => {
        if (!ctx.settings.peekShiftClick || event.defaultPrevented) return;
        if (!event.shiftKey || event.metaKey || event.ctrlKey || event.altKey || event.button !== 0) return;
        if (event.target instanceof Element && event.target.closest('[contenteditable=""], [contenteditable="true"]')) return;
        const anchor = linkFrom(event);
        if (!anchor) return;
        event.preventDefault();
        ctx.send(MSG.MINI_OPEN, { url: anchor.href });
      });
    },
  });
})();
