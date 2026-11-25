// Ponte para rodar no PC onde o AdsPower está aberto. Deixa o app do NAS controlar os perfis pela rede local.
// Uso (no PC):  BRIDGE_TOKEN=um-segredo-longo node tools/pc-bridge.js      (porta padrão 50326)
//
// Por que existe: a API do AdsPower e o depurador de cada navegador só escutam em 127.0.0.1 do PC.
// A ponte expõe, protegido por token:
//   /api/...            → repassa para a API local do AdsPower (127.0.0.1:50325)
//   /cdp/<porta>/...    → repassa HTTP e WebSocket para o navegador do perfil (127.0.0.1:<porta>), só portas de depuração
//   /sys                → CPU, RAM livre e memória dos navegadores deste PC
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFile, spawn } from 'node:child_process';

const TOKEN = process.env.BRIDGE_TOKEN || '';
const PORT = Number(process.env.BRIDGE_PORT || 50326);
const ADS = new URL(process.env.ADSPOWER_LOCAL || 'http://127.0.0.1:50325');
const ALLOW = (process.env.BRIDGE_ALLOW || '').split(',').map((s) => s.trim()).filter(Boolean); // IPs liberados (vazio = rede local)
if (TOKEN.length < 16) { console.error('Defina BRIDGE_TOKEN com 16+ caracteres.'); process.exit(1); }

const strip = (ip = '') => ip.replace(/^::ffff:/, '');
const lan = (ip) => /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1|fe80:|fc|fd)/i.test(strip(ip));
const ipOk = (ip) => (ALLOW.length ? ALLOW.includes(strip(ip)) : lan(ip));
const tokenOk = (given) => { const a = Buffer.from(String(given || '')), b = Buffer.from(TOKEN); return a.length === b.length && crypto.timingSafeEqual(a, b); };
const tokenOf = (req, url) => req.headers['x-bridge-token'] || url.searchParams.get('token');
// só portas altas de depuração (evita usar a ponte para alcançar outros serviços do PC)
const portOk = (p) => Number.isInteger(p) && p >= 1024 && p <= 65535 && p !== Number(ADS.port || 80) && p !== PORT;

let prev = null, cpu = 0;
setInterval(() => {
  const cur = os.cpus().reduce((a, c) => ({ idle: a.idle + c.times.idle, total: a.total + Object.values(c.times).reduce((x, y) => x + y, 0) }), { idle: 0, total: 0 });
  if (prev && cur.total > prev.total) cpu = Math.round((1 - (cur.idle - prev.idle) / (cur.total - prev.total)) * 100);
  prev = cur;
}, 2000).unref();

// macOS: os.freemem() só conta páginas "livres" e subestima muito. Disponível = livre + inativa + especulativa + purgável (como o Activity Monitor).
export function parseVmStat(out) {
  const page = Number(/page size of (\d+)/.exec(out)?.[1] || 16384);
  const g = (k) => Number(new RegExp(k + String.raw`:\s+(\d+)`).exec(out)?.[1] || 0);
  return Math.round(((g('Pages free') + g('Pages inactive') + g('Pages speculative') + g('Pages purgeable')) * page) / 1048576);
}
function freeMB() {
  if (process.platform !== 'darwin') return Promise.resolve(Math.round(os.freemem() / 1048576));
  return new Promise((resolve) => execFile('vm_stat', { timeout: 4000 }, (err, out) => resolve(err ? Math.round(os.freemem() / 1048576) : parseVmStat(out))));
}
// macOS: mantém o Mac acordado enquanto a ponte roda (senão o rodízio para quando a tela apaga)
if (process.platform === 'darwin') { try { spawn('caffeinate', ['-i', '-w', String(process.pid)], { stdio: 'ignore' }).unref(); } catch {} }

function browserMem() {
  return new Promise((resolve) => {
    const cmd = process.platform === 'win32' ? ['tasklist', ['/FO', 'CSV', '/NH']] : ['ps', ['-A', '-o', 'rss=,comm=']];
    execFile(cmd[0], cmd[1], { maxBuffer: 8e6, timeout: 5000 }, (err, out) => {
      if (err) return resolve({ browserMB: 0, browserProcs: 0 });
      let kb = 0, n = 0;
      for (const line of out.split('\n')) {
        if (!/SunBrowser|FlowerBrowser|chrome_crashpad|Chromium|Google Chrome|AdsPower/i.test(line)) continue;
        const m = process.platform === 'win32' ? /"([\d.,]+)\s*K"\s*$/.exec(line.trim()) : /^\s*(\d+)\s/.exec(line);
        if (m) { kb += Number(m[1].replace(/[.,]/g, '')); n++; }
      }
      resolve({ browserMB: Math.round(kb / 1024), browserProcs: n });
    });
  });
}

const hora = () => new Date().toLocaleTimeString('pt-BR');
const semToken = (u) => String(u).replace(/([?&])token=[^&]*/, '$1token=***');
const deny = (res, code, msg) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify({ code: -1, msg })); };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname !== '/health') res.on('finish', () => console.log(`${hora()} ${strip(req.socket.remoteAddress)} ${req.method} ${semToken(req.url)} → ${res.statusCode}`));
  if (!ipOk(req.socket.remoteAddress)) return deny(res, 403, 'IP não permitido');
  if (url.pathname === '/health') return deny(res, 200, 'ok');
  if (!tokenOk(tokenOf(req, url))) return deny(res, 401, 'token inválido');

  if (url.pathname === '/sys') {
    const m = await browserMem();
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ cpu, availMB: await freeMB(), totalMB: Math.round(os.totalmem() / 1048576), cores: os.cpus().length, ...m }));
  }

  let target;
  if (url.pathname.startsWith('/api/')) target = { host: ADS.hostname, port: Number(ADS.port || 80), path: url.pathname + url.search.replace(/([?&])token=[^&]*&?/, '$1').replace(/[?&]$/, '') };
  else {
    const m = /^\/cdp\/(\d+)(\/.*)?$/.exec(url.pathname);
    if (!m || !portOk(Number(m[1]))) return deny(res, 404, 'rota inválida');
    target = { host: '127.0.0.1', port: Number(m[1]), path: (m[2] || '/') + url.search.replace(/([?&])token=[^&]*&?/, '$1').replace(/[?&]$/, '') };
  }
  const headers = { ...req.headers, host: `${target.host}:${target.port}` };
  delete headers['x-bridge-token'];
  const up = http.request({ ...target, method: req.method, headers }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
  up.on('error', (e) => deny(res, 502, 'destino indisponível: ' + e.message));
  req.pipe(up);
});

// WebSocket do depurador (CDP): túnel TCP direto depois do aperto de mão
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://x');
  console.log(`${hora()} ${strip(req.socket.remoteAddress)} WS ${semToken(req.url)}`);
  const m = /^\/cdp\/(\d+)(\/.*)?$/.exec(url.pathname);
  if (!ipOk(req.socket.remoteAddress) || !tokenOk(tokenOf(req, url)) || !m || !portOk(Number(m[1]))) { socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); return socket.destroy(); }
  const port = Number(m[1]);
  const path = (m[2] || '/') + url.search.replace(/([?&])token=[^&]*&?/, '$1').replace(/[?&]$/, '');
  const up = net.connect(port, '127.0.0.1', () => {
    const h = { ...req.headers, host: `127.0.0.1:${port}` };
    delete h['x-bridge-token'];
    up.write(`GET ${path} HTTP/1.1\r\n${Object.entries(h).map(([k, v]) => `${k}: ${v}`).join('\r\n')}\r\n\r\n`);
    if (head?.length) up.write(head);
    socket.pipe(up); up.pipe(socket);
  });
  const close = () => { socket.destroy(); up.destroy(); };
  up.on('error', close); socket.on('error', close); socket.on('close', close); up.on('close', close);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Ponte do AdsPower ativa na porta ${PORT} → API ${ADS.origin}`);
  console.log('No app (Configurações › AdsPower): URL = http://IP-DESTE-PC:' + PORT + ' e o mesmo token.');
});
