import { parseFeed } from '../shared/feed.js';
import { hostOf } from '../shared/url.js';
import { getText, SourceError } from './http.js';

export default {
  kind: 'rss',
  nameKey: 'liveSourceRss',
  icon: 'rss',
  hintKey: 'liveHintRss',
  fields: [{ name: 'url', type: 'url', labelKey: 'liveFieldFeedUrl', placeholder: 'https://example.com/feed.xml', required: true }],
  defaultTitle: (source) => hostOf(source.url).replace(/^www\./, ''),
  async fetch(source) {
    const feed = parseFeed(await getText(source.url));
    if (!feed.items.length) throw new SourceError('liveErrorEmptyFeed');
    return feed.items;
  },
};
