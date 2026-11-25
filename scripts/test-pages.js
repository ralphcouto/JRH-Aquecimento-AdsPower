// Teste de acesso: abre cada perfil com páginas do Cofre, visita cada página, rola e fecha. Sem curtir/seguir/comentar.
import { chromium } from 'playwright-core';
import { ads } from '../src/adspower.js';
import { store } from '../src/store.js';
import { inspectPage } from '../src/human.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const only = process.argv[2]; // opcional: nome do perfil
const profiles = (await ads.listProfiles()).filter((p) => store.flags(p.id).fbPages?.length && (!only || p.name === only));
const report = [];
for (const p of profiles) {
  const row = { perfil: p.name, paginas: [] };
  let browser;
  try {
    const { ws } = await ads.start(p.id, { headless: false });
    browser = await chromium.connectOverCDP(ws, { timeout: 45000 });
    const ctx = browser.contexts()[0] || (await browser.newContext());
    const page = ctx.pages()[0] || (await ctx.newPage());
    page.setDefaultTimeout(20000);
    for (const pg of store.flags(p.id).fbPages) {
      const r = { pagina: pg.name };
      try {
        const resp = await page.goto(pg.url, { waitUntil: 'domcontentloaded', timeout: 40000 });
        await sleep(4000);
        const info = await inspectPage(page);
        const url = page.url();
        const state = await page.evaluate(() => ({
          loginForm: !!document.querySelector('input[name="pass"], form[action*="login"]'),
          logged: !!document.querySelector('[aria-label="Your profile"], [aria-label="Seu perfil"], [aria-label="Account"], [aria-label="Conta"]'),
          h1: (document.querySelector('h1')?.innerText || '').slice(0, 60),
        })).catch(() => ({}));
        for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, 500 + Math.random() * 400); await sleep(1500 + Math.random() * 1500); }
        Object.assign(r, { http: resp?.status(), url: url.slice(0, 80), titulo: info.title?.slice(0, 50), flag: info.flag || null, ...state, ok: !info.flag && !state.loginForm && resp?.status() < 400 });
      } catch (e) { r.ok = false; r.erro = String(e.message).split('\n')[0].slice(0, 100); }
      row.paginas.push(r);
    }
  } catch (e) { row.erro = String(e.message).split('\n')[0].slice(0, 120); }
  finally { try { await browser?.close(); } catch {} try { await ads.stop(p.id); } catch {} }
  report.push(row);
  console.log(JSON.stringify(row));
}
