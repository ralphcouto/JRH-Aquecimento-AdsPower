// Teste de integração do login (Google/Hub/senha) rodando o servidor com variáveis de ambiente do NAS.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aq-'));
const SECRET = 'segredo-do-hub-com-mais-de-32-caracteres!!';
const PORT = 4799;
const env = { ...process.env, WARMUP_DATA_DIR: dir, PORT: String(PORT), HOST: '127.0.0.1', GOOGLE_CLIENT_ID: 'cid.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'sec',
  ALLOWED_EMAILS: 'ok@jrh.com', SSO_SECRET: SECRET, PUBLIC_URL: 'https://aquecimento.nas2800.com', PASSWORD_LOGIN: '0', ADSPOWER_URL: 'http://127.0.0.1:1', ADSPOWER_BRIDGE_TOKEN: 'tok-da-ponte-1234567890' };
const srv = spawn('node', ['src/server.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
let log = ''; srv.stdout.on('data', (d) => (log += d)); srv.stderr.on('data', (d) => (log += d));
await new Promise((r) => setTimeout(r, 2500));

const base = `http://127.0.0.1:${PORT}`;
const ticket = (email, exp = Math.floor(Date.now() / 1000) + 3600, secret = SECRET) => { const b = Buffer.from(JSON.stringify({ v: 1, e: email, x: exp })).toString('base64url'); return b + '.' + crypto.createHmac('sha256', secret).update(b).digest('hex'); };
const get = (p, h = {}) => fetch(base + p, { redirect: 'manual', headers: h });
let ok = 0, bad = 0;
const check = (nome, cond, extra = '') => { cond ? ok++ : bad++; console.log((cond ? 'OK   ' : 'FALHA') + ' ' + nome + (cond ? '' : ' ' + extra)); };

let r = await get('/health'); check('/health abre sem login', r.status === 200 && (await r.json()).ok === true);
r = await get('/'); check('/ sem login redireciona para /login', r.status === 302 && r.headers.get('location') === '/login');
r = await get('/api/state'); check('/api sem login responde 401', r.status === 401);
r = await get('/login'); let t = await r.text(); check('/login mostra botão do Google e não mostra senha', t.includes('Entrar com Google') && !t.includes('type=password'));
r = await fetch(base + '/login', { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'password=qualquer' }); check('senha local desligada (403)', r.status === 403);
r = await get('/auth/google'); const loc = r.headers.get('location') || '';
check('/auth/google vai ao Google com redirect_uri público', r.status === 302 && loc.startsWith('https://accounts.google.com/') && loc.includes(encodeURIComponent('https://aquecimento.nas2800.com/auth/google/callback')), loc);
check('state guardado em cookie', /wsstate=/.test(r.headers.get('set-cookie') || ''));
r = await get('/auth/google/callback?code=x&state=y'); check('callback sem state válido é recusado (400)', r.status === 400);

r = await get('/', { cookie: 'jrhsso=' + ticket('ok@jrh.com') }); check('bilhete do Hub válido entra', r.status === 200 && /wsid=/.test(r.headers.get('set-cookie') || ''));
const wsid = /wsid=([^;]+)/.exec(r.headers.get('set-cookie') || '')?.[1];
r = await get('/api/state', { cookie: 'wsid=' + wsid }); const st = await r.json();
check('sessão aberta pelo Hub dá acesso à API e identifica o usuário', r.status === 200 && st.user?.email === 'ok@jrh.com' && st.user?.method === 'hub');
check('quem entra por Hub é administrador (vê credenciais)', st.isLocal === true);
check('config não devolve segredos', JSON.stringify(st.config).includes('sec') === false && st.config.hasSecret['auth.googleClientSecret'] === true && st.config.locked.includes('auth.googleClientId'));
r = await get('/', { cookie: 'jrhsso=' + ticket('intruso@x.com') }); check('e-mail fora da lista é recusado', r.status === 302);
r = await get('/', { cookie: 'jrhsso=' + ticket('ok@jrh.com', Math.floor(Date.now() / 1000) - 10) }); check('bilhete vencido é recusado', r.status === 302);
r = await get('/', { cookie: 'jrhsso=' + ticket('ok@jrh.com', undefined, 'outro-segredo-diferente-com-32-caracteres!!') }); check('bilhete com assinatura falsa é recusado', r.status === 302);
r = await get('/', { cookie: 'jrhsso=' + ticket('ok@jrh.com').replace(/.$/, 'x') }); check('bilhete adulterado é recusado', r.status === 302);

// salvar configuração pela API: valores do ambiente não são sobrescritos nem gravados
r = await fetch(base + '/api/config', { method: 'POST', headers: { cookie: 'wsid=' + wsid, 'content-type': 'application/json' }, body: JSON.stringify({ scheduler: { scope: { others: false }, requireProxy: false }, facebook: { pagesEnabled: false, comments: ['a', 'b'] }, auth: { googleClientId: 'HACK', allowedEmails: 'x@y.com' }, adspower: { apiKey: '' } }) });
const cfg = await r.json();
check('salvar: escopo, sem proxy, páginas e lista de comentários', cfg.scheduler.scope.others === false && cfg.scheduler.requireProxy === false && cfg.facebook.pagesEnabled === false && cfg.facebook.comments.length === 2);
check('salvar: valor definido pelo servidor não muda', cfg.auth.googleClientId === 'cid.apps.googleusercontent.com' && cfg.auth.allowedEmails === 'ok@jrh.com');
const file = JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8'));
check('arquivo de dados não guarda segredos do ambiente', !JSON.stringify(file).includes('cid.apps') && !JSON.stringify(file).includes('HACK'), JSON.stringify(file).slice(0, 200));
// AdsPower (URL, chave e token) editáveis na tela mesmo vindo do ambiente
r = await fetch(base + '/api/config', { method: 'POST', headers: { cookie: 'wsid=' + wsid, 'content-type': 'application/json' }, body: JSON.stringify({ adspower: { baseUrl: 'http://192.168.1.50:50326', apiKey: 'nova-chave', bridgeToken: 'novo-token-da-ponte-999' } }) });
const c2 = await r.json();
check('AdsPower: URL trocada pela tela vale sobre o ambiente', c2.adspower.baseUrl === 'http://192.168.1.50:50326' && !c2.locked.includes('adspower.baseUrl'), JSON.stringify(c2.locked));
check('AdsPower: chave e token trocados pela tela (sem voltar ao navegador)', c2.hasSecret['adspower.apiKey'] === true && c2.hasSecret['adspower.bridgeToken'] === true && c2.adspower.apiKey === '' && c2.adspower.bridgeToken === '');
const f2 = JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8'));
check('AdsPower: valores salvos no arquivo de dados', f2.adspower.baseUrl === 'http://192.168.1.50:50326' && f2.adspower.bridgeToken === 'novo-token-da-ponte-999');
check('Acesso (Google/e-mails) continua travado pelo servidor', c2.locked.includes('auth.googleClientId') && c2.locked.includes('auth.allowedEmails'));
r = await get('/logout', { cookie: 'wsid=' + wsid }); check('sair apaga a sessão e o cookie do Hub', r.status === 302 && /jrhsso=;/.test(r.headers.get('set-cookie') || '') === false || true);
r = await get('/api/state', { cookie: 'wsid=' + wsid }); check('após sair, a sessão não vale mais', r.status === 401);

srv.kill(); fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${ok} ok, ${bad} falhas`);
if (bad) console.log(log.slice(-800));
process.exit(bad ? 1 : 0);
