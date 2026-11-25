import { chromium } from 'playwright-core';
import { ads } from '../src/adspower.js';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const p = (await ads.listProfiles()).find((x) => x.name === process.argv[2]);
const { ws } = await ads.start(p.id, { headless: false });
const b = await chromium.connectOverCDP(ws, { timeout: 45000 });
const page = b.contexts()[0].pages()[0];
try {
  await page.goto('https://www.facebook.com/search/videos/?q=manifestation', { waitUntil: 'domcontentloaded' }); await sleep(5000);
  const href = await page.evaluate(() => { const a = document.querySelector('a[href*="/reel/"], a[href*="/watch/?v="], a[href*="/videos/"]'); return a?.href; });
  console.log('abrindo', href);
  await page.goto(href, { waitUntil: 'domcontentloaded' }); await sleep(6000);
  console.log(page.url());
  const dump = await page.evaluate(() => [...document.querySelectorAll('[aria-label]')].filter((e) => /like|curt|comment|coment|react|reag|share|compart/i.test(e.getAttribute('aria-label'))).slice(0, 25).map((e) => `${e.tagName}[role=${e.getAttribute('role')}] "${e.getAttribute('aria-label')}" vis=${!!(e.offsetWidth || e.offsetHeight)}`));
  console.log(dump.join('\n'));
  console.log('textboxes:', await page.evaluate(() => [...document.querySelectorAll('[role=textbox],[contenteditable=true]')].map((e) => e.getAttribute('aria-label'))));
  const cb = page.locator('[role=button][aria-label^="Coment"]').first();
  await cb.click({ timeout: 5000 }); await sleep(3000);
  console.log('após clicar comentário - textboxes:', await page.evaluate(() => [...document.querySelectorAll('[role=textbox],[contenteditable=true],textarea,input[type=text]')].map((e) => `${e.tagName} "${e.getAttribute('aria-label')}" ph=${e.getAttribute('placeholder')} vis=${!!(e.offsetWidth||e.offsetHeight)}`)));
  const lk = page.locator('[role=button][aria-label^="Curtir"]').first();
  const before = await lk.getAttribute('aria-label'); await lk.click(); await sleep(2000);
  console.log('curtir antes:', before, '| depois:', await page.evaluate(() => [...document.querySelectorAll('[role=button][aria-label]')].map((e) => e.getAttribute('aria-label')).filter((l) => /curt|like|remov|desfaz/i.test(l)).slice(0, 6)));
  await lk.click().catch(() => {}); // desfaz a curtida do teste
} finally { await b.close().catch(() => {}); await ads.stop(p.id).catch(() => {}); }
