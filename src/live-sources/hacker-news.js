import { getJson } from './http.js';

const API = 'https://hn.algolia.com/api/v1/search';
const ITEM_URL = 'https://news.ycombinator.com/item?id=';

const TAGS = [
  { value: 'front_page', labelKey: 'liveHnFrontPage' },
  { value: 'show_hn', labelKey: 'liveHnShow' },
  { value: 'ask_hn', labelKey: 'liveHnAsk' },
];

export default {
  kind: 'hn',
  nameKey: 'liveSourceHackerNews',
  icon: 'flame',
  fields: [{ name: 'tag', type: 'select', labelKey: 'liveFieldKind', options: TAGS, defaultValue: TAGS[0].value }],
  defaultTitle: (source, t) => t(TAGS.find((x) => x.value === source.tag)?.labelKey || TAGS[0].labelKey),
  async fetch(source, { limit }) {
    const res = await getJson(`${API}?tags=${encodeURIComponent(source.tag || TAGS[0].value)}&hitsPerPage=${limit}`);
    return res.hits.map((h) => ({
      id: h.objectID,
      url: h.url || ITEM_URL + h.objectID,
      title: h.title,
      date: (h.created_at_i || 0) * 1000 || null,
      meta: `▲ ${h.points ?? 0} · 💬 ${h.num_comments ?? 0}`,
    }));
  },
};
