import { syncCofre } from './cofre.js';
import express from 'express';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { ROOT, getConfig, updateConfig, maskedConfig } from './config.js';
import { scheduler } from './scheduler.js';
import { sysmon } from './sysmon.js';
import { store } from './store.js';

sysmon.start();

// ---------- segurança: senha + somente rede local ----------
const strip = (ip = '') => ip.replace(/^::ffff:/, '');
const isLocal = (ip) => ['127.0.0.1', '::1'].includes(strip(ip));
const isPrivate = (ip) => {
  ip = strip(ip);
  return isLocal(ip) || /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|fe80:|fc|fd)/i.test(ip);
};

if (!getConfig().dashboard.password) {
  const pw = crypto.randomBytes(9).toString('base64url');
  updateConfig({ dashboard: { password: pw } });
  console.log(`\nSenha do painel (gerada agora): ${pw}\nEla fica salva em data/config.json\n`);
}

const sessions = new Map(); // token -> expiração
const fails = new Map(); // ip -> [timestamps]
const parseCookies = (h = '') => Object.fromEntries(h.split(';').map((c) => c.trim().split('=').map(decodeURIComponent)).filter((x) => x[0]));
const authed = (req) => {
  const t = parseCookies(req.headers.cookie).wsid;
  const exp = t && sessions.get(t);
  return !!exp && exp > Date.now();
};

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

app.use((req, res, next) => {
  if (!isPrivate(req.socket.remoteAddress)) return res.status(403).send('Acesso permitido apenas na rede local.');
  next();
});

const LOGIN = (msg = '') => `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Entrar</title>
<style>body{font:15px -apple-system,sans-serif;display:grid;place-items:center;height:100vh;margin:0;background:#0e1116;color:#e8eaed}form{display:grid;gap:12px;width:min(320px,90vw)}input,button{font:inherit;padding:10px;border-radius:8px;border:1px solid #333;background:#171b22;color:inherit}button{background:#2563eb;border-color:#2563eb;cursor:pointer}p{color:#f87171;margin:0}</style>
<form method=post action=/login><h2>🔥 Aquecimento AdsPower</h2><input type=password name=password placeholder="Senha do painel" autofocus required><button>Entrar</button>${msg ? `<p>${msg}</p>` : ''}</form>`;

app.get('/login', (_req, res) => res.send(LOGIN()));
app.post('/login', express.urlencoded({ extended: false }), (req, res) => {
  const ip = strip(req.socket.remoteAddress);
  const recent = (fails.get(ip) || []).filter((t) => Date.now() - t < 600000);
  if (recent.length >= 5) return res.status(429).send(LOGIN('Muitas tentativas. Aguarde 10 minutos.'));
  const a = Buffer.from(String(req.body.password || '')), b = Buffer.from(getConfig().dashboard.password);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    fails.set(ip, [...recent, Date.now()]);
    return res.status(401).send(LOGIN('Senha incorreta.'));
  }
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, Date.now() + 7 * 864e5);
  res.setHeader('Set-Cookie', `wsid=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${7 * 86400}`);
  res.redirect('/');
});

app.use((req, res, next) => {
  if (authed(req)) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'não autenticado' });
  res.redirect('/login');
});

app.use(express.static(path.join(ROOT, 'public')));

// ---------- API ----------
app.get('/api/state', (req, res) => {
  res.json({ scheduler: scheduler.snapshot(), sys: sysmon.snapshot(), config: maskedConfig(), isLocal: isLocal(req.socket.remoteAddress), now: Date.now() });
});
app.get('/api/report', (_req, res) => res.json(store.report()));
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

app.post('/api/config', (req, res) => {
  const patch = req.body || {};
  delete patch.dashboard; // senha/porta só no arquivo
  // chave e URL do AdsPower: só editáveis no próprio Mac
  if (!isLocal(req.socket.remoteAddress)) delete patch.adspower;
  else if (patch.adspower && !patch.adspower.apiKey) delete patch.adspower.apiKey;
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
    const profiles = scheduler.profiles.length ? scheduler.profiles : await scheduler.loadProfiles();
    const r = await syncCofre(profiles);
    for (const p of profiles) if (store.flags(p.id).fbPages) store.setFlags(p.id, { fbPages: [] }); // limpa as de sincronizações anteriores
    for (const { profile, pages } of r.byProfile.values()) store.setFlags(profile.id, { fbPages: pages });
    res.json({ ok: true, total: r.total, perfis: r.byProfile.size, paginas: [...r.byProfile.values()].reduce((n, x) => n + x.pages.length, 0), semPerfil: r.unmatched });
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
