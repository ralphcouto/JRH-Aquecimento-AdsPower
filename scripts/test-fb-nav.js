// Teste de navegação: página inicial + buscas (posts e vídeos) com termos em inglês. Só leitura, sem curtir.
import { chromium } from 'playwright-core';
import { ads } from '../src/adspower.js';
import { store } from '../src/store.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const name = process.argv[2];
const terms = (process.argv[3] || 'manifestation,wealth manifestation,prosperity mindset,money affirmations,abundance').split(',');
const p = (await ads.listProfiles()).find((x) => x.name === name);
if (!p) { console.log('perfil não encontrado'); process.exit(1); }
const { ws } = await ads.start(p.id, { headless: false });
const browser = await chromium.connectOverCDP(ws, { timeout: 45000 });
const page = (browser.contexts()[0].pages()[0]) || await browser.contexts()[0].newPage();
page.setDefaultTimeout(20000);
const scroll = async (n = 4) => { for (let i = 0; i < n; i++) { await page.mouse.wheel(0, 500 + Math.random() * 400); await sleep(1500 + Math.random() * 1500); } };
const out = [];
try {
  await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 40000 }); await sleep(4000); await scroll(5);
  const posts = await page.evaluate(() => document.querySelectorAll('[role="article"]').length);
  out.push({ passo: 'página inicial', url: page.url().slice(0, 60), artigos: posts, ok: posts > 0 });
  for (const t of terms) for (const kind of ['top', 'videos']) {
    const url = `https://www.facebook.com/search/${kind}/?q=${encodeURIComponent(t)}`;
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 }); await sleep(4000); await scroll(3);
      const r = await page.evaluate(() => ({
        resultados: document.querySelectorAll('[role="article"], [role="feed"] > div').length,
        videos: document.querySelectorAll('a[href*="/reel/"], a[href*="/watch/?v="], a[href*="/videos/"]').length,
        login: !!document.querySelector('input[name="pass"]'),
      }));
      out.push({ passo: `busca ${kind}: ${t}`, url: page.url().slice(0, 70), ...r, ok: !r.login && (r.resultados > 0 || r.videos > 0) });
    } catch (e) { out.push({ passo: `busca ${kind}: ${t}`, ok: false, erro: String(e.message).split('\n')[0].slice(0, 90) }); }
  }
} finally { try { await browser.close(); } catch {} try { await ads.stop(p.id); } catch {} }
for (const o of out) console.log(JSON.stringify(o));
