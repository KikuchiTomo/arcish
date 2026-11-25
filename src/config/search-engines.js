// `%s` is replaced by the URL-encoded query.
export const QUERY_TOKEN = '%s';
export const CUSTOM_ENGINE = 'custom';

export const SEARCH_ENGINES = Object.freeze({
  google: { name: 'Google', url: 'https://www.google.com/search?q=%s' },
  duckduckgo: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s' },
  bing: { name: 'Bing', url: 'https://www.bing.com/search?q=%s' },
  kagi: { name: 'Kagi', url: 'https://kagi.com/search?q=%s' },
  perplexity: { name: 'Perplexity', url: 'https://www.perplexity.ai/search?q=%s' },
});

export const DEFAULT_SEARCH_ENGINE = 'google';
