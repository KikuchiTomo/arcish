#!/usr/bin/env node
// Generates the Chrome Web Store listing assets from the real extension UI
// filled with dummy data:   node scripts/store-assets.mjs
//
//   store/<lang>/screenshot-N-<name>.jpg   1280x800, one set per language
//   store/promo-small.jpg                  440x280
//   store/promo-marquee.jpg                1400x560
//
// The store wants JPEG or 24-bit PNG without alpha, hence JPEG.
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { captureUi } from './store/capture.mjs';
import { extensionName, openDemoSession, publishFrame, ROOT } from './store/session.mjs';

const OUT = join(ROOT, 'store');
const JPEG_QUALITY = 94;
const SCREENSHOT = { width: 1280, height: 800 };
const SMALL_TILE = { width: 440, height: 280 };
const MARQUEE = { width: 1400, height: 560 };

// Field colour and accent for each space the screenshots show.
const LOOK = {
  personal: { tint: '#dcd4fb', ink: '#5b3df5' },
  work: { tint: '#cfdffc', ink: '#1f5fe0' },
  neutral: { tint: '#e3e0ea', ink: '#4a4560' },
};

const SHOTS = [
  // `strip` names the capture whose tab strip the browser frame shows (the image's own unless given).
  { name: 'spaces', kind: 'panel', image: 'panel-personal', look: 'personal' },
  { name: 'live-folders', kind: 'panel', image: 'panel-work', look: 'work' },
  { name: 'command-bar', kind: 'overlay', image: 'palette-3', strip: 'panel-work', look: 'work' },
  { name: 'library', kind: 'panel', image: 'panel-library', look: 'personal' },
  { name: 'settings', kind: 'page', image: 'settings', look: 'neutral' },
];

// In a title, *…* marks the phrase set in the accent style.
const COPY = {
  en: {
    tagline: 'Arc-style sidebar for Chrome',
    spaces: { label: 'Spaces · Favorites · Pins', title: 'Every tab\nhas a *place.*', body: 'Favorites up top, pins that stay when you close them, and a Space for each part of your day.' },
    'live-folders': { label: 'Live Folders', title: 'Folders that\n*keep up.*', body: 'Pull requests, issues and feeds refresh on their own, with build status at a glance.' },
    'command-bar': { label: 'Command bar', title: 'One shortcut\nto *everything.*', body: 'Jump to tabs, pins, bookmarks and history, or run an action without leaving the keyboard.' },
    library: { label: 'Library', title: 'Closed is\n*not gone.*', body: 'Archived tabs, downloads, Spaces and Boosts, searchable in one place.' },
    settings: { label: 'Your browser, your rules', title: 'It assists Chrome.\nIt does not\n*take over.*', body: 'Anything that changes how Chrome behaves stays off until you switch it on.' },
  },
  ja: {
    tagline: 'Chrome を Arc 風に使うサイドバー',
    spaces: { label: 'Space · Favorites · ピン留め', title: 'タブに、*置き場所*を。', body: '上段に Favorites、閉じても残るピン留め、用途ごとの Space。' },
    'live-folders': { label: 'Live Folder', title: '中身が勝手に\n*新しくなる*フォルダ。', body: 'プルリクエストや Issue、フィードを自動で更新。ビルドの状態もひと目で分かります。' },
    'command-bar': { label: 'コマンドバー', title: 'ショートカットひとつで、\n*どこへでも*。', body: 'タブ、ピン留め、ブックマーク、履歴への移動も、操作の実行も、キーボードだけで。' },
    library: { label: 'ライブラリ', title: '閉じても、*なくならない*。', body: 'アーカイブしたタブ、ダウンロード、Space、Boost をまとめて検索できます。' },
    settings: { label: '主役は Chrome', title: 'Chrome を*補助*する。\n乗っ取らない。', body: 'Chrome 本来の動作を変える機能は、オンにするまで働きません。' },
  },
};

const session = await openDemoSession();
const { site, browser } = session;
site.publish('compose.html', readFileSync(join(ROOT, 'scripts/store/compose.html')), 'text/html');
publishFrame(site);
const icon = site.file('icon.png');

try {
  // Capture every language first: the page that composes the images is a tab
  // too and must not appear in the captured sidebars.
  const languages = Object.keys(COPY);
  const ui = {};
  for (const language of languages) ui[language] = await captureUi({ ...session, language });

  const composer = await browser.openPage(site.file('compose.html'));
  const compose = async (file, size, layout) => {
    await composer.setViewport(size.width, size.height, { scale: 1 });
    await composer.evaluate(`window.__layout = ${JSON.stringify(layout)}; render()`);
    await composer.capture({ file, format: 'jpeg', quality: JPEG_QUALITY });
    console.log(file.replace(`${ROOT}/`, ''));
  };

  for (const lang of languages) {
    mkdirSync(join(OUT, lang), { recursive: true });
    for (const [i, shot] of SHOTS.entries()) {
      await compose(join(OUT, lang, `screenshot-${i + 1}-${shot.name}.jpg`), SCREENSHOT, { kind: shot.kind, lang, image: site.file(`ui/${lang}/${shot.image}.png`), tabs: ui[lang].strips[shot.strip || shot.image], extension: { name: extensionName(lang), icon }, ...LOOK[shot.look], ...COPY[lang][shot.name] });
    }
  }
  // Promo tiles carry the English tagline; the store shows them in every locale.
  const tile = { lang: 'en', icon, tagline: COPY.en.tagline };
  await compose(join(OUT, 'promo-small.jpg'), SMALL_TILE, { kind: 'small', ...tile });
  await compose(join(OUT, 'promo-marquee.jpg'), MARQUEE, { kind: 'marquee', ...tile, image: site.file('ui/en/panel-personal.png') });
} finally {
  await session.close();
}
