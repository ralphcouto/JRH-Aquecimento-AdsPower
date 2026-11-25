// Login do painel: Google (OAuth) com lista de e-mails, login único do Hub (cookie "jrhsso") e senha local como reserva.
import crypto from 'node:crypto';
import express from 'express';
import { getConfig, updateConfig } from './config.js';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SESSION_HOURS = 24 * 7;
const SSO_COOKIE = 'jrhsso';

const csv = (s) => String(s || '').split(/[,;\s]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
const strip = (ip = '') => ip.replace(/^::ffff:/, '');
const parseCookies = (h = '') => Object.fromEntries(h.split(';').map((c) => { const i = c.indexOf('='); return [c.slice(0, i).trim(), decodeURIComponent(c.slice(i + 1).trim())]; }).filter((x) => x[0]));
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const sessions = new Map(); // hash do token -> { email, name, method, exp }
const fails = new Map(); // ip -> [timestamps]
const sha = (x) => crypto.createHash('sha256').update(x).digest('hex');

export const googleEnabled = () => { const a = getConfig().auth; return !!(a.googleClientId && a.googleClientSecret); };
export const ssoEnabled = () => String(getConfig().auth.ssoSecret || '').length >= 32;
export const passwordAllowed = () => !googleEnabled() || getConfig().auth.passwordLogin !== false;

export function emailAllowed(email) {
  const a = getConfig().auth;
  email = String(email || '').toLowerCase();
  return csv(a.allowedEmails).includes(email) || csv(a.allowedDomains).map((d) => d.replace(/^@/, '')).includes(email.split('@')[1]);
}

/** Endereço público que o navegador usou (para o retorno do Google): lista configurada > cabeçalhos do proxy. */
export function baseUrl(req) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  const urls = String(getConfig().auth.publicUrl || '').split(',').map((u) => u.trim().replace(/\/$/, '')).filter(Boolean);
  const hit = urls.find((u) => new URL(u).host === host);
  if (urls.length) return hit || urls[0]; // com endereço público configurado, nunca confia no cabeçalho Host
  const proto = String(req.headers['x-forwarded-proto'] || (req.socket.encrypted ? 'https' : 'http')).split(',')[0].trim();
  return `${proto}://${host}`;
}

/** O navegador falou por HTTPS (direto ou pelo proxy/túnel)? Decide o atributo Secure dos cookies. */
const isHttps = (req) => String(req.headers['x-forwarded-proto'] || (req.socket.encrypted ? 'https' : 'http')).split(',')[0].trim() === 'https';

function newSession(user) {
  const tok = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  for (const [k, v] of sessions) if (v.exp < now) sessions.delete(k);
  sessions.set(sha(tok), { ...user, exp: now + SESSION_HOURS * 3600e3 });
  return tok;
}
const cookieAttrs = (secure, age) => `Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure ? '; Secure' : ''}`;

/** Parent domain compartilhado com o Hub (hub.nas2800.com → nas2800.com). '' se não der para compartilhar. */
function ssoDomain(base) {
  try {
    const u = new URL(base), p = u.hostname.split('.');
    return u.protocol !== 'https:' || p.length < 3 || /^\d+$/.test(p.at(-1)) ? '' : p.slice(1).join('.');
  } catch { return ''; }
}

/** Confere o bilhete do Hub (mesmo formato do Hub: base64url(json).hex(HMAC-SHA256)). Devolve o e-mail ou ''. */
export function verifySso(value, secret = getConfig().auth.ssoSecret) {
  if (!value || String(secret || '').length < 32) return '';
  const i = value.lastIndexOf('.');
  if (i < 1) return '';
  const body = value.slice(0, i), sig = value.slice(i + 1);
  const good = crypto.createHmac('sha256', secret).update(body).digest('hex');
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return '';
  try {
    const d = JSON.parse(Buffer.from(body, 'base64url').toString());
    return d.v === 1 && Number(d.x) > Date.now() / 1000 && d.e ? String(d.e).toLowerCase() : '';
  } catch { return ''; }
}

const PAGE = (v, { erro = '', google = false, senha = false, hub = '' } = {}) => `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Entrar</title>
<style>body{font:15px Inter,"Segoe UI",system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:radial-gradient(900px 420px at 80% -10%,#4f46e533,transparent),#0b0e17;color:#e6e9f2}.box{display:grid;gap:14px;width:min(340px,90vw);background:#131826;border:1px solid #242b3d;border-radius:16px;padding:28px;box-shadow:0 12px 40px #0008}h2{margin:0;font-size:19px}small{color:#8b95ad}input,button,a.g{font:inherit;padding:11px 12px;border-radius:10px;border:1px solid #242b3d;background:#171d2e;color:inherit;text-align:center;text-decoration:none;cursor:pointer}input:focus{outline:0;border-color:#818cf8;box-shadow:0 0 0 3px #818cf833}button.p{background:linear-gradient(135deg,#4f46e5,#7c3aed);border:0;font-weight:600}a.g{display:block;font-weight:600;background:#fff;color:#1f2937;border:0}a.g:hover,button:hover{filter:brightness(1.08)}p{color:#f87171;margin:0;font-size:13px}form{display:grid;gap:10px}.sep{color:#8b95ad;font-size:12px;text-align:center}</style>
<div class=box><div><h2>Aquecimento AdsPower</h2><small>v${esc(v)}</small></div>
${google ? '<a class=g href="/auth/google">Entrar com Google</a>' : ''}${google && senha ? '<div class=sep>ou</div>' : ''}
${senha ? '<form method=post action=/login><input type=password name=password placeholder="Senha do painel" required><button class=p>Entrar</button></form>' : ''}
${!google && !senha ? '<p>Nenhum método de login configurado.</p>' : ''}${erro ? `<p>${esc(erro)}</p>` : ''}${hub ? `<small><a style="color:#8b95ad" href="${esc(hub)}">Voltar ao Hub</a></small>` : ''}</div>`;

/** Monta /login, /auth/google*, /logout, /health e o porteiro. Tudo que for registrado depois fica atrás do login. */
export function mountAuth(app, { version }) {
  app.get('/health', (_req, res) => res.json({ ok: true, version }));

  const loginPage = (res, code = 200, erro = '') => res.status(code).send(PAGE(version, { erro, google: googleEnabled(), senha: passwordAllowed(), hub: getConfig().hub.url }));
  app.get('/login', (_req, res) => loginPage(res));

  app.post('/login', express.urlencoded({ extended: false }), (req, res) => {
    if (!passwordAllowed()) return loginPage(res, 403, 'Login por senha desligado. Use o Google.');
    const ip = strip(req.socket.remoteAddress);
    const recent = (fails.get(ip) || []).filter((t) => Date.now() - t < 600000);
    if (recent.length >= 5) return loginPage(res, 429, 'Muitas tentativas. Aguarde 10 minutos.');
    const a = Buffer.from(String(req.body.password || '')), b = Buffer.from(String(getConfig().dashboard.password || ''));
    if (!b.length || a.length !== b.length || !crypto.timingSafeEqual(a, b)) { fails.set(ip, [...recent, Date.now()]); return loginPage(res, 401, 'Senha incorreta.'); }
    const secure = isHttps(req);
    res.setHeader('Set-Cookie', `wsid=${newSession({ email: 'senha', name: 'Administrador', method: 'senha' })}; ${cookieAttrs(secure, SESSION_HOURS * 3600)}`);
    res.redirect('/');
  });

  app.get('/auth/google', (req, res) => {
    if (!googleEnabled()) return loginPage(res, 503, 'O login Google ainda não foi configurado.');
    const base = baseUrl(req), state = crypto.randomBytes(16).toString('base64url');
    const q = new URLSearchParams({ client_id: getConfig().auth.googleClientId, redirect_uri: base + '/auth/google/callback', response_type: 'code', scope: 'openid email profile', state, prompt: 'select_account' });
    res.setHeader('Set-Cookie', `wsstate=${state}; Path=/auth; HttpOnly; SameSite=Lax; Max-Age=600${isHttps(req) ? '; Secure' : ''}`);
    res.redirect(GOOGLE_AUTH_URL + '?' + q);
  });

  app.get('/auth/google/callback', async (req, res) => {
    const { code, state } = req.query, saved = parseCookies(req.headers.cookie).wsstate;
    if (!code || !state || !saved || state.length !== saved.length || !crypto.timingSafeEqual(Buffer.from(String(state)), Buffer.from(saved))) return loginPage(res, 400, 'Pedido de login inválido. Tente de novo.');
    const base = baseUrl(req), a = getConfig().auth;
    let p;
    try {
      const r = await fetch(GOOGLE_TOKEN_URL, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(15000),
        body: new URLSearchParams({ code: String(code), client_id: a.googleClientId, client_secret: a.googleClientSecret, redirect_uri: base + '/auth/google/callback', grant_type: 'authorization_code' }) });
      const tok = await r.json();
      p = JSON.parse(Buffer.from(String(tok.id_token).split('.')[1], 'base64url').toString()); // veio direto do Google por TLS
    } catch { return loginPage(res, 401, 'Não consegui confirmar o login com o Google. Tente de novo.'); }
    if (!['https://accounts.google.com', 'accounts.google.com'].includes(p.iss) || p.aud !== a.googleClientId || !p.email_verified || Number(p.exp) < Date.now() / 1000) return loginPage(res, 401, 'Login recusado.');
    const email = String(p.email || '').toLowerCase();
    if (!emailAllowed(email)) { console.log(`Login recusado (e-mail não autorizado): ${email}`); return loginPage(res, 403, `O e-mail ${email} não tem acesso. Peça a liberação ao administrador.`); }
    const secure = isHttps(req);
    const cookies = [`wsid=${newSession({ email, name: String(p.name || '').slice(0, 80), method: 'google' })}; ${cookieAttrs(secure, SESSION_HOURS * 3600)}`, 'wsstate=; Path=/auth; Max-Age=0'];
    res.setHeader('Set-Cookie', cookies);
    res.redirect('/');
  });

  const logout = (req, res) => {
    const t = parseCookies(req.headers.cookie).wsid;
    if (t) sessions.delete(sha(t));
    const dom = ssoDomain(baseUrl(req));
    res.setHeader('Set-Cookie', ['wsid=; Path=/; Max-Age=0', ...(dom && ssoEnabled() ? [`${SSO_COOKIE}=; Domain=${dom}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`] : [])]);
    res.redirect('/login');
  };
  app.get('/logout', logout); app.post('/logout', logout);

  // porteiro: sessão própria, ou bilhete do Hub (abre a sessão na hora)
  app.use((req, res, next) => {
    const ck = parseCookies(req.headers.cookie);
    const s = ck.wsid && sessions.get(sha(ck.wsid));
    if (s && s.exp > Date.now()) { req.user = s; return next(); }
    const email = verifySso(ck[SSO_COOKIE]);
    if (email && emailAllowed(email)) {
      const user = { email, name: email, method: 'hub' };
      res.setHeader('Set-Cookie', `wsid=${newSession(user)}; ${cookieAttrs(isHttps(req), SESSION_HOURS * 3600)}`);
      req.user = user;
      return next();
    }
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'não autenticado' });
    res.redirect('/login');
  });
}

/** Gera uma senha local no primeiro uso (só se o login por senha estiver valendo e ela estiver vazia). */
export function ensurePassword() {
  if (!passwordAllowed() || getConfig().dashboard.password) return;
  const pw = crypto.randomBytes(9).toString('base64url');
  updateConfig({ dashboard: { password: pw } });
  console.log(`\nSenha do painel (gerada agora): ${pw}\nEla fica salva em data/config.json\n`);
}
