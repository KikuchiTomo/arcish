import { LIMITS } from '../config/defaults.js';

async function request(url, headers) {
  const res = await fetch(url, { headers, cache: 'no-store' });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}${body ? ' — ' + body.slice(0, LIMITS.errorBodyChars) : ''}`);
  }
  return res;
}

export async function getJson(url, headers = {}) {
  return (await request(url, headers)).json();
}

export async function getText(url, headers = {}) {
  return (await request(url, headers)).text();
}

// Errors whose message is an i18n key (+ substitutions) rather than raw text.
export class SourceError extends Error {
  constructor(key, ...subs) {
    super(key);
    this.key = key;
    this.subs = subs;
  }
}
