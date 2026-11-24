// Gera reports/proxies.html: perfis × proxies (por IP), vencimentos e perfis sem proxy. Sem credenciais.
// Uso: PROXYCHEAP_KEY=... PROXYCHEAP_SECRET=... node scripts/proxies-report.js
import fs from 'node:fs';
import path from 'node:path';
import { ads } from '../src/adspower.js';
import { ROOT } from '../src/config.js';

const KEY = process.env.PROXYCHEAP_KEY, SECRET = process.env.PROXYCHEAP_SECRET;
if (!KEY || !SECRET) { console.error('Defina PROXYCHEAP_KEY e PROXYCHEAP_SECRET'); process.exit(1); }

const res = await fetch('https://api.proxy-cheap.com/proxies', { headers: { 'X-Api-Key': KEY, 'X-Api-Secret': SECRET, Accept: 'application/json' }, redirect: 'manual' });
if (!res.ok) { console.error('Proxy-Cheap respondeu', res.status); process.exit(1); }
const pc = new Map();
for (const p of (await res.json()).proxies) pc.set(p.connection.connectIp, { country: p.countryCode, expires: new Date(p.expiresAt), auto: p.autoExtendEnabled, status: p.status });

const rows = [];
for (let page = 1; ; page++) {
  const d = await ads.call('/api/v1/user/list', { page, page_size: 100 });
  rows.push(...(d.list || []));
  if ((d.list || []).length < 100) break;
}
rows.sort((a, b) => Number(a.serial_number) - Number(b.serial_number));

const by = new Map(), none = [];
for (const r of rows) {
  const h = r.user_proxy_config?.proxy_host;
  if (!h) { none.push(r); continue; }
  if (!by.has(h)) by.set(h, []);
  by.get(h).push(r);
}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const days = (d) => Math.ceil((d - Date.now()) / 864e5);
const fmt = (d) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
const flag = (c) => (c && c.length === 2 ? String.fromCodePoint(...[...c.toUpperCase()].map((x) => 127397 + x.charCodeAt(0))) : '🌐');

const groups = [...by.entries()].map(([ip, list]) => ({ ip, list, info: pc.get(ip) })).sort((a, b) => (a.info?.expires ?? 0) - (b.info?.expires ?? 0));
const soon = groups.filter((g) => g.info && days(g.info.expires) <= 7);
const shared = groups.filter((g) => g.list.length > 1);
const withProxy = rows.length - none.length;

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Perfis × Proxies</title>
<style>:root{--bg:#f5f6f8;--card:#fff;--ink:#14171c;--mut:#6b7280;--line:#e5e7eb;--acc:#2563eb;--bad:#dc2626;--warn:#d97706;--ok:#16a34a;--chip:#eef2ff}
@media(prefers-color-scheme:dark){:root{--bg:#0e1116;--card:#171b22;--ink:#e8eaed;--mut:#98a2b3;--line:#262c36;--acc:#5b8def;--bad:#f87171;--warn:#fbbf24;--ok:#34d399;--chip:#1e2740}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:24px;max-width:1200px;margin:auto}
h1{font-size:20px;margin:0 0 4px}h2{font-size:13px;color:var(--mut);text-transform:uppercase;letter-spacing:.04em;margin:26px 0 8px}.mut{color:var(--mut)}
.kp{display:flex;gap:10px;flex-wrap:wrap;margin:16px 0}.kp div{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 16px;min-width:130px}.kp b{display:block;font-size:22px}.kp span{color:var(--mut);font-size:12px}
input{font:inherit;padding:8px 12px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--ink);width:100%;max-width:380px}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden;margin-top:8px}th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}th{color:var(--mut);font-weight:500;font-size:12px}
.chip{display:inline-block;background:var(--chip);border-radius:99px;padding:1px 9px;margin:2px 3px 2px 0;font-size:12px;white-space:nowrap}.bad{color:var(--bad);font-weight:600}.warn{color:var(--warn);font-weight:600}.ok{color:var(--ok)}
tr.hide{display:none}code{font-size:13px}</style></head><body>
<h1>Perfis × Proxies</h1><div class="mut">Gerado em ${new Date().toLocaleString('pt-BR')} · sem credenciais</div>
<div class="kp"><div><b>${rows.length}</b><span>perfis no AdsPower</span></div><div><b>${withProxy}</b><span>com proxy</span></div><div><b class="${none.length ? 'warn' : ''}">${none.length}</b><span>sem proxy</span></div><div><b>${groups.length}</b><span>IPs distintos</span></div><div><b>${shared.length}</b><span>IPs compartilhados</span></div><div><b class="${soon.length ? 'bad' : ''}">${soon.length}</b><span>vencem em ≤ 7 dias</span></div></div>
<input id="q" placeholder="Filtrar por perfil, IP ou país…" autofocus>
<h2>Proxies (ordenados por vencimento)</h2>
<table id="t"><tr><th>IP</th><th>País</th><th>Vence</th><th>Renovação auto.</th><th>Perfis</th><th>Qtd</th></tr>
${groups.map((g) => { const d = g.info ? days(g.info.expires) : null; const cls = d === null ? '' : d <= 7 ? 'bad' : d <= 14 ? 'warn' : '';
  return `<tr><td><code>${esc(g.ip)}</code></td><td>${g.info ? flag(g.info.country) + ' ' + g.info.country : '<span class="mut">fora da conta</span>'}</td><td class="${cls}">${g.info ? fmt(g.info.expires) + ` <span class="mut">(${d} d)</span>` : '—'}</td><td>${g.info ? (g.info.auto ? '<span class="ok">sim</span>' : '<span class="warn">não</span>') : '—'}</td><td>${g.list.map((r) => `<span class="chip" title="${esc(r.name)} · ${esc(r.user_id)} · grupo ${esc(r.group_name)}">${esc(r.name.length > 24 ? r.name.split('@')[0] : r.name)}</span>`).join('')}</td><td>${g.list.length}</td></tr>`; }).join('')}</table>
<h2>Perfis sem proxy (${none.length})</h2>
<table id="t2"><tr><th>#</th><th>Perfil</th><th>ID</th><th>Grupo</th></tr>
${none.map((r) => `<tr><td>${esc(r.serial_number)}</td><td>${esc(r.name)}</td><td><code>${esc(r.user_id)}</code></td><td>${esc(r.group_name)}</td></tr>`).join('') || '<tr><td colspan=4 class="mut">Todos os perfis têm proxy.</td></tr>'}</table>
<script>const q=document.getElementById('q');q.oninput=()=>{const v=q.value.toLowerCase();document.querySelectorAll('#t tr:not(:first-child),#t2 tr:not(:first-child)').forEach(r=>r.classList.toggle('hide',v&&!r.textContent.toLowerCase().includes(v)))}</script>
</body></html>`;
const out = path.join(ROOT, 'reports', 'proxies.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`OK: ${out} · ${rows.length} perfis · ${groups.length} IPs · ${none.length} sem proxy · ${soon.length} vencem em ≤7 dias`);
process.exit(0);
