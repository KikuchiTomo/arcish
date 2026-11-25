// One demo session: a throw-away Chrome with the extension loaded and the
// dummy data in place. Shared by the image and the film generators.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser, sleep } from '../lib/browser.mjs';
import { closePopups, openDetached, rpcFrom } from './capture.mjs';
import { seedDemo, startDemoSite } from './demo.mjs';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

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
