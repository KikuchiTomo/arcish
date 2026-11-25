// Minimal keyed DOM patcher. Rendering replaces only what changed, so images
// (favicons) are not reloaded, focus and scroll survive, and CSS transitions
// keep running. Siblings may carry `data-key` for identity across reorders.
//
// Optional hooks let the caller animate structural changes:
//   enter(el)  called for an element inserted into an already rendered parent
//   leave(el)  may return a promise; the element stays in the DOM (marked
//              `data-leaving`, ignored by later patches) until it settles
const LEAVING = 'data-leaving';
const isElement = (n) => n.nodeType === Node.ELEMENT_NODE;
const keyOf = (n) => (isElement(n) ? n.getAttribute('data-key') : null);
const sameKind = (a, b) => a.nodeType === b.nodeType && a.nodeName === b.nodeName;
const isLeaving = (n) => isElement(n) && n.hasAttribute(LEAVING);

// First node at or after `node` that is not on its way out.
function present(node) {
  let n = node;
  while (n && isLeaving(n)) n = n.nextSibling;
  return n;
}

function patchAttributes(from, to) {
  for (const { name } of [...from.attributes]) if (!to.hasAttribute(name)) from.removeAttribute(name);
  for (const { name, value } of to.attributes) if (from.getAttribute(name) !== value) from.setAttribute(name, value);
}

function patchNode(from, to, hooks) {
  if (!isElement(from)) {
    if (from.nodeValue !== to.nodeValue) from.nodeValue = to.nodeValue;
    return;
  }
  patchAttributes(from, to);
  if (from.nodeName === 'INPUT' || from.nodeName === 'TEXTAREA') {
    if (document.activeElement !== from && from.value !== to.value) from.value = to.value;
    return;
  }
  patchChildren(from, to, hooks);
}

function remove(node, hooks) {
  const leaving = isElement(node) ? hooks.leave?.(node) : null;
  if (!leaving) {
    node.remove();
    return;
  }
  node.setAttribute(LEAVING, '');
  node.removeAttribute('data-key');
  node.inert = true;
  leaving.finally(() => node.remove());
}

function patchChildren(parent, next, hooks) {
  const keyed = new Map();
  for (const n of parent.childNodes) {
    const k = keyOf(n);
    if (k && !isLeaving(n)) keyed.set(k, n);
  }
  const populated = parent.hasChildNodes();
  let cursor = present(parent.firstChild);
  for (const incoming of [...next.childNodes]) {
    const k = keyOf(incoming);
    let match = null;
    if (k) match = keyed.get(k) || null;
    else if (cursor && !keyOf(cursor)) match = cursor;
    if (match && sameKind(match, incoming)) {
      if (k) keyed.delete(k);
      if (match === cursor) cursor = present(cursor.nextSibling);
      else parent.insertBefore(match, cursor);
      patchNode(match, incoming, hooks);
    } else {
      parent.insertBefore(incoming, cursor);
      if (populated && isElement(incoming)) hooks.enter?.(incoming);
    }
  }
  while (cursor) {
    const rest = present(cursor.nextSibling);
    remove(cursor, hooks);
    cursor = rest;
  }
}

export function morph(root, html, hooks = {}) {
  const template = document.createElement('template');
  template.innerHTML = html;
  patchChildren(root, template.content, hooks);
}
