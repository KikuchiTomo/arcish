// Helpers for the pinned-item tree (links, folders, live folders).
const LIVE_PREFIX = 'live';

export function walk(nodes, fn, parent = null) {
  for (const n of nodes || []) {
    if (fn(n, parent) === false) return false;
    if (n.children && walk(n.children, fn, n) === false) return false;
  }
  return true;
}

export function find(nodes, id, parent = null) {
  for (let i = 0; i < (nodes || []).length; i++) {
    const n = nodes[i];
    if (n.id === id) return { node: n, list: nodes, index: i, parent };
    if (n.children) {
      const hit = find(n.children, id, n);
      if (hit) return hit;
    }
  }
  return null;
}

export function contains(node, id) {
  return !walk(node.children || [], (n) => n.id !== id);
}

export function collect(nodes, pred) {
  const out = [];
  walk(nodes, (n) => void (pred(n) && out.push(n)));
  return out;
}

export function insertBefore(list, node, beforeId) {
  const i = beforeId ? list.findIndex((n) => n.id === beforeId) : -1;
  if (i >= 0) list.splice(i, 0, node);
  else list.push(node);
}

// Live folder items are addressed as `live:<folderId>:<itemKey>`.
export function liveItemId(folderId, key) {
  return `${LIVE_PREFIX}:${folderId}:${key}`;
}

export function parseLiveItemId(id) {
  if (!id?.startsWith(LIVE_PREFIX + ':')) return null;
  const [, folderId, key] = id.split(':');
  return { folderId, key };
}
