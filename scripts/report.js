// Gera um HTML por perfil com os sites acessados + um índice. Uso: npm run report
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, ROOT } from '../src/config.js';

const OUT = path.join(ROOT, 'reports');
fs.mkdirSync(OUT, { recursive: true });
const readJsonl = (f) => { try { return fs.readFileSync(path.join(DATA_DIR, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
const visits = readJsonl('visits.jsonl'), sessions = readJsonl('sessions.jsonl');

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const dt = (t) => new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const dur = (ms) => { const m = Math.round(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m} min`; };
const flag = (c) => (c && c.length === 2 ? String.fromCodePoint(...[...c.toUpperCase()].map((x) => 127397 + x.charCodeAt(0))) : '🌐');
const slug = (s) => String(s).replace(/[^a-z0-9]+/gi, '-').toLowerCase();

const CSS = `:root{--bg:#f5f6f8;--card:#fff;--ink:#14171c;--mut:#6b7280;--line:#e5e7eb;--acc:#2563eb;--ok:#16a34a;--warn:#d97706}
@media(prefers-color-scheme:dark){:root{--bg:#0e1116;--card:#171b22;--ink:#e8eaed;--mut:#98a2b3;--line:#262c36;--acc:#5b8def;--ok:#34d399;--warn:#fbbf24}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:24px;max-width:1100px;margin:auto}
h1{font-size:20px;margin:0 0 4px}h2{font-size:13px;color:var(--mut);text-transform:uppercase;letter-spacing:.04em;margin:24px 0 8px}a{color:var(--acc);text-decoration:none}
.kp{display:flex;gap:10px;flex-wrap:wrap;margin:14px 0}.kp div{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 14px}.kp b{display:block;font-size:20px}.kp span{color:var(--mut);font-size:12px}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden;font-size:13px}th,td{text-align:left;padding:7px 10px;border-bottom:1px solid var(--line)}th{color:var(--mut);font-weight:500;font-size:12px}
.ok{color:var(--ok)}.warn{color:var(--warn)}.mut{color:var(--mut)}td.t{max-width:380px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}details{margin-top:8px}summary{cursor:pointer;font-weight:600}`;
const page = (title, body) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${CSS}</style></head><body>${body}</body></html>`;

// agrupa por perfil
const profiles = new Map();
for (const s of sessions) {
  const p = profiles.get(s.profileId) || { id: s.profileId, name: s.name, country: s.country, persona: s.persona, sessions: [], visits: [] };
  p.name = s.name; p.country = s.country; p.persona = s.persona; p.sessions.push(s);
  profiles.set(s.profileId, p);
}
for (const v of visits) {
  const p = profiles.get(v.profileId) || { id: v.profileId, name: v.profileId, country: v.country, persona: '', sessions: [], visits: [] };
  p.visits.push(v); profiles.set(v.profileId, p);
}

const rows = [];
for (const p of [...profiles.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt', { numeric: true }))) {
  const ok = p.visits.filter((v) => v.status === 'ok');
  const navMs = ok.reduce((a, v) => a + v.dwellMs, 0);
  const by = new Map();
  for (const v of p.visits) {
    const d = by.get(v.domain) || { domain: v.domain, n: 0, ok: 0, ms: 0, cats: new Set(), reasons: {}, first: v.ts, last: v.ts, sample: v.url };
    d.n++; d.first = Math.min(d.first, v.ts); d.last = Math.max(d.last, v.ts);
    if (v.category && v.category !== '-') d.cats.add(v.category);
    if (v.status === 'ok') { d.ok++; d.ms += v.dwellMs; } else d.reasons[v.reason] = (d.reasons[v.reason] || 0) + 1;
    by.set(v.domain, d);
  }
  const sites = [...by.values()].sort((a, b) => b.ms - a.ms || b.n - a.n);
  const lastRun = p.sessions.length ? Math.max(...p.sessions.map((s) => s.endedAt)) : 0;
  const body = `<p><a href="index.html">← todos os perfis</a></p>
<h1>${flag(p.country)} ${esc(p.name)}</h1><div class="mut">${esc(p.id)} · persona: ${esc(p.persona) || '—'}</div>
<div class="kp"><div><b>${p.sessions.length}</b><span>sessões</span></div><div><b>${ok.length}</b><span>páginas acessadas</span></div><div><b>${p.visits.length - ok.length}</b><span>puladas</span></div><div><b>${dur(navMs)}</b><span>tempo navegando</span></div><div><b>${by.size}</b><span>sites diferentes</span></div><div><b>${lastRun ? dt(lastRun) : '—'}</b><span>última sessão</span></div></div>
<h2>Sites acessados</h2>
<table><tr><th>Site</th><th>Acessos</th><th>Tempo total</th><th>Tempo médio</th><th>Temas</th><th>Puladas (motivo)</th><th>Último acesso</th></tr>
${sites.map((d) => `<tr><td><a href="https://${esc(d.domain)}" target="_blank" rel="noopener">${esc(d.domain)}</a></td><td>${d.ok}</td><td>${dur(d.ms)}</td><td>${d.ok ? Math.round(d.ms / d.ok / 1000) + ' s' : '—'}</td><td class="mut">${esc([...d.cats].join(', '))}</td><td class="warn">${esc(Object.entries(d.reasons).map(([r, n]) => `${r} ×${n}`).join(', '))}</td><td class="mut">${dt(d.last)}</td></tr>`).join('')}</table>
<details><summary>Histórico completo (${p.visits.length} visitas, mais recentes primeiro)</summary>
<table><tr><th>Quando</th><th>Site</th><th>Página</th><th>Origem</th><th>Tempo</th><th>Resultado</th></tr>
${[...p.visits].reverse().map((v) => `<tr><td class="mut">${dt(v.ts)}</td><td>${esc(v.domain)}</td><td class="t" title="${esc(v.url)}">${esc(v.title || v.url)}</td><td class="mut">${esc(v.source)}</td><td>${v.status === 'ok' ? Math.round(v.dwellMs / 1000) + ' s' : '—'}</td><td>${v.status === 'ok' ? '<span class="ok">ok</span>' : `<span class="warn">${esc(v.reason)}</span>`}</td></tr>`).join('')}</table></details>`;
  const file = `${slug(p.name)}-${p.id}.html`;
  fs.writeFileSync(path.join(OUT, file), page(`${p.name} · sites acessados`, body));
  rows.push({ p, file, ok: ok.length, skipped: p.visits.length - ok.length, navMs, sites: by.size, lastRun });
}

const index = `<h1>🔥 Relatório por perfil</h1><div class="mut">Gerado em ${dt(Date.now())} · ${rows.length} perfis · ${visits.length} visitas</div>
<table style="margin-top:16px"><tr><th>Perfil</th><th>País</th><th>Sessões</th><th>Páginas</th><th>Puladas</th><th>Sites</th><th>Tempo</th><th>Última</th></tr>
${rows.map((r) => `<tr><td><a href="${r.file}">${esc(r.p.name)}</a></td><td>${flag(r.p.country)} ${esc(r.p.country)}</td><td>${r.p.sessions.length}</td><td>${r.ok}</td><td class="warn">${r.skipped}</td><td>${r.sites}</td><td>${dur(r.navMs)}</td><td class="mut">${r.lastRun ? dt(r.lastRun) : '—'}</td></tr>`).join('')}</table>`;
fs.writeFileSync(path.join(OUT, 'index.html'), page('Relatório por perfil', index));
console.log(`${rows.length} relatórios em ${OUT}`);
