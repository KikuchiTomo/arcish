// One demo session: a throw-away Chrome with the extension loaded and the
// dummy data in place. Shared by the image and the film generators.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser, sleep } from '../lib/browser.mjs';
import { closePopups, openDetached, rpcFrom } from './capture.mjs';
import { seedDemo, startDemoSite } from './demo.mjs';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
// The extension's name as Chrome shows it in the given language.
export const extensionName = (language) => JSON.parse(readFileSync(join(ROOT, `_locales/${language}/messages.json`), 'utf8')).extName.message;

// Files the composition pages share: the drawing of Chrome's own bars and the extension's icon.
export function publishFrame(site) {
  site.publish('chrome-frame.css', readFileSync(join(ROOT, 'scripts/store/chrome-frame.css')), 'text/css');
  site.publish('chrome-frame.js', readFileSync(join(ROOT, 'scripts/store/chrome-frame.js')), 'text/javascript');
  site.publish('icon.png', readFileSync(join(ROOT, 'icons/icon128.png')));
}

export async function openDemoSession() {
  const site = await startDemoSite();
  const browser = await launchBrowser({ extensionDir: ROOT, flags: site.chromeFlags });
  const close = async () => {
    await browser.close();
    site.close();
  };
  try {
    const { worker, baseUrl } = await browser.loadExtension();
    // Seed through a helper extension page in a window of its own, then discard it.
    const helper = await openDetached({ browser, worker, url: `${baseUrl}/src/options/options.html`, mark: '#arcish-helper' });
    await helper.open();
    await sleep(800);
    const demo = await seedDemo({ worker, rpc: rpcFrom(helper.page), site });
    helper.page.close();
    await closePopups(worker);
    return { site, browser, worker, baseUrl, demo, close };
  } catch (e) {
    await close();
    throw e;
  }
}
