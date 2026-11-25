// Unit tests for the pure shared modules.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFakeChrome } from './helpers/fake-chrome.js';

globalThis.chrome = createFakeChrome().api;
const { parseFeed } = await import('../src/shared/feed.js');
const url = await import('../src/shared/url.js');
const text = await import('../src/shared/text.js');
const tree = await import('../src/shared/tree.js');
const { KeyedMutex } = await import('../src/background/core/mutex.js');

test('parseFeed reads RSS 2.0 with CDATA and entities', () => {
  const feed = parseFeed(`<rss><channel><title>Blog &amp; Co</title>
    <item><title><![CDATA[Hello <b>World</b>]]></title><link>https://a.example/1</link><guid>g1</guid><pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate></item>
    <item><title>Two &#8212; dash</title><link>https://a.example/2</link></item></channel></rss>`);
  assert.equal(feed.title, 'Blog & Co');
  assert.deepEqual(feed.items.map((i) => i.title), ['Hello World', 'Two — dash']);
  assert.equal(feed.items[0].id, 'g1');
  assert.equal(feed.items[0].date, Date.parse('2024-01-01T00:00:00Z'));
  assert.equal(feed.items[1].id, 'https://a.example/2');
});

test('parseFeed reads Atom and prefers the alternate link', () => {
  const feed = parseFeed(`<feed><title>Atom</title>
    <entry><title>Entry</title><link rel="self" href="https://a.example/self"/><link rel="alternate" href="https://a.example/post?a=1&amp;b=2"/><id>tag:1</id><updated>2024-02-03T00:00:00Z</updated></entry></feed>`);
  assert.equal(feed.items.length, 1);
  assert.equal(feed.items[0].url, 'https://a.example/post?a=1&b=2');
  assert.equal(feed.items[0].id, 'tag:1');
});

test('toUrlOrSearch tells URLs from searches', () => {
  assert.equal(url.toUrlOrSearch('example.com/x', {}), 'https://example.com/x');
  assert.equal(url.toUrlOrSearch('localhost:3000', {}), 'http://localhost:3000');
  assert.equal(url.toUrlOrSearch('https://a.example', {}), 'https://a.example');
  assert.equal(url.toUrlOrSearch('hello world', {}), 'https://www.google.com/search?q=hello%20world');
  assert.equal(url.toUrlOrSearch('what is node.js', { searchEngine: 'duckduckgo' }), 'https://duckduckgo.com/?q=what%20is%20node.js');
  assert.equal(url.toUrlOrSearch('q', { searchEngine: 'custom', customSearch: 'https://s.example/?q=%s' }), 'https://s.example/?q=q');
});

test('matchPattern handles hosts, subdomains and wildcards', () => {
  assert.equal(url.matchPattern('github.com', 'https://github.com/a/b'), true);
  assert.equal(url.matchPattern('github.com', 'https://gist.github.com/'), true);
  assert.equal(url.matchPattern('github.com', 'https://notgithub.com/'), false);
  assert.equal(url.matchPattern('*.example.com/docs/*', 'https://a.example.com/docs/x'), true);
  assert.equal(url.matchPattern('example.com/docs', 'https://example.com/blog'), false);
  assert.equal(url.matchPattern('', 'https://example.com/'), false);
});

test('samePage ignores query, hash and trailing slash', () => {
  assert.equal(url.samePage('https://a.example/x/', 'https://a.example/x?y=1#z'), true);
  assert.equal(url.samePage('https://a.example/x', 'https://a.example/y'), false);
});

test('fuzzyScore ranks prefix > substring > subsequence > none', () => {
  const s = (q, t) => text.fuzzyScore(q, t);
  assert.ok(s('git', 'GitHub') > s('git', 'my git repo'));
  assert.ok(s('git', 'my git repo') > s('gtb', 'GitHub'));
  assert.equal(s('xyz', 'GitHub'), 0);
});

test('tree helpers find, collect and guard against cycles', () => {
  const nodes = [{ id: 'f', children: [{ id: 'a' }, { id: 'g', children: [{ id: 'b' }] }] }, { id: 'c' }];
  assert.equal(tree.find(nodes, 'b').parent.id, 'g');
  assert.deepEqual(tree.collect(nodes, (n) => !n.children).map((n) => n.id), ['a', 'b', 'c']);
  assert.equal(tree.contains(nodes[0], 'b'), true);
  assert.equal(tree.contains(nodes[0], 'c'), false);
  const list = [{ id: 'x' }, { id: 'z' }];
  tree.insertBefore(list, { id: 'y' }, 'z');
  assert.deepEqual(list.map((n) => n.id), ['x', 'y', 'z']);
  assert.deepEqual(tree.parseLiveItemId(tree.liveItemId('folder', 'key')), { folderId: 'folder', key: 'key' });
});

test('KeyedMutex runs tasks for one key in order, even after a failure', async () => {
  const mutex = new KeyedMutex();
  const log = [];
  const slow = mutex.run('k', async () => {
    await new Promise((r) => setTimeout(r, 10));
    log.push('slow');
  });
  const failing = mutex.run('k', async () => {
    log.push('fail');
    throw new Error('x');
  });
  const last = mutex.run('k', async () => void log.push('last'));
  await slow;
  await assert.rejects(failing);
  await last;
  assert.deepEqual(log, ['slow', 'fail', 'last']);
});

test('GitHub source: GraphQL with a token (with CI status), REST without', async () => {
  const { githubSearch, githubPulls } = await import('../src/live-sources/github.js');
  const realFetch = globalThis.fetch;
  const calls = [];
  const respond = (body) => ({ ok: true, status: 200, statusText: 'OK', json: async () => body, text: async () => JSON.stringify(body) });
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url, init });
    if (url.endsWith('/graphql')) {
      return respond({ data: { search: { nodes: [
        { __typename: 'PullRequest', number: 7, title: 'fix: ci', url: 'https://github.com/o/r/pull/7', updatedAt: '2026-01-01T00:00:00Z', isDraft: true, author: { login: 'me' }, repository: { nameWithOwner: 'o/r' }, commits: { nodes: [{ commit: { statusCheckRollup: { state: 'FAILURE' } } }] } },
        { __typename: 'Issue', number: 8, title: 'bug', url: 'https://github.com/o/r/issues/8', updatedAt: '2026-01-02T00:00:00Z', author: null, repository: { nameWithOwner: 'o/r' } },
      ] } } });
    }
    return respond({ items: [{ html_url: 'https://github.com/o/r/pull/7', number: 7, title: 'fix: ci', updated_at: '2026-01-01T00:00:00Z', user: { login: 'me' }, repository_url: 'https://api.github.com/repos/o/r', draft: false }] });
  };
  try {
    const withToken = await githubSearch.fetch({ query: 'is:open is:pr author:@me' }, { settings: { githubToken: 't' }, limit: 5 });
    assert.equal(JSON.parse(calls[0].init.body).variables.q, 'is:open is:pr author:@me sort:updated-desc');
    assert.equal(calls[0].init.headers.Authorization, 'Bearer t');
    assert.deepEqual(withToken.map((i) => [i.id, i.subtitle, i.meta, i.draft, i.status]), [
      ['https://github.com/o/r/pull/7', 'me', 'o/r#7', true, 'failure'],
      ['https://github.com/o/r/issues/8', '', 'o/r#8', false, null],
    ]);
    const anonymous = await githubPulls.fetch({ repo: 'https://github.com/o/r/' }, { settings: {}, limit: 5 });
    assert.match(calls[1].url, /search\/issues\?q=repo%3Ao%2Fr%20is%3Apr%20is%3Aopen/);
    assert.deepEqual(anonymous.map((i) => [i.id, i.subtitle, i.meta, i.status]), [['https://github.com/o/r/pull/7', 'me', 'o/r#7', null]]);
    await assert.rejects(async () => githubSearch.fetch({ query: 'author:@me' }, { settings: {}, limit: 5 }), (e) => e.key === 'liveErrorTokenRequired');
    await assert.rejects(async () => githubPulls.fetch({ repo: 'nope' }, { settings: {}, limit: 5 }), (e) => e.key === 'liveErrorRepoFormat');
  } finally {
    globalThis.fetch = realFetch;
  }
});
