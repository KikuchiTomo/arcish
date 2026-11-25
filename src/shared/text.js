const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

export function uid() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

// FNV-1a, base36 — stable short keys.
export function hashStr(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

// Small fuzzy matcher: 0 = no match, higher is better.
export function fuzzyScore(query, text) {
  if (!query) return 1;
  if (!text) return 0;
  const q = query.toLowerCase();
  const s = text.toLowerCase();
  const idx = s.indexOf(q);
  if (idx >= 0) return 100 - Math.min(idx, 50) + (idx === 0 ? 50 : 0);
  let pos = 0;
  let score = 0;
  let streak = 0;
  for (const ch of q) {
    const found = s.indexOf(ch, pos);
    if (found < 0) return 0;
    streak = found === pos ? streak + 1 : 0;
    score += 1 + streak;
    pos = found + 1;
  }
  return Math.min(score, 40);
}

export function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export function spaceLabel(space) {
  if (!space) return '';
  return space.emoji ? `${space.emoji} ${space.name}` : space.name;
}
