// Dummy content for store screenshots and the promo film: a tiny local
// website (so tabs have titles and icons that belong to nobody) and the
// sidebar state built on top of it. Nothing here comes from a real account.
import { createServer } from 'node:http';
import { sleep, waitFor } from '../lib/browser.mjs';

// path -> page. `glyph` and `color` make the favicon.
const PAGES = {
  mail: { title: 'Inbox', glyph: '✉', color: '#e5484d' },
  chat: { title: 'Team chat', glyph: '#', color: '#8b6cf6' },
  calendar: { title: 'Calendar', glyph: '31', color: '#3b82f6' },
  music: { title: 'Focus playlist', glyph: '♪', color: '#22b07d' },
  design: { title: 'Design board', glyph: '◆', color: '#f08a4b' },
  notes: { title: 'Project notes', glyph: 'N', color: '#14a9b8' },
  roadmap: { title: 'Roadmap 2027', glyph: 'R', color: '#6b7280' },
  reads: { title: 'Long reads for the weekend', glyph: 'L', color: '#d9a514' },
  recipes: { title: 'Weeknight recipes', glyph: 'W', color: '#e85d8f' },
  weather: { title: 'Weather — Lisbon', glyph: '☀', color: '#f0a020' },
  flights: { title: 'Flights to Lisbon', glyph: '✈', color: '#3b82f6' },
  build: { title: 'Build #482 passed', glyph: '✓', color: '#22b07d' },
  board: { title: 'Sprint board', glyph: '▦', color: '#8b6cf6' },
  api: { title: 'API reference', glyph: '{}', color: '#6b7280' },
  paper: { title: 'Notes on colour perception', glyph: 'P', color: '#14a9b8' },
  dataset: { title: 'Survey results (draft)', glyph: 'S', color: '#e5484d' },
  hotel: { title: 'Hotels near Alfama', glyph: 'H', color: '#f08a4b' },
  gift: { title: 'Gift ideas', glyph: 'G', color: '#e85d8f' },
};

const FEED_ITEMS = ['A quieter way to organise tabs', 'Field notes: small tools, big habits', 'What we learned shipping weekly', 'Designing for the edge of the screen', 'Keyboard first, mouse welcome', 'Colour, contrast and calm interfaces', 'The case for fewer windows'];

// Entries of the dummy "Pull Requests" live folder (shape of the GitHub source).
const PULL_REQUESTS = [
  { title: 'Fix sidebar width on small screens', subtitle: 'mika', status: 'success', unread: true },
  { title: 'Add keyboard shortcut for split view', subtitle: 'jonas', status: 'pending', unread: true },
  { title: 'Refactor archive storage', subtitle: 'aiko-t', status: 'failure' },
  { title: 'Docs: getting started guide', subtitle: 'sam', status: 'success', draft: true },
  { title: 'Bump dependencies', subtitle: 'renovate', status: 'success' },
];

const favicon = ({ glyph, color }) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="15" fill="${color}"/><text x="32" y="44" text-anchor="middle" font-family="-apple-system,Helvetica,Arial,sans-serif" font-size="${glyph.length > 1 ? 26 : 34}" font-weight="700" fill="#fff">${glyph}</text></svg>`)}`;

const pageHtml = (page) => `<!doctype html><meta charset="utf-8"><title>${page.title}</title><link rel="icon" href="${favicon(page)}">
<body style="margin:0;font:16px -apple-system,system-ui,sans-serif;color:#1e1b29;background:#fff"><main style="max-width:640px;margin:72px auto;padding:0 32px">
<h1 style="font-size:34px;letter-spacing:-.02em;margin:0 0 12px">${page.title}</h1><p style="color:#77738a;line-height:1.6">Sample page used for screenshots.</p></main>`;

const feedXml = () => `<?xml version="1.0"?><rss version="2.0"><channel><title>Studio journal</title>${FEED_ITEMS.map((title, i) => `<item><title>${title}</title><link>http://journal.demo/post-${i}</link><guid>journal-${i}</guid></item>`).join('')}</channel></rss>`;

const DEMO_TLD = 'demo'; // http://<page>.demo/ — mapped to the local server, never resolved for real
const FILES_HOST = 'studio';
const FEED_HOST = 'journal';

// Serves the dummy site plus any files registered with `publish` (captures
// that the composition pages load as images). Each page has its own host
// name, so the UI shows addresses like "calendar.demo" instead of a port.
export async function startDemoSite() {
  const files = new Map(); // path -> { type, body }
  const server = createServer((req, res) => {
    const host = (req.headers.host || '').split('.')[0];
    const path = new URL(req.url, 'http://x').pathname.slice(1);
    const send = (type, body) => {
      res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
      res.end(body);
    };
    if (host === FILES_HOST && files.has(path)) return send(files.get(path).type, files.get(path).body);
    if (host === FEED_HOST) return send('application/rss+xml', feedXml());
    return send('text/html', pageHtml(PAGES[host] || { title: 'Sample', glyph: '·', color: '#6b7280' }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    // Chrome flag that points every *.demo host at this server.
    chromeFlags: [`--host-resolver-rules=MAP *.${DEMO_TLD} 127.0.0.1:${port}`],
    isDemoUrl: (url) => new RegExp(`^http://[\\w-]+\\.${DEMO_TLD}/`).test(url),
    url: (page) => `http://${page}.${DEMO_TLD}/`,
    file: (path) => `http://${FILES_HOST}.${DEMO_TLD}/${path}`,
    feed: `http://${FEED_HOST}.${DEMO_TLD}/feed.xml`,
    publish: (path, body, type = 'image/png') => void files.set(path, { type, body }),
    close: () => server.close(),
  };
}

// Builds the dummy sidebar state through the extension's own messages, the
// same way a person would: open tabs, favorite, pin, make folders.
export async function seedDemo({ worker, rpc, site }) {
  const state = await waitFor(async () => {
    const stored = JSON.parse(await worker.evaluate('chrome.storage.local.get(null).then(JSON.stringify)'));
    return stored.initialized && stored;
  }, 'first run');
  const windowId = await worker.evaluate('chrome.windows.getAll({ windowTypes: ["normal"] }).then((w) => w[0].id)');
  const [personal, work] = state.spaces;
  const research = (await rpc({ type: 'space:create', name: 'Research', emoji: '🧪', color: '#22b07d' })).data;

  const tabs = {};
  for (const path of Object.keys(PAGES)) {
    tabs[path] = await worker.evaluate(`chrome.tabs.create({ windowId: ${windowId}, url: ${JSON.stringify(site.url(path))}, active: false }).then((t) => t.id)`);
  }
  const isDemo = `(t) => /^http:\\/\\/[\\w-]+\\.demo\\//.test(t.url)`;
  await waitFor(() => worker.evaluate(`chrome.tabs.query({ windowId: ${windowId} }).then((all) => all.filter(${isDemo}).length === ${Object.keys(PAGES).length} && all.filter(${isDemo}).every((t) => t.status === 'complete' && t.favIconUrl))`), 'demo tabs');
  // Close the blank tab the browser started with.
  await worker.evaluate(`chrome.tabs.query({ windowId: ${windowId} }).then((all) => chrome.tabs.remove(all.filter((t) => !(${isDemo})(t)).map((t) => t.id)))`);

  const inSpace = (spaceId, paths) => rpc({ type: 'tabs:moveToSpace', tabIds: paths.map((p) => tabs[p]), spaceId });
  const folder = async (spaceId, title, icon, paths) => {
    const id = (await rpc({ type: 'folder:create', spaceId, title, tabIds: paths.map((p) => tabs[p]) })).data;
    if (icon) await rpc({ type: 'node:setIcon', nodeId: id, icon });
    return id;
  };

  for (const path of ['mail', 'chat', 'calendar', 'music', 'design']) await rpc({ type: 'tab:favorite', tabId: tabs[path] });

  await inSpace(work.id, ['notes', 'roadmap', 'build', 'board', 'api']);
  await inSpace(research.id, ['paper', 'dataset']);

  const folders = {
    reading: await folder(personal.id, 'Reading', 'bookmark', ['reads', 'recipes']),
    trips: await folder(personal.id, 'Trip to Lisbon', 'globe', ['hotel']),
    project: await folder(work.id, 'Project', 'code', ['notes', 'roadmap']),
  };
  await rpc({ type: 'node:toggle', nodeId: folders.trips, open: false });

  const live = {
    journal: (await rpc({ type: 'live:create', spaceId: personal.id, title: 'Studio journal', source: { kind: 'rss', url: site.feed } })).data,
    pulls: (await rpc({ type: 'live:create', spaceId: work.id, title: 'Pull Requests', source: { kind: 'github-search', query: 'is:open is:pr repo:example/arcish-demo' } })).data,
  };
  await sleep(1500); // let the real fetches settle before the dummy entries replace them
  const now = Date.now();
  const entries = PULL_REQUESTS.map((pr, i) => ({ id: `pr-${i}`, key: `pr${i}`, url: `https://example.invalid/pull/${i}`, date: now - i * 3_600_000, meta: `example/app#${40 + i}`, draft: false, unread: false, ...pr }));
  await worker.evaluate(`chrome.storage.local.get('liveCache').then(({ liveCache }) => chrome.storage.local.set({ liveCache: { ...liveCache, ${JSON.stringify(live.pulls)}: { items: ${JSON.stringify(entries)}, lastFetched: ${now}, error: null } } }))`);

  await rpc({ type: 'tab:archive', tabIds: [tabs.gift] });
  await rpc({ type: 'space:switch', windowId, spaceId: personal.id });
  await worker.evaluate(`chrome.tabs.update(${tabs.weather}, { active: true }).then(() => 1)`);
  return { windowId, tabs, folders, live, spaces: { personal, work, research: { id: research } } };
}
