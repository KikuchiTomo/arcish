// Minimal RSS 2.0 / RSS 1.0 (RDF) / Atom parser. Works without DOMParser so it
// can run in the service worker.
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function text(raw) {
  if (raw == null) return '';
  let s = raw;
  const cdata = s.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  if (cdata) s = cdata[1];
  else s = decodeEntities(s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1'));
  return decodeEntities(s.replace(/<[^>]+>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

function tag(block, name) {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i');
  const m = block.match(re);
  return m ? m[1] : null;
}

function atomLink(block) {
  let fallback = null;
  for (const m of block.matchAll(/<link\b([^>]*?)\/?>/gi)) {
    const attrs = m[1];
    const href = attrs.match(/href\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    const rel = attrs.match(/rel\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!rel || rel === 'alternate') return decodeEntities(href);
    fallback ??= decodeEntities(href);
  }
  return fallback;
}

export function parseFeed(xml) {
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) || xml.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
  const head = xml.split(/<item\b|<entry\b/i)[0];
  const items = [];
  for (const b of blocks) {
    let url = text(tag(b, 'link'));
    if (!url) url = atomLink(b) || '';
    const guid = text(tag(b, 'guid')) || text(tag(b, 'id'));
    if (!url && /^https?:/.test(guid)) url = guid;
    const dateRaw = text(tag(b, 'pubDate')) || text(tag(b, 'updated')) || text(tag(b, 'published')) || text(tag(b, 'dc:date'));
    const title = text(tag(b, 'title')) || url;
    if (!url) continue;
    items.push({ id: guid || url, url, title, date: Date.parse(dateRaw) || null });
  }
  return { title: text(tag(head, 'title')), items };
}
