// GitHub sources. All three are expressed as an issue search, so they share
// one fetch path with two transports:
//   - with a token:    GraphQL (one request, includes CI status of pull requests)
//   - without a token: REST search (public data only, no CI status)
import { getJson, SourceError } from './http.js';

const API = 'https://api.github.com';
const API_VERSION = '2022-11-28';
const REPO_PATTERN = /^[\w.-]+\/[\w.-]+$/;
const SELF_QUALIFIER = '@me';

export const STATUS = Object.freeze({ SUCCESS: 'success', FAILURE: 'failure', PENDING: 'pending' });

// GraphQL StatusState -> our status
const ROLLUP_STATUS = { SUCCESS: STATUS.SUCCESS, FAILURE: STATUS.FAILURE, ERROR: STATUS.FAILURE, PENDING: STATUS.PENDING, EXPECTED: STATUS.PENDING };

const SEARCH_QUERY = `query($q: String!, $n: Int!) {
  search(query: $q, type: ISSUE, first: $n) {
    nodes {
      __typename
      ... on PullRequest { number title url updatedAt isDraft author { login } repository { nameWithOwner }
        commits(last: 1) { nodes { commit { statusCheckRollup { state } } } } }
      ... on Issue { number title url updatedAt author { login } repository { nameWithOwner } }
    }
  }
}`;

function headers(token) {
  const h = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': API_VERSION };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

function item({ url, number, title, updatedAt, author, repo, draft = false, status = null }) {
  return { id: url, url, title, date: Date.parse(updatedAt) || null, subtitle: author || '', meta: `${repo}#${number}`, draft, status };
}

async function searchGraphql(q, token, limit) {
  const res = await fetch(`${API}/graphql`, { method: 'POST', headers: headers(token), body: JSON.stringify({ query: SEARCH_QUERY, variables: { q, n: limit } }), cache: 'no-store' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.errors) throw new Error(body.errors?.[0]?.message || body.message || `${res.status} ${res.statusText}`);
  return body.data.search.nodes
    .filter((n) => n.url)
    .map((n) =>
      item({
        url: n.url,
        number: n.number,
        title: n.title,
        updatedAt: n.updatedAt,
        author: n.author?.login,
        repo: n.repository.nameWithOwner,
        draft: !!n.isDraft,
        status: ROLLUP_STATUS[n.commits?.nodes[0]?.commit.statusCheckRollup?.state] ?? null,
      }),
    );
}

async function searchRest(q, limit) {
  const res = await getJson(`${API}/search/issues?q=${encodeURIComponent(q)}&sort=updated&per_page=${limit}`, headers());
  return res.items.map((x) =>
    item({ url: x.html_url, number: x.number, title: x.title, updatedAt: x.updated_at, author: x.user?.login, repo: x.repository_url.split('/').slice(-2).join('/'), draft: !!x.draft }),
  );
}

async function search(q, { settings, limit }) {
  const token = settings.githubToken?.trim();
  if (q.includes(SELF_QUALIFIER) && !token) throw new SourceError('liveErrorTokenRequired');
  return token ? searchGraphql(`${q} sort:updated-desc`, token, limit) : searchRest(q, limit);
}

function repoOf(source) {
  const repo = (source.repo || '').trim().replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, '');
  if (!REPO_PATTERN.test(repo)) throw new SourceError('liveErrorRepoFormat');
  return repo;
}

const repoField = { name: 'repo', type: 'text', labelKey: 'liveFieldRepo', placeholder: 'owner/name', required: true };
const common = { icon: 'github', itemIcon: 'github' };

export const githubPulls = {
  ...common,
  kind: 'github-prs',
  nameKey: 'liveSourceGithubPulls',
  hintKey: 'liveHintGithubToken',
  fields: [repoField],
  defaultTitle: (source, t) => t('liveTitlePulls', source.repo),
  fetch: (source, ctx) => search(`repo:${repoOf(source)} is:pr is:open`, ctx),
};

export const githubIssues = {
  ...common,
  kind: 'github-issues',
  nameKey: 'liveSourceGithubIssues',
  hintKey: 'liveHintGithubToken',
  fields: [repoField],
  defaultTitle: (source, t) => t('liveTitleIssues', source.repo),
  fetch: (source, ctx) => search(`repo:${repoOf(source)} is:issue is:open`, ctx),
};

const SEARCH_PRESETS = [
  { labelKey: 'livePresetReviewRequested', value: 'is:open is:pr review-requested:@me' },
  { labelKey: 'livePresetMyPulls', value: 'is:open is:pr author:@me' },
  { labelKey: 'livePresetAssigned', value: 'is:open assignee:@me' },
  { labelKey: 'livePresetMentions', value: 'is:open mentions:@me' },
];

export const githubSearch = {
  ...common,
  kind: 'github-search',
  nameKey: 'liveSourceGithubSearch',
  hintKey: 'liveHintGithubSelf',
  fields: [{ name: 'query', type: 'text', labelKey: 'liveFieldQuery', required: true, defaultValue: SEARCH_PRESETS[0].value, presets: SEARCH_PRESETS }],
  defaultTitle: (source, t) => {
    const preset = SEARCH_PRESETS.find((p) => p.value === source.query);
    return preset ? t(preset.labelKey) : source.query;
  },
  fetch(source, ctx) {
    const q = (source.query || '').trim();
    if (!q) throw new SourceError('liveErrorEmptyQuery');
    return search(q, ctx);
  },
};
