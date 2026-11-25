// Cadastro de sites verificados: guarda quais domínios abrem sem bloqueio (captcha, acesso negado, erro).
// Arquivo: data/sites.json  →  { "dominio.com": { ok, status, ms, reason, cookies, categories, checkedAt } }
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './config.js';
import { COUNTRIES, GLOBAL, sitesFor } from './sites.js';

const FILE = path.join(DATA_DIR, 'sites.json');
let cache = null, mtime = 0;

export function loadRegistry() {
  try {
    const m = fs.statSync(FILE).mtimeMs;
    if (!cache || m !== mtime) { cache = JSON.parse(fs.readFileSync(FILE, 'utf8')); mtime = m; }
  } catch { cache = cache || {}; }
  return cache;
}

/** Domínio liberado = nunca testado (benefício da dúvida) ou testado e ok. Reprovado fica de fora. */
export function isAllowed(domain) {
  const e = loadRegistry()[domain.replace(/\/.*$/, '')];
  return !e || e.ok !== false;
}

/** Todos os domínios do catálogo, com as categorias em que aparecem. */
export function catalog() {
  const map = new Map();
  const add = (d, cat) => { const k = d.replace(/\/.*$/, ''); (map.get(k) || map.set(k, new Set()).get(k)).add(cat); };
  for (const [cat, list] of Object.entries(GLOBAL)) list.forEach((d) => add(d, cat));
  for (const c of Object.values(COUNTRIES)) for (const [cat, list] of Object.entries(c.sites)) list.forEach((d) => add(d, cat));
  return map;
}

const BLOCK = /just a moment|attention required|access denied|captcha|unusual traffic|are you a robot|verify you are human|px-captcha|cf-chl|request blocked|pardon our interruption|incapsula|403 forbidden/i;
const COOKIE = /cookie|consent|gdpr|lgpd|privacy preferences/i;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36';

export async function checkSite(domain) {
  const t0 = Date.now();
  try {
    const res = await fetch(`https://${domain}/`, { redirect: 'follow', signal: AbortSignal.timeout(18000), headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9', accept: 'text/html,application/xhtml+xml' } });
    const body = (await res.text()).slice(0, 400000);
    const ms = Date.now() - t0;
    const base = { status: res.status, ms, cookies: COOKIE.test(body), finalHost: new URL(res.url).hostname.replace(/^www\./, ''), checkedAt: Date.now() };
    if (res.status >= 400) return { ...base, ok: false, reason: `HTTP ${res.status}` };
    if (BLOCK.test(body.slice(0, 20000)) && body.length < 60000) return { ...base, ok: false, reason: 'página de bloqueio/captcha' };
    if (body.length < 1500) return { ...base, ok: false, reason: 'página vazia' };
    return { ...base, ok: true, reason: '' };
  } catch (e) {
    return { ok: false, status: 0, ms: Date.now() - t0, reason: String(e.cause?.code || e.message).slice(0, 60), cookies: false, checkedAt: Date.now() };
  }
}

/** Testa todos (ou só os informados) com concorrência limitada e grava o cadastro. */
export async function checkAll({ only, concurrency = 8, onProgress } = {}) {
  const cat = catalog();
  const domains = (only || [...cat.keys()]);
  const reg = { ...loadRegistry() };
  let i = 0, done = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (i < domains.length) {
      const d = domains[i++];
      reg[d] = { ...(await checkSite(d)), categories: [...(cat.get(d) || [])] };
      onProgress?.(++done, domains.length, d, reg[d]);
    }
  }));
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(reg, null, 1));
  cache = reg; mtime = fs.statSync(FILE).mtimeMs;
  return reg;
}

/** Sites da categoria para o país, só os liberados no cadastro (cai para os globais se não sobrar nenhum). */
export function sitesForOk(code, category) {
  const ok = (l) => l.filter((s) => isAllowed(s));
  const own = ok(sitesFor(code, category));
  if (own.length) return own;
  const glob = ok(GLOBAL[category] || []);
  return glob.length ? glob : sitesFor(code, category);
}
