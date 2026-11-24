// Vincula proxies da conta Proxy-Cheap a perfis NOVOS do AdsPower (que nunca navegaram e estão sem proxy).
// 1) usa proxies livres, um IP por perfil; 2) com --share, divide o resto entre os proxies dos EUA MENOS usados.
// Uso: PROXYCHEAP_KEY=... PROXYCHEAP_SECRET=... node scripts/assign-proxies.js [--group Youtube] [--share] [--country US] [--dry]
// Não compra nada. Credenciais dos proxies nunca são impressas.
import fs from 'node:fs';
import { ads } from '../src/adspower.js';
import { DATA_DIR } from '../src/config.js';

const KEY = process.env.PROXYCHEAP_KEY, SECRET = process.env.PROXYCHEAP_SECRET;
if (!KEY || !SECRET) { console.error('Defina PROXYCHEAP_KEY e PROXYCHEAP_SECRET'); process.exit(1); }
const arg = (n) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : null; };
const group = arg('--group'), country = (arg('--country') || 'US').toUpperCase();
const dry = process.argv.includes('--dry'), share = process.argv.includes('--share');

const res = await fetch('https://api.proxy-cheap.com/proxies', { headers: { 'X-Api-Key': KEY, 'X-Api-Secret': SECRET, Accept: 'application/json' }, redirect: 'manual' });
if (!res.ok) { console.error('Proxy-Cheap respondeu', res.status, '(chave/secret inválidos?)'); process.exit(1); }
const proxies = (await res.json()).proxies.filter((p) => p.status === 'ACTIVE' && p.proxyType === 'SOCKS5' && p.connection.socks5Port);
const ip = (p) => p.connection.connectIp;

const raw = [];
for (let page = 1; ; page++) {
  const d = await ads.call('/api/v1/user/list', { page, page_size: 100 });
  raw.push(...(d.list || []));
  if ((d.list || []).length < 100) break;
}
const usage = new Map(); // ip -> quantos perfis já usam
for (const r of raw) { const h = r.user_proxy_config?.proxy_host; if (h) usage.set(h, (usage.get(h) || 0) + 1); }

let warmedIds = new Set();
try { warmedIds = new Set(fs.readFileSync(`${DATA_DIR}/sessions.jsonl`, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).profileId)); } catch {}
const targets = raw.filter((r) => !r.user_proxy_config?.proxy_host && !warmedIds.has(r.user_id) && (!group || r.group_name === group)).sort((a, b) => Number(a.serial_number) - Number(b.serial_number));

const free = proxies.filter((p) => !usage.has(ip(p)));
const plan = [];
for (let i = 0; i < Math.min(free.length, targets.length); i++) { plan.push({ t: targets[i], p: free[i], shared: false }); usage.set(ip(free[i]), 1); }

if (share && targets.length > plan.length) {
  const soon = Date.now() + 7 * 864e5;
  const cands = proxies.filter((p) => p.countryCode === country && new Date(p.expiresAt).getTime() > soon);
  console.log(`Proxies ${country} elegíveis (não vencem em 7 dias): ${cands.length}`);
  if (!cands.length) { console.error('Nenhum proxy elegível'); process.exit(1); }
  for (const t of targets.slice(plan.length)) {
    const p = cands.reduce((a, b) => ((usage.get(ip(b)) || 0) < (usage.get(ip(a)) || 0) ? b : a)); // o menos usado
    plan.push({ t, p, shared: true }); usage.set(ip(p), (usage.get(ip(p)) || 0) + 1);
  }
}

console.log(`Proxies ativos: ${proxies.length} · perfis novos sem proxy: ${targets.length} · atribuições planejadas: ${plan.length}`);
let ok = 0;
for (const { t, p, shared } of plan) {
  const line = `${t.name} (#${t.serial_number}) ← ${p.countryCode} ${ip(p)}${shared ? ' (compartilhado)' : ''}`;
  if (dry) { console.log('[simulação]', line); continue; }
  const body = { user_id: t.user_id, user_proxy_config: { proxy_soft: 'other', proxy_type: 'socks5', proxy_host: ip(p), proxy_port: String(p.connection.socks5Port), proxy_user: p.authentication.username, proxy_password: p.authentication.password } };
  const r = await ads.post('/api/v1/user/update', body).then(() => true, (e) => { console.log('   erro:', e.message); return false; });
  console.log(r ? `✔ ${line}` : `✖ ${t.name}`);
  if (r) ok++;
}
if (!dry) console.log(`Atribuídos: ${ok}/${plan.length}`);
const hist = {};
for (const [h, n] of usage) if (proxies.some((p) => ip(p) === h)) hist[n] = (hist[n] || 0) + 1;
console.log('Perfis por IP (nº de perfis → nº de IPs):', JSON.stringify(hist));
if (targets.length > plan.length) console.log(`Faltam ${targets.length - plan.length} perfis sem proxy (use --share).`);
process.exit(0);
