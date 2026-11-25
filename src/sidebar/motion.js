// Motion for the sidebar, kept apart from rendering. Structural changes
// (a row appearing, a tab closing, a space sliding in) are animated with the
// Web Animations API so they survive re-renders; simple state changes use CSS
// transitions in the stylesheet. Everything is skipped when the user asked
// for reduced motion.
const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
const DURATION = Object.freeze({ row: 150, tile: 140, fade: 140, slide: 240, cascade: 180 });
const CASCADE_STEP_MS = 18; // delay between consecutive items of a cascade
const CASCADE_MAX = 14; // items animated individually; the rest appear with the last one
const LIST_GAP = 2; // px, the gap between rows (see .pinned/.today in the stylesheet)

export function motionEnabled() {
  return typeof Element.prototype.animate === 'function' && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

// Keyframe builders: (element) => frames for entering; leaving runs them backwards.
// A row opens its space first and then fades its content in (and the reverse
// when leaving), so text and icons are never seen being squeezed.
const CONTENT_PHASE = 0.45; // share of the animation spent on the fade
const grow = (el) => {
  const height = `${el.offsetHeight}px`;
  return [
    { height: '0px', opacity: 0, marginTop: `-${LIST_GAP}px`, overflow: 'hidden', offset: 0 },
    { height, opacity: 0, marginTop: '0px', overflow: 'hidden', offset: 1 - CONTENT_PHASE },
    { height, opacity: 1, marginTop: '0px', overflow: 'hidden', offset: 1 },
  ];
};
const pop = () => [{ transform: 'scale(0.6)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }];
const rise = () => [{ transform: 'translateY(8px)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }];
const reversed = (frames) => frames.map((frame) => ({ ...frame, offset: frame.offset === undefined ? undefined : 1 - frame.offset })).reverse();

// Items appear one after another.
export function cascade(items) {
  if (!motionEnabled()) return;
  [...items].forEach((el, i) => {
    el.animate(rise(), { duration: DURATION.cascade, delay: Math.min(i, CASCADE_MAX) * CASCADE_STEP_MS, easing: EASE, fill: 'backwards' });
  });
}

// selector -> how matching elements enter (and, reversed, leave); `run` replaces the default animation
const RULES = [
  { selector: '.lib-list', run: (el) => cascade(el.children) },
  { selector: '.row, .media-card, .group-head, .lib-day', frames: grow, duration: DURATION.row, leaves: true },
  { selector: '.fav', frames: pop, duration: DURATION.tile, leaves: true },
  { selector: '.selbar, .favs-empty, .empty-pinned', frames: rise, duration: DURATION.fade, leaves: false },
];

const ruleFor = (el) => RULES.find((rule) => el.matches(rule.selector));

// Hooks for the DOM patcher.
export const motion = {
  enter(el) {
    const rule = motionEnabled() && ruleFor(el);
    if (!rule) return;
    if (rule.run) rule.run(el);
    else el.animate(rule.frames(el), { duration: rule.duration, easing: EASE });
  },
  leave(el) {
    const rule = motionEnabled() && ruleFor(el);
    if (!rule?.leaves) return null;
    return el.animate(reversed(rule.frames(el)), { duration: rule.duration, easing: EASE, fill: 'forwards' }).finished.catch(() => {});
  },
};

// A frozen copy of what the scroll area shows, laid exactly over it.
export function snapshot(scroller) {
  const pane = scroller.querySelector('.pane');
  if (!pane) return null;
  const box = scroller.getBoundingClientRect();
  const style = getComputedStyle(scroller);
  const ghost = document.createElement('div');
  ghost.className = 'pane-ghost';
  Object.assign(ghost.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px`, padding: style.padding });
  const copy = pane.cloneNode(true);
  copy.style.transform = `translateY(${-scroller.scrollTop}px)`;
  ghost.appendChild(copy);
  return ghost;
}

// Slide the old content out and the new content in. `direction` is 1 when the
// new content comes from the right, -1 when it comes from the left.
export function slidePanes(scroller, ghost, direction) {
  const pane = scroller.querySelector('.pane');
  if (!pane || !ghost) return;
  const options = { duration: DURATION.slide, easing: EASE };
  document.body.appendChild(ghost);
  scroller.scrollTop = 0;
  ghost.animate([{ transform: 'translateX(0)', opacity: 1 }, { transform: `translateX(${-direction * 100}%)`, opacity: 0 }], options).finished.finally(() => ghost.remove());
  pane.animate([{ transform: `translateX(${direction * 100}%)`, opacity: 0 }, { transform: 'translateX(0)', opacity: 1 }], options);
}
