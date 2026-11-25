// Zap: pick page elements to hide permanently (stored as a Boost).
// Listeners exist only while the picker is active.
(() => {
  const content = globalThis.__arcishContent;
  if (!content) return;
  const { MSG, PUSH } = globalThis.__arcishProtocol;
  const MAX_DEPTH = 6;
  const MAX_CLASSES = 2;
  const VOLATILE = /\d{3,}/; // generated ids / class names are not stable selectors
  const STYLE = `
    .zapbox{position:fixed;border:2px solid #ff4d6d;background:rgba(255,77,109,.14);border-radius:4px;pointer-events:none;transition:all .05s}
    .zappill{position:fixed;top:14px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:8px;padding:6px 6px 6px 14px;border-radius:999px;
      background:#1d1b26;color:#fff;font-size:13px;box-shadow:0 8px 30px rgba(0,0,0,.3);pointer-events:auto}
    .zappill button{all:unset;cursor:pointer;padding:5px 12px;border-radius:999px;background:rgba(255,255,255,.12);font-size:12px}
    .zappill button.primary{background:#ff4d6d}`;

  let stop = null;

  const stableId = (el) => el.id && !VOLATILE.test(el.id);
  const isUnique = (selector) => {
    try {
      return document.querySelectorAll(selector).length === 1;
    } catch {
      return false;
    }
  };

  function selectorFor(el) {
    if (stableId(el) && isUnique(`#${CSS.escape(el.id)}`)) return `#${CSS.escape(el.id)}`;
    const parts = [];
    for (let cur = el; cur && cur !== document.documentElement && parts.length < MAX_DEPTH; cur = cur.parentElement) {
      if (stableId(cur) && cur !== el) {
        parts.unshift(`#${CSS.escape(cur.id)}`);
        break;
      }
      let part = cur.tagName.toLowerCase();
      const classes = [...cur.classList].filter((c) => /^[a-zA-Z][\w-]*$/.test(c) && !VOLATILE.test(c)).slice(0, MAX_CLASSES);
      if (classes.length) part += '.' + classes.map((c) => CSS.escape(c)).join('.');
      const siblings = cur.parentElement ? [...cur.parentElement.children].filter((c) => c.tagName === cur.tagName) : [];
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(cur) + 1})`;
      parts.unshift(part);
      if (isUnique(parts.join(' > '))) break;
    }
    return parts.join(' > ');
  }

  function start(ctx) {
    if (stop) return;
    const root = ctx.ui(STYLE);
    const box = Object.assign(document.createElement('div'), { className: 'zapbox' });
    const pill = Object.assign(document.createElement('div'), { className: 'zappill' });
    const label = Object.assign(document.createElement('span'), { textContent: ctx.t('zapHint') });
    const undo = Object.assign(document.createElement('button'), { textContent: ctx.t('zapUndo') });
    const done = Object.assign(document.createElement('button'), { textContent: ctx.t('zapDone'), className: 'primary' });
    pill.append(label, undo, done);
    root.append(box, pill);

    let target = null;
    const options = { capture: true };
    const onMove = (event) => {
      const el = event.composedPath()[0];
      if (!(el instanceof Element) || el.localName === 'arcish-ui') return;
      target = el;
      const r = el.getBoundingClientRect();
      Object.assign(box.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    };
    const onClick = (event) => {
      if (event.composedPath()[0]?.localName === 'arcish-ui') return;
      event.preventDefault();
      event.stopPropagation();
      if (target) ctx.send(MSG.BOOST_ZAP, { host: ctx.host, selector: selectorFor(target) });
    };
    const onKey = (event) => {
      if (event.key === 'Escape') stop();
    };
    stop = () => {
      document.removeEventListener('mousemove', onMove, options);
      document.removeEventListener('click', onClick, options);
      document.removeEventListener('keydown', onKey, options);
      box.remove();
      pill.remove();
      stop = null;
    };
    undo.addEventListener('click', () => ctx.send(MSG.BOOST_UNDO_ZAP, { host: ctx.host }));
    done.addEventListener('click', () => stop());
    document.addEventListener('mousemove', onMove, options);
    document.addEventListener('click', onClick, options);
    document.addEventListener('keydown', onKey, options);
  }

  content.register({ push: { [PUSH.ZAP_START]: (_, ctx) => start(ctx) } });
})();
