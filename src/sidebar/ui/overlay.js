// Overlay primitives: context menu, modal dialog, toast.
import { TIMINGS } from '../../config/defaults.js';
import { icon } from '../../shared/icons.js';
import { escapeHtml as h } from '../../shared/text.js';

const MENU_MARGIN_PX = 6;
export const SEPARATOR = Symbol('separator');

export class Overlay {
  #root;
  #onClose;

  constructor(root, { onClose } = {}) {
    this.#root = root;
    this.#onClose = onClose;
  }

  get isOpen() {
    return this.#root.childElementCount > 0;
  }

  get hasDialog() {
    return !!this.#root.querySelector('.dialog-backdrop');
  }

  close() {
    this.#root.replaceChildren();
    this.#onClose?.();
  }

  mount(element) {
    this.#root.appendChild(element);
  }

  toast(text) {
    const el = Object.assign(document.createElement('div'), { className: 'toast', textContent: text });
    this.#root.appendChild(el);
    setTimeout(() => el.remove(), TIMINGS.toastMs);
  }

  // items: [{ label, icon?, danger?, run } | { header } | SEPARATOR | falsy]
  menu(x, y, items) {
    this.close();
    const entries = items.filter(Boolean);
    if (!entries.length) return;
    const backdrop = Object.assign(document.createElement('div'), { className: 'menu-backdrop' });
    backdrop.addEventListener('mousedown', () => this.close());
    backdrop.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.close();
    });
    const menu = Object.assign(document.createElement('div'), { className: 'menu' });
    const actions = [];
    menu.innerHTML = entries
      .map((item) => {
        if (item === SEPARATOR) return '<div class="sep"></div>';
        if (item.header) return `<div class="mh">${h(item.header)}</div>`;
        actions.push(item.run);
        return `<button class="mi ${item.danger ? 'danger' : ''}" data-i="${actions.length - 1}">${item.icon ? icon(item.icon, 14) : '<span class="mi-pad"></span>'}<span>${h(item.label)}</span></button>`;
      })
      .join('');
    menu.addEventListener('click', (e) => {
      const el = e.target.closest('[data-i]');
      if (!el) return;
      this.close();
      Promise.resolve(actions[Number(el.dataset.i)]()).catch(() => {});
    });
    this.#root.append(backdrop, menu);
    const box = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(MENU_MARGIN_PX, Math.min(x, innerWidth - box.width - MENU_MARGIN_PX))}px`;
    menu.style.top = `${Math.max(MENU_MARGIN_PX, Math.min(y, innerHeight - box.height - MENU_MARGIN_PX))}px`;
  }

  // Returns { form, close }. `onSubmit(form)` runs after the dialog closed.
  dialog(html, { onMount, onSubmit } = {}) {
    this.close();
    const backdrop = Object.assign(document.createElement('div'), { className: 'dialog-backdrop' });
    backdrop.innerHTML = `<form class="dialog">${html}</form>`;
    this.#root.appendChild(backdrop);
    const form = backdrop.querySelector('form');
    const close = () => this.close();
    backdrop.addEventListener('mousedown', (e) => e.target === backdrop && close());
    form.addEventListener('keydown', (e) => e.key === 'Escape' && close());
    form.querySelector('[data-cancel]')?.addEventListener('click', close);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      close();
      Promise.resolve(onSubmit?.(data)).catch(() => {});
    });
    onMount?.(form, close);
    setTimeout(() => form.querySelector('[autofocus]')?.focus(), TIMINGS.dialogFocusDelayMs);
    return { form, close };
  }
}
