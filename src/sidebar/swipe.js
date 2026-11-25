// Two-finger horizontal swipe between spaces, driven by the gesture itself:
// the current space follows the fingers and the neighbouring space comes in
// beside it. Letting go past the commit point finishes the switch; before it,
// everything slides back. There is no wrap-around: at the first or last space
// the gesture simply does nothing in that direction.
//
// Trackpads report swipes as a stream of wheel events with no "released"
// event, so the gesture ends when the stream pauses. Pausing does not by
// itself switch space: only letting go past the middle does (a quick flick
// gets there through the trackpad's inertia).
import { TIMINGS } from '../config/defaults.js';
import { spaceColor } from '../config/colors.js';
import { MSG } from '../shared/messages.js';
import { SIDEBAR_VIEW } from '../shared/storage-keys.js';
import { motionEnabled } from './motion.js';
import { renderSpacePane } from './render.js';

const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
const HORIZONTAL_BIAS = 1.2; // how much more horizontal than vertical a wheel event must be

export function installSwipe(ctx) {
  const { app, model, ui, act, render } = ctx;
  let gesture = null; // { direction, target, width, offset, pane, preview, from, to }
  let endTimer = null;
  let lockedUntil = 0;

  const root = document.documentElement;
  const mixColor = (g, progress) => root.style.setProperty('--space', `color-mix(in oklab, ${g.to} ${Math.round(progress * 100)}%, ${g.from})`);

  function begin(direction) {
    const index = model.spaces.findIndex((s) => s.id === model.spaceId);
    const target = model.spaces[index + direction];
    const scroller = app.querySelector('.scroll');
    const pane = scroller?.querySelector('.pane');
    if (!target || !pane) return null;
    // The neighbouring space, rendered from the same model with only the space swapped.
    const preview = document.createElement('div');
    preview.className = 'pane-ghost';
    const box = scroller.getBoundingClientRect();
    Object.assign(preview.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px`, padding: getComputedStyle(scroller).padding });
    preview.innerHTML = renderSpacePane(Object.create(model, { spaceId: { value: target.id } }), ui);
    document.body.appendChild(preview);
    ui.swiping = true;
    root.classList.add('swiping');
    return { direction, target, width: box.width, offset: 0, pane, preview, from: spaceColor(model.space), to: spaceColor(target) };
  }

  function apply(g) {
    const shift = g.offset * g.direction;
    g.pane.style.transform = `translateX(${-shift}px)`;
    g.preview.firstElementChild.style.transform = `translateX(${g.direction * g.width - shift}px)`;
    mixColor(g, g.offset / g.width);
  }

  async function settle(g, commit) {
    const end = commit ? g.width : 0;
    const remaining = Math.abs(end - g.offset) / g.width;
    const options = { duration: Math.max(120, TIMINGS.swipeSettleMs * remaining), easing: EASE, fill: 'forwards' };
    const slide = (el, from, to) => el.animate([{ transform: `translateX(${from}px)` }, { transform: `translateX(${to}px)` }], options);
    const shift = (offset) => offset * g.direction;
    const animations = [slide(g.pane, -shift(g.offset), -shift(end)), slide(g.preview.firstElementChild, g.direction * g.width - shift(g.offset), g.direction * g.width - shift(end))];
    mixColor(g, commit ? 1 : 0);
    await Promise.all(animations.map((a) => a.finished.catch(() => {})));
    animations.forEach((a) => a.cancel());
    g.pane.style.transform = '';
    g.preview.remove();
    root.classList.remove('swiping');
    ui.swiping = false;
    lockedUntil = Date.now() + TIMINGS.swipeCooldownMs; // swallow the trackpad's inertia
    if (commit) {
      model.showSpace(g.target.id);
      ui.shownSpaceId = g.target.id; // already in place: no second slide
      render();
      act(MSG.SPACE_SWITCH, { spaceId: g.target.id }).catch(() => {});
    } else {
      render();
    }
  }

  function end() {
    const g = gesture;
    gesture = null;
    if (g) settle(g, g.offset / g.width >= TIMINGS.swipeCommitRatio);
  }

  app.addEventListener(
    'wheel',
    (event) => {
      const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY) * HORIZONTAL_BIAS;
      if (!gesture && (!horizontal || ui.view !== SIDEBAR_VIEW.SPACE || ui.swiping || Date.now() < lockedUntil || !motionEnabled())) return;
      gesture ??= begin(Math.sign(event.deltaX));
      if (!gesture) return;
      gesture.offset = Math.min(gesture.width, Math.max(0, gesture.offset + event.deltaX * gesture.direction));
      apply(gesture);
      clearTimeout(endTimer);
      endTimer = setTimeout(end, TIMINGS.swipeEndMs);
    },
    { passive: true },
  );
}
