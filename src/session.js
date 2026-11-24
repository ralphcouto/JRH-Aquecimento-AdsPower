import crypto from 'node:crypto';
import { chromium } from 'playwright-core';
import { ads } from './adspower.js';
import { getConfig } from './config.js';
import { store } from './store.js';
import { buildPersona, publicPersona } from './persona.js';
import { countryInfo, sitesFor, queriesFor } from './sites.js';
import { rand, randInt, sleep, moveMouse, wander, readPage, typeLike, inspectPage, pickInternalLink, domainOf, tryConsent } from './human.js';

const pickOne = (a) => a[Math.floor(Math.random() * a.length)];

/**
 * Executa uma "janela" de navegação de um perfil: abre, navega como a persona e fecha.
 * `live` é um objeto mutável que o dashboard lê em tempo real.
 */
export async function runSession({ profile, sliceMs, signal, live }) {
  const cfg = getConfig();
  const sessionId = crypto.randomUUID().slice(0, 8);
  const startedAt = Date.now();
  let country = profile.country || store.state.countries?.[profile.id] || 'US';
  let persona = buildPersona(profile, country);
  let info = countryInfo(country);
  Object.assign(live, {
    sessionId, profileId: profile.id, name: profile.name, serial: profile.serial, country, proxy: profile.proxy,
    persona: publicPersona(persona), startedAt, endsAt: startedAt + sliceMs, phase: 'abrindo perfil',
    url: '', pages: 0, skipped: 0,
  });

  const flags = store.flags(profile.id);
  // perfis logados no Google/Facebook abrem com janela (minimizada): navegador sem janela levanta mais suspeita nessas plataformas
  const headless = cfg.scheduler.headless && !flags.google && !flags.facebook;
  const S = { flags, page: null, persona, profile, country, info, signal, deadline: startedAt + sliceMs, strikes: new Map(), pages: 0, ok: 0, skipped: 0, fails: 0, live, sessionId };
  let browser, error = null;

  try {
    const { ws } = await ads.start(profile.id, { headless });
    if (!ws) throw new Error('AdsPower não devolveu endpoint de automação');
    live.phase = 'conectando';
    browser = await chromium.connectOverCDP(ws, { timeout: 45000 });
    const context = browser.contexts()[0] || (await browser.newContext());
    const pages = context.pages();
    S.page = pages[0] || (await context.newPage());
    for (const p of pages.slice(1)) await p.close().catch(() => {});
    context.on('page', (p) => { if (p !== S.page) p.close().catch(() => {}); }); // bloqueia pop-ups/abas novas
    S.page.setDefaultTimeout(15000);
    if (!profile.country && !store.state.countries?.[profile.id]) {
      // AdsPower ainda não sabe o país do proxy: descobre pelo IP real do navegador
      const c = await detectCountry(S.page);
      if (c) {
        (store.state.countries ||= {})[profile.id] = c; store.saveState();
        country = c; persona = buildPersona(profile, c); info = countryInfo(c);
        Object.assign(S, { country, persona, info });
        live.country = c; live.persona = publicPersona(persona);
      }
    }
    if (!headless) await minimizeWindow(context, S.page);

    while (Date.now() < S.deadline - 6000 && !signal.aborted) {
      const r = Math.random();
      const b = cfg.browsing;
      try {
        let done = false;
        const fb = flags.facebook ? b.facebookRatio : 0;
        if (r < fb) done = await stepFacebook(S);
        else if (r < fb + b.youtubeRatio) done = await stepYoutube(S);
        else if (r < fb + b.youtubeRatio + Math.max(0.05, b.searchRatio + persona.searchBias)) done = await stepSearch(S);
        if (!done) await stepDirect(S);
      } catch (e) {
        if (signal.aborted) break;
        record(S, { url: S.page.url(), source: 'erro', category: '-', status: 'error', reason: shortErr(e), loadMs: 0, dwellMs: 0 });
      }
      if (S.fails >= 8) { error = 'Muitas falhas seguidas (proxy/rede fora?)'; break; }
      await sleep(rand(1000, 3500), signal);
    }
  } catch (e) {
    error = shortErr(e);
  } finally {
    live.phase = 'fechando perfil';
    try { await browser?.close(); } catch {}
    try { await ads.stop(profile.id); } catch (e) { error ||= 'stop: ' + shortErr(e); }
  }

  const summary = {
    id: sessionId, profileId: profile.id, name: profile.name, country, persona: persona.archetype,
    startedAt, endedAt: Date.now(), plannedMs: sliceMs, pages: S.pages, ok: S.ok, skipped: S.skipped, error,
    aborted: signal.aborted ? (signal.reason || 'abortado') : null,
  };
  store.addSession(summary);
  return summary;
}

const shortErr = (e) => String(e?.message || e).split('\n')[0].slice(0, 140);

function record(S, v) {
  const url = v.url || S.page.url();
  const visit = {
    ts: Date.now(), sessionId: S.sessionId, profileId: S.profile.id, country: S.country,
    domain: domainOf(url), url: url.slice(0, 300), title: (v.title || '').slice(0, 120), ...v,
  };
  visit.url = url.slice(0, 300);
  store.addVisit(visit);
  S.pages++; S.live.pages = S.pages;
  if (v.status === 'ok') { S.ok++; S.fails = 0; } else { S.skipped++; S.fails++; S.live.skipped = S.skipped; }
}

function strike(S, domain) { S.strikes.set(domain, (S.strikes.get(domain) || 0) + 1); }
const struck = (S, domain) => (S.strikes.get(domain) || 0) >= 2;

async function navigate(S, url, meta) {
  const { page } = S;
  const cfg = getConfig().browsing;
  const domain = domainOf(url.startsWith('http') ? url : 'https://' + url);
  S.live.phase = `carregando ${domain}`; S.live.url = url;
  const t0 = Date.now();
  let resp;
  try {
    resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: cfg.pageTimeoutSec * 1000 });
  } catch (e) {
    strike(S, domain);
    record(S, { url, ...meta, status: 'skipped', reason: /timeout/i.test(e.message) ? 'timeout' : 'falha_navegacao', error: (String(e.message).match(/net::\w+|NS_\w+/) || [String(e.message).split('\n')[0]])[0].slice(0, 80), loadMs: Date.now() - t0, dwellMs: 0 });
    return null;
  }
  return afterLoad(S, resp?.status(), meta, t0, domain);
}

async function afterLoad(S, status, meta, t0, domain) {
  const loadMs = Date.now() - t0;
  S.live.url = S.page.url();
  await sleep(rand(900, 2000), S.signal);
  let info = await inspectPage(S.page);
  if (info.flag === 'cookie_wall' && (await tryConsent(S.page, getConfig().browsing.acceptCookies))) {
    await sleep(rand(700, 1400), S.signal);
    info = await inspectPage(S.page); // se continuar bloqueado, pula
  }
  let reason = null;
  if (status >= 400) reason = `http_${status}`;
  else if (info.flag) reason = info.flag;
  if (reason) {
    strike(S, domain);
    record(S, { url: S.page.url(), title: info.title, ...meta, status: 'skipped', reason, loadMs, dwellMs: 0 });
    return null;
  }
  return { info, loadMs, domain };
}

/** Permanece na página lendo/rolando, registra a visita e opcionalmente segue links internos. */
async function engage(S, nav, meta, clicksLeft) {
  const cfg = getConfig().browsing;
  const remaining = S.deadline - Date.now() - 4000;
  if (remaining < 3000 || S.signal.aborted) return;
  const want = rand(cfg.minPageSec, cfg.maxPageSec) * 1000 * S.persona.pace;
  const dwell = Math.max(3000, Math.min(want, remaining));
  S.live.phase = `lendo ${nav.domain}`;
  const t0 = Date.now();
  const scrollPx = await readPage(S.page, dwell, S.persona, S.signal);
  record(S, { url: S.page.url(), title: nav.info.title, ...meta, status: 'ok', loadMs: nav.loadMs, dwellMs: Date.now() - t0, scrollPx });

  if (clicksLeft > 0 && Math.random() < 0.75 && S.deadline - Date.now() > 12000 && !S.signal.aborted) {
    const link = await pickInternalLink(S.page);
    if (!link) return;
    S.live.phase = `abrindo link em ${nav.domain}`;
    const before = S.page.url();
    const t1 = Date.now();
    try {
      await moveMouse(S.page, link.x, link.y);
      await sleep(rand(200, 700), S.signal);
      await S.page.mouse.click(link.x, link.y);
      await S.page.waitForLoadState('domcontentloaded', { timeout: getConfig().browsing.pageTimeoutSec * 1000 }).catch(() => {});
    } catch { return; }
    if (S.page.url() === before) return;
    const dom = domainOf(S.page.url());
    const next = await afterLoad(S, 200, { source: 'interno', category: meta.category }, t1, dom);
    if (next) await engage(S, next, { source: 'interno', category: meta.category }, clicksLeft - 1);
  }
}

async function stepDirect(S) {
  const category = S.persona.pickInterest();
  const options = sitesFor(S.country, category).filter((s) => !struck(S, domainOf('https://' + s)));
  if (!options.length) { await sleep(2000, S.signal); return; }
  const site = pickOne(options);
  const meta = { source: 'direto', category };
  const nav = await navigate(S, 'https://' + site, meta);
  if (nav) await engage(S, nav, meta, Math.min(S.persona.depth, getConfig().browsing.maxInternalClicks));
}

async function stepSearch(S) {
  const gdom = `google.${S.info.g}`;
  if (struck(S, gdom)) return false;
  const category = S.persona.pickInterest();
  const query = pickOne(queriesFor(S.persona.lang, category));
  const meta = { source: 'busca', category };
  const { page } = S;
  S.live.phase = `buscando "${query}"`;
  const t0 = Date.now();
  try {
    await page.goto(`https://www.${gdom}/`, { waitUntil: 'domcontentloaded', timeout: getConfig().browsing.pageTimeoutSec * 1000 });
  } catch { strike(S, gdom); return false; }
  await sleep(rand(800, 1600), S.signal);
  let info = await inspectPage(page);
  const box = page.locator('textarea[name=q], input[name=q]').first();
  const bb = info.flag ? null : await box.boundingBox().catch(() => null);
  if (info.flag || !bb) {
    strike(S, gdom); strike(S, gdom);
    record(S, { url: page.url(), title: info.title, ...meta, status: 'skipped', reason: info.flag || 'busca_indisponivel', loadMs: Date.now() - t0, dwellMs: 0 });
    return false;
  }
  await moveMouse(page, bb.x + bb.width / 2 + rand(-30, 30), bb.y + bb.height / 2);
  await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await typeLike(page, query, S.signal);
  await sleep(rand(300, 900), S.signal);
  await page.keyboard.press('Enter');
  await page.waitForLoadState('domcontentloaded', { timeout: 20000 }).catch(() => {});
  await sleep(rand(1200, 2400), S.signal);
  info = await inspectPage(page);
  if (info.flag) {
    strike(S, gdom); strike(S, gdom);
    record(S, { url: page.url(), title: info.title, ...meta, status: 'skipped', reason: info.flag, loadMs: Date.now() - t0, dwellMs: 0 });
    return false;
  }
  // olha os resultados um pouco
  const tr = Date.now();
  const sp = await readPage(page, rand(3000, 7000), S.persona, S.signal);
  record(S, { url: page.url(), title: `Busca: ${query}`, ...meta, status: 'ok', loadMs: Date.now() - t0, dwellMs: Date.now() - tr, scrollPx: sp });

  // escolhe um resultado orgânico (ignora links do Google e anúncios)
  const target = await page.evaluate(() => {
    const links = [...document.querySelectorAll('#search a[href]')].filter((a) => a.querySelector('h3') && !/google\./.test(new URL(a.href, location.href).hostname));
    if (!links.length) return null;
    const a = links[Math.floor(Math.random() * Math.min(links.length, 6))];
    a.scrollIntoView({ block: 'center' });
    a.removeAttribute('target');
    const r = a.getBoundingClientRect();
    return { x: r.left + Math.min(r.width - 4, 30 + Math.random() * 80), y: r.top + r.height / 2 };
  }).catch(() => null);
  if (!target) return true;
  const t1 = Date.now();
  await moveMouse(page, target.x, target.y);
  await sleep(rand(300, 900), S.signal);
  await page.mouse.click(target.x, target.y);
  await page.waitForLoadState('domcontentloaded', { timeout: getConfig().browsing.pageTimeoutSec * 1000 }).catch(() => {});
  if (/google\./.test(domainOf(page.url()))) return true;
  const dom = domainOf(page.url());
  const m2 = { source: 'resultado_busca', category };
  const nav = await afterLoad(S, 200, m2, t1, dom);
  if (nav) await engage(S, nav, m2, Math.min(S.persona.depth, getConfig().browsing.maxInternalClicks));
  return true;
}

async function stepYoutube(S) {
  if (struck(S, 'youtube.com')) return false;
  const category = S.persona.pickInterest();
  const query = pickOne(queriesFor(S.persona.lang, category));
  const meta = { source: 'youtube', category };
  const { page } = S;
  S.live.phase = `YouTube: ${query}`;
  const t0 = Date.now();
  try {
    await page.goto(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, { waitUntil: 'domcontentloaded', timeout: getConfig().browsing.pageTimeoutSec * 1000 });
  } catch { strike(S, 'youtube.com'); return false; }
  await sleep(rand(1500, 2800), S.signal);
  const info = await inspectPage(page);
  if (info.flag || /consent\./.test(page.url())) {
    strike(S, 'youtube.com'); strike(S, 'youtube.com');
    record(S, { url: page.url(), ...meta, status: 'skipped', reason: info.flag || 'cookie_wall', loadMs: Date.now() - t0, dwellMs: 0 });
    return false;
  }
  await readPage(page, rand(2000, 4500), S.persona, S.signal);
  const vid = await page.evaluate(() => {
    const els = [...document.querySelectorAll('ytd-video-renderer a#video-title')].slice(0, 5);
    if (!els.length) return null;
    const a = els[Math.floor(Math.random() * els.length)];
    a.scrollIntoView({ block: 'center' });
    const r = a.getBoundingClientRect();
    return { x: r.left + Math.min(r.width - 4, 20 + Math.random() * 60), y: r.top + r.height / 2 };
  }).catch(() => null);
  if (!vid) return false;
  await moveMouse(page, vid.x, vid.y);
  await page.mouse.click(vid.x, vid.y);
  await page.waitForLoadState('domcontentloaded', { timeout: 20000 }).catch(() => {});
  await sleep(rand(2500, 4000), S.signal);
  await page.evaluate(() => document.querySelectorAll('video,audio').forEach((m) => { m.muted = true; m.volume = 0; })).catch(() => {});
  const watch = Math.min(rand(35, 95) * 1000 * S.persona.pace, S.deadline - Date.now() - 4000);
  if (watch < 5000) return true;
  const tw = Date.now();
  S.live.phase = 'assistindo vídeo';
  const end = tw + watch;
  while (Date.now() < end && !S.signal.aborted) {
    await page.locator('.ytp-skip-ad-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button').first().click({ timeout: 800 }).catch(() => {});
    if (Math.random() < 0.3) await wander(page).catch(() => {});
    await sleep(rand(3000, 6000), S.signal);
  }
  record(S, { url: page.url(), title: (await page.title().catch(() => '')) || 'YouTube', ...meta, status: 'ok', loadMs: Date.now() - t0, dwellMs: Date.now() - tw, scrollPx: 0 });
  return true;
}

async function minimizeWindow(context, page) {
  try {
    const cdp = await context.newCDPSession(page);
    const { windowId } = await cdp.send('Browser.getWindowForTarget');
    await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'minimized' } });
  } catch {}
}

/** Feed do Facebook (só perfis marcados como logados): rolagem passiva, sem curtir/comentar/seguir. */
async function stepFacebook(S) {
  if (struck(S, 'facebook.com')) return false;
  const meta = { source: 'facebook', category: 'social' };
  const nav = await navigate(S, 'https://www.facebook.com/', meta);
  if (!nav) return false;
  await engage(S, nav, meta, 0);
  return true;
}

async function detectCountry(page) {
  try {
    await page.goto('https://ipwho.is/', { waitUntil: 'domcontentloaded', timeout: 20000 });
    const j = JSON.parse(await page.evaluate(() => document.body.innerText));
    return j.success !== false && j.country_code ? String(j.country_code).toUpperCase() : null;
  } catch { return null; }
}
