import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';

const TOKEN = 'token-da-ponte-123456';
// AdsPower falso (API) e navegador falso (HTTP + WebSocket que devolve o que recebe)
const ads = http.createServer((q, r) => { r.setHeader('content-type', 'application/json'); r.end(JSON.stringify({ code: 0, data: { url: q.url, auth: q.headers['x-bridge-token'] || null } })); }).listen(50395);
const cdp = http.createServer((q, r) => { r.setHeader('content-type', 'application/json'); r.end(JSON.stringify({ Browser: 'Fake/1', url: q.url })); });
cdp.on('upgrade', (q, s) => { s.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n'); s.on('data', (d) => s.write(Buffer.concat([Buffer.from('eco:'), d]))); });
cdp.listen(50396);
const br = spawn('node', ['tools/pc-bridge.js'], { env: { ...process.env, BRIDGE_TOKEN: TOKEN, BRIDGE_PORT: '50397', ADSPOWER_LOCAL: 'http://127.0.0.1:50395' }, stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((r) => setTimeout(r, 1500));

let ok = 0, bad = 0;
const check = (n, c, x = '') => { c ? ok++ : bad++; console.log((c ? 'OK   ' : 'FALHA') + ' ' + n + (c ? '' : ' ' + x)); };
const B = 'http://127.0.0.1:50397';
const H = { 'x-bridge-token': TOKEN };

let r = await fetch(B + '/health'); check('/health abre sem token', r.status === 200);
r = await fetch(B + '/api/v1/user/list'); check('sem token: 401', r.status === 401);
r = await fetch(B + '/api/v1/user/list', { headers: { 'x-bridge-token': 'errado' } }); check('token errado: 401', r.status === 401);
r = await fetch(B + '/api/v1/browser/start?user_id=k1&open_tabs=1', { headers: H }); let j = await r.json();
check('API repassada com a consulta, sem vazar o token ao AdsPower', j.data.url === '/api/v1/browser/start?user_id=k1&open_tabs=1' && j.data.auth === null, JSON.stringify(j));
r = await fetch(B + '/cdp/50396/json/version?token=' + TOKEN); j = await r.json(); check('HTTP do navegador repassado (token por query, removido)', j.Browser === 'Fake/1' && j.url === '/json/version', JSON.stringify(j));
r = await fetch(B + '/cdp/80/json/version', { headers: H }); check('porta fora da faixa de depuração é recusada', r.status === 404);
r = await fetch(B + '/cdp/50395/api/x', { headers: H }); check('não alcança a porta da API do AdsPower por /cdp', r.status === 404);
r = await fetch(B + '/sys', { headers: H }); j = await r.json(); check('/sys traz CPU e RAM do PC', typeof j.cpu === 'number' && j.totalMB > 0 && j.availMB > 0 && 'browserMB' in j, JSON.stringify(j));

// WebSocket: aperto de mão + dados nos dois sentidos
const got = await new Promise((resolve) => {
  const s = net.connect(50397, '127.0.0.1', () => s.write(`GET /cdp/50396/devtools/browser/abc?token=${TOKEN} HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n`));
  let buf = ''; let sent = false;
  s.on('data', (d) => { buf += d; if (!sent && buf.includes('101')) { sent = true; s.write('ola'); } if (buf.includes('eco:ola')) { s.destroy(); resolve(true); } });
  setTimeout(() => { s.destroy(); resolve(false); }, 3000);
});
check('WebSocket (CDP) atravessa a ponte nos dois sentidos', got);
const bad2 = await new Promise((resolve) => { const s = net.connect(50397, '127.0.0.1', () => s.write('GET /cdp/50396/x?token=errado HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n')); let b = ''; s.on('data', (d) => (b += d)); s.on('close', () => resolve(b)); setTimeout(() => { s.destroy(); resolve(b); }, 2000); });
check('WebSocket com token errado é barrado (403)', bad2.includes('403'));

br.kill(); ads.close(); cdp.close();
console.log(`\n${ok} ok, ${bad} falhas`); process.exit(bad ? 1 : 0);
