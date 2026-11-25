import { syncCofre } from './cofre.js';
import { allActions } from './fbstats.js';
import { loadRegistry, checkAll } from './siteregistry.js';
import { loadPersonas } from './persona.js';
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import os from 'node:os';
import crypto from 'node:crypto';
import { ROOT, getConfig, updateConfig, maskedConfig } from './config.js';
import { mountAuth, ensurePassword, googleEnabled, ssoEnabled } from './auth.js';
import { scheduler } from './scheduler.js';
import { ads } from './adspower.js';
import { sysmon } from './sysmon.js';
import { store } from './store.js';

sysmon.start();

// ---------- versão (package.json + commit curto, se houver git) ----------
const VERSION = (() => {
  let v = '0.0.0', build = '';
  try { v = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version || v; } catch {}
  try { build = execSync('git rev-parse --short HEAD', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch {}
  return { version: v, build };
})();

// ---------- segurança: rede local + login (Google / Hub / senha) ----------
const strip = (ip = '') => ip.replace(/^::ffff:/, '');
const isLocal = (ip) => ['127.0.0.1', '::1'].includes(strip(ip));
const isPrivate = (ip) => {
  ip = strip(ip);
  return isLocal(ip) || /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|fe80:|fc|fd)/i.test(ip);
};
ensurePassword();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', false);
app.use(express.json({ limit: '300kb' }));

app.use((req, res, next) => {
  if (!isPrivate(req.socket.remoteAddress)) return res.status(403).send('Acesso permitido apenas na rede local.');
  next();
});
mountAuth(app, { version: VERSION.version });
// quem pode mexer em credenciais: o próprio computador ou quem entrou por Google/Hub (e-mail autorizado)
const canAdmin = (req) => isLocal(req.socket.remoteAddress) || req.user?.method === 'google' || req.user?.method === 'hub';

app.use(express.static(path.join(ROOT, 'public')));

// ---------- API ----------
app.get('/api/state', (req, res) => {
  res.json({ scheduler: scheduler.snapshot(), sys: sysmon.snapshot(), config: maskedConfig(), isLocal: canAdmin(req), user: req.user ? { email: req.user.email, name: req.user.name, method: req.user.method } : null, auth: { google: googleEnabled(), sso: ssoEnabled() }, now: Date.now(), ...VERSION });
});
app.get('/api/report', (_req, res) => res.json(store.report()));
// cadastro de sites verificados e perfis de usuário (personas)
let siteJob = null;
app.get('/api/sites', (_req, res) => res.json({ checking: siteJob, sites: Object.entries(loadRegistry()).map(([domain, e]) => ({ domain, ...e })) }));
app.post('/api/sites-check', (_req, res) => {
  if (siteJob) return res.json({ ok: true, checking: siteJob });
  siteJob = { done: 0, total: 0 };
  checkAll({ onProgress: (n, t) => { siteJob = { done: n, total: t }; } }).catch(() => {}).finally(() => { siteJob = null; });
  res.json({ ok: true, checking: siteJob });
});
app.get('/api/personas', (_req, res) => res.json(loadPersonas()));
// índice dos perfis que já navegaram (funciona mesmo com o AdsPower fechado)
app.get('/api/history-index', (_req, res) => {
  const m = new Map();
  for (const s of store.sessions) {
    const x = m.get(s.profileId) || { id: s.profileId, name: s.name, sessions: 0, pages: 0, lastRun: 0 };
    x.name = s.name || x.name; x.sessions++; x.lastRun = Math.max(x.lastRun, s.endedAt || 0); m.set(s.profileId, x);
  }
  for (const v of store.visits) { const x = m.get(v.profileId) || { id: v.profileId, name: v.profileId, sessions: 0, pages: 0, lastRun: 0 }; x.pages++; m.set(v.profileId, x); }
  res.json([...m.values()]);
});
// histórico completo de um perfil: sessões, páginas visitadas e ações no Facebook
app.get('/api/history', (req, res) => {
  const id = String(req.query.profileId || '');
  if (!id) return res.status(400).json({ error: 'profileId obrigatório' });
  const cap = Math.min(Number(req.query.limit) || 5000, 20000);
  const visits = store.visits.filter((v) => v.profileId === id).slice(-cap);
  const sessions = store.sessions.filter((s) => s.profileId === id);
  const actions = allActions().filter((a) => a.profileId === id).slice(-cap);
  res.json({ profileId: id, visits, sessions, actions });
});
app.get('/api/sys-history', (_req, res) => res.json(sysmon.history));
app.get('/api/export/visits.csv', (_req, res) => res.type('text/csv').attachment('visitas.csv').send(store.csv()));

app.post('/api/control', async (req, res) => {
  try {
    const { action } = req.body;
    if (action === 'start') await scheduler.start();
    else if (action === 'pause') scheduler.pause();
    else if (action === 'resume') scheduler.resume();
    else if (action === 'stop') scheduler.stop();
    else return res.status(400).json({ error: 'ação inválida' });
    res.json({ ok: true, status: scheduler.status });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

const SECRET_PATHS = ['adspower.apiKey', 'adspower.bridgeToken', 'cofre.apiKey', 'auth.googleClientSecret', 'auth.ssoSecret'];
const ADMIN_ONLY = ['adspower', 'cofre', 'auth', 'hub'];
app.post('/api/config', (req, res) => {
  const patch = req.body || {};
  delete patch.dashboard; // porta/senha só no arquivo ou no ambiente
  delete patch.hasSecret; delete patch.locked;
  if (!canAdmin(req)) for (const k of ADMIN_ONLY) delete patch[k];
  // segredo em branco = manter o atual
  for (const p of SECRET_PATHS) { const k = p.split('.'); let o = patch; for (const x of k.slice(0, -1)) o = o?.[x]; if (o && k.at(-1) in o && !o[k.at(-1)]) delete o[k.at(-1)]; }
  for (const k of ['hasKey']) { if (patch.adspower) delete patch.adspower[k]; if (patch.cofre) delete patch.cofre[k]; }
  updateConfig(patch);
  res.json(maskedConfig());
});

app.post('/api/profile-flags', (req, res) => {
  const { id, facebook, google, fbPage } = req.body || {};
  if (!scheduler.profiles.some((p) => p.id === id)) return res.status(404).json({ error: 'perfil desconhecido' });
  const f = {};
  if (typeof facebook === 'boolean') f.facebook = facebook;
  if (typeof google === 'boolean') f.google = google;
  if (typeof fbPage === 'string') f.fbPage = /^https:\/\/(www\.|m\.|web\.)?facebook\.com\//.test(fbPage.trim()) ? fbPage.trim() : '';
  store.setFlags(id, f);
  res.json(store.flags(id));
});

app.post('/api/cofre-sync', async (_req, res) => {
  try {
    // casa com TODOS os perfis do AdsPower (não só os que estão no escopo do rodízio); sem AdsPower, usa a última lista salva
    let profiles, aviso = '';
    try { profiles = await ads.listProfiles(); } catch (e) {
      const c = ads.cachedProfiles();
      if (!c?.profiles?.length) throw e;
      profiles = c.profiles;
      aviso = `AdsPower não respondeu (${e.message.replace(/^AdsPower: /, '')}). Usei a lista de perfis salva em ${new Date(c.at).toLocaleString('pt-BR')}.`;
    }
    const r = await syncCofre(profiles);
    for (const p of profiles) if (store.flags(p.id).fbPages) store.setFlags(p.id, { fbPages: [] }); // limpa as de sincronizações anteriores
    for (const { profile, pages } of r.byProfile.values()) store.setFlags(profile.id, { fbPages: pages });
    res.json({ ok: true, total: r.total, perfis: r.byProfile.size, paginas: [...r.byProfile.values()].reduce((n, x) => n + x.pages.length, 0), semPerfil: r.unmatched, aviso });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

app.post('/api/test-connection', async (_req, res) => {
  try {
    const profiles = await scheduler.loadProfiles();
    const countries = {};
    for (const p of profiles) countries[p.country || '??'] = (countries[p.country || '??'] || 0) + 1;
    res.json({ ok: true, profiles: profiles.length, countries });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

const { port, host } = getConfig().dashboard;
const server = app.listen(port, host, () => {
  console.log(`Painel local:  http://127.0.0.1:${port}`);
  for (const list of Object.values(os.networkInterfaces()))
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) console.log(`Na sua rede:   http://${i.address}:${port}`);
});
server.on('error', (e) => { console.error(e.message); process.exit(1); });

scheduler.loadProfiles().catch((e) => console.log('Aviso: não foi possível listar perfis ainda →', e.message));

if (process.env.AUTOSTART === '1') {
  const go = () => scheduler.start().then(() => console.log('Rodízio iniciado automaticamente')).catch((e) => { console.log('Autostart falhou (' + e.message + '), tentando em 30s'); setTimeout(go, 30000); });
  setTimeout(go, 3000);
}

const shutdown = async () => {
  console.log('Encerrando… fechando perfis abertos');
  await scheduler.stop().catch(() => {});
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
