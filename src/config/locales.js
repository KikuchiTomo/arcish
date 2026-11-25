// To add a language:
//   1. copy _locales/en/messages.json to _locales/<code>/messages.json and translate
//   2. add one entry below (only needed for the manual language picker)
export const AUTO_LOCALE = 'auto';
export const DEFAULT_LOCALE = 'en';

export const SUPPORTED_LOCALES = Object.freeze([
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
]);
