// Draws the parts of Chrome that surround the extension — the tab strip, the
// toolbar and the side panel's header — from the tabs the demo window really
// has, so the images show the sidebar where it actually lives.
// Plain script shared by compose.html and film.html; styles in chrome-frame.css.
const chromeFrame = (() => {
  const PATHS = {
    back: 'M13 8H3.5M7.5 4l-4 4 4 4',
    forward: 'M3 8h9.5M8.5 4l4 4-4 4',
    reload: 'M13 8a5 5 0 1 1-1.5-3.55M13 3v3h-3',
    plus: 'M8 3.5v9M3.5 8h9',
    chevron: 'M4.5 6.5 8 10l3.5-3.5',
    close: 'M4.5 4.5l7 7M11.5 4.5l-7 7',
    tune: 'M3 5.5h4.5M11.5 5.5H13M3 10.5h1.5M8.5 10.5H13M8 5.5a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0M5 10.5a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0',
    star: 'M8 2.6l1.65 3.4 3.75.5-2.7 2.6.65 3.7L8 11l-3.35 1.8.65-3.7-2.7-2.6 3.75-.5Z',
    puzzle: 'M6.2 3.6a1.5 1.5 0 0 1 3 0v.4h2.6a.8.8 0 0 1 .8.8v2.4H12a1.5 1.5 0 0 0 0 3h.6v2.4a.8.8 0 0 1-.8.8H9.4V13a1.5 1.5 0 0 0-3 0v.4H3.8a.8.8 0 0 1-.8-.8v-2.4h.4a1.5 1.5 0 0 0 0-3H3V4.8a.8.8 0 0 1 .8-.8h2.4Z',
    pin: 'M6 2.5h4l-.5 4 2 2.5h-7l2-2.5ZM8 9v4.5',
  };
  const SOLID = { menu: 'M8 2.4a1.15 1.15 0 1 0 0 2.3a1.15 1.15 0 0 0 0-2.3M8 6.85a1.15 1.15 0 1 0 0 2.3a1.15 1.15 0 0 0 0-2.3M8 11.3a1.15 1.15 0 1 0 0 2.3a1.15 1.15 0 0 0 0-2.3' };
  const icon = (name) => (SOLID[name] ? `<svg class="cf-solid" viewBox="0 0 16 16"><path d="${SOLID[name]}"/></svg>` : `<svg viewBox="0 0 16 16"><path d="${PATHS[name]}"/></svg>`);
  const escape = (text) => String(text).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
  const isExtensionPage = (url) => url.startsWith('chrome-extension://');

  const tab = (t, extension) => {
    const image = t.icon || (isExtensionPage(t.url) ? extension.icon : '');
    const picture = image ? `<img src="${escape(image)}">` : '<i class="cf-blank"></i>';
    const classes = ['cf-tab', t.pinned && 'cf-pinned', t.active && 'cf-active'].filter(Boolean).join(' ');
    return `<div class="${classes}">${picture}${t.pinned ? '' : `<span class="cf-title">${escape(t.title)}</span>`}${t.active && !t.pinned ? icon('close') : ''}</div>`;
  };

  // What the address bar shows: the site without its scheme, or the
  // extension's name in front of an extension page's address.
  const address = (url, extension) => {
    if (isExtensionPage(url)) return `<span class="cf-url">${escape(extension.name)} <span class="cf-rest">| ${escape(url.split('#')[0])}</span></span>`;
    const { hostname, pathname } = new URL(url);
    return `<span class="cf-url">${escape(hostname)}<span class="cf-rest">${pathname === '/' ? '' : escape(pathname)}</span></span>`;
  };

  // Tab strip and toolbar for one state of the window.
  // tabs: [{ title, url, icon, pinned, active }], extension: { name, icon }
  const bars = ({ tabs, extension }) => {
    const active = tabs.find((t) => t.active) || tabs[0];
    return `<div class="cf-strip"><div class="cf-lights"><i></i><i></i><i></i></div><div class="cf-tabs">${tabs.map((t) => tab(t, extension)).join('')}</div>
      <div class="cf-strip-tools">${icon('plus')}${icon('chevron')}</div></div>
      <div class="cf-toolbar">${icon('back')}${icon('forward')}${icon('reload')}
        <div class="cf-omnibox">${icon('tune')}${address(active.url, extension)}${icon('star')}</div>
        ${icon('puzzle')}<img class="cf-ext" src="${escape(extension.icon)}"><i class="cf-avatar"></i>${icon('menu')}</div>`;
  };

  // The header Chrome puts on top of every side panel.
  const panelHead = ({ extension }) => `<div class="cf-panel-head"><img src="${escape(extension.icon)}"><span>${escape(extension.name)}</span>${icon('pin')}${icon('close')}</div>`;

  // Heights in units of --u, for pages that position things around the frame.
  const UNITS = { bars: 76, panelHead: 40 };

  return { bars, panelHead, UNITS };
})();
