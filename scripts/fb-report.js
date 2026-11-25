// Relatório do aquecimento no Facebook: reels assistidos, curtidas, comentários e tempo de sessão. Uso: npm run fb-report [-- horas]
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, ROOT } from '../src/config.js';

const readJsonl = (f) => { try { return fs.readFileSync(path.join(DATA_DIR, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
const hours = Number(process.argv[2]) || 24;
const since = Date.now() - hours * 3600 * 1000;
const actions = readJsonl('fb-actions.jsonl').filter((a) => a.ts >= since);
const sessions = readJsonl('sessions.jsonl').filter((s) => s.startedAt >= since);
const visits = readJsonl('visits.jsonl').filter((v) => v.ts >= since && /facebook/.test(v.source || ''));
const state = (() => { try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'state.json'), 'utf8')); } catch { return { flags: {} }; } })();
const fbIds = new Set(Object.entries(state.flags || {}).filter(([, f]) => f.facebook).map(([id]) => id));

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const dt = (t) => new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const dur = (ms) => { const m = Math.round(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m} min`; };

const per = new Map();
const get = (id, name) => { if (!per.has(id)) per.set(id, { id, name: name || id, sessions: 0, sessMs: 0, watch: 0, watchMs: 0, skipped: 0, likes: 0, likeFail: 0, comments: 0, commentFail: 0, texts: [], pages: 0, feed: 0 }); const p = per.get(id); if (name) p.name = name; return p; };
for (const s of sessions) if (fbIds.has(s.profileId)) { const p = get(s.profileId, s.name); p.sessions++; p.sessMs += (s.endedAt - s.startedAt); }
for (const a of actions) {
  const p = get(a.profileId, a.name);
  if (a.type === 'watch') { p.watch++; p.watchMs += a.ms || 0; if (a.skipped) p.skipped++; }
  else if (a.type === 'like') p.likes++;
  else if (a.type === 'like_falhou') p.likeFail++;
  else if (a.type === 'comment') { p.comments++; p.texts.push({ ts: a.ts, text: a.text, url: a.url }); }
  else if (a.type === 'comment_falhou') p.commentFail++;
}
for (const v of visits) { const p = get(v.profileId); if (v.status === 'ok') { if (v.source === 'facebook-pagina') p.pages++; else if (v.source === 'facebook') p.feed++; } }

const rows = [...per.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt', { numeric: true }));
const sum = (k) => rows.reduce((n, r) => n + r[k], 0);
const tot = { sessions: sum('sessions'), sessMs: sum('sessMs'), watch: sum('watch'), watchMs: sum('watchMs'), likes: sum('likes'), comments: sum('comments'), likeFail: sum('likeFail'), commentFail: sum('commentFail'), pages: sum('pages'), feed: sum('feed') };
const first = Math.min(...[...actions.map((a) => a.ts), ...sessions.map((s) => s.startedAt)], Date.now());
const last = Math.max(...[...actions.map((a) => a.ts), ...sessions.map((s) => s.endedAt || 0)], 0);

const md = `# Relatório de aquecimento no Facebook
Período: ${dt(first)} → ${dt(last)} (últimas ${hours} h) · gerado em ${dt(Date.now())}

## Totais
- Sessões: ${tot.sessions} · tempo de sessão: ${dur(tot.sessMs)}
- Reels assistidos: ${tot.watch} (tempo assistindo: ${dur(tot.watchMs)})
- Curtidas confirmadas: ${tot.likes} (tentativas sem confirmação: ${tot.likeFail})
- Comentários confirmados: ${tot.comments} (tentativas sem confirmação: ${tot.commentFail})
- Visitas à página própria: ${tot.pages} · visitas ao feed: ${tot.feed}

## Por perfil
| Perfil | Sessões | Tempo de sessão | Reels | Tempo assistindo | Curtidas | Comentários | Pág. própria | Feed |
|---|---|---|---|---|---|---|---|---|
${rows.map((r) => `| ${r.name} | ${r.sessions} | ${dur(r.sessMs)} | ${r.watch} | ${dur(r.watchMs)} | ${r.likes} | ${r.comments} | ${r.pages} | ${r.feed} |`).join('\n')}

## Comentários publicados
${rows.flatMap((r) => r.texts.map((t) => `- ${dt(t.ts)} · ${r.name}: "${t.text}" — ${t.url}`)).join('\n') || '(nenhum)'}

## Observações
- "Sem confirmação" = o clique foi feito, mas o Facebook não mostrou o resultado na tela; pode ter sido publicado mesmo assim.
- Erros de sessão: ${sessions.filter((s) => s.error).map((s) => `${s.name}: ${s.error}`).join('; ') || 'nenhum'}
`;
const OUT = path.join(ROOT, 'reports');
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'relatorio-facebook.md'), md);
const html = `<!doctype html><meta charset="utf-8"><title>Relatório Facebook</title><style>body{font:14px/1.5 system-ui;max-width:1000px;margin:24px auto;padding:0 16px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:6px 10px;text-align:left}th{background:#f3f4f6}</style><pre style="white-space:pre-wrap;font:inherit">${esc(md)}</pre>`;
fs.writeFileSync(path.join(OUT, 'relatorio-facebook.html'), html);
console.log(md);
