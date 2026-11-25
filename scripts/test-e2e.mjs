// E2E: app (cliente AdsPower em modo remoto) → ponte → navegador real (Edge/Chrome) via CDP
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const TOKEN = 'token-da-ponte-123456';
const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find((p) => fs.existsSync(p));
if (!exe) { console.log('sem Edge/Chrome para o teste'); process.exit(2); }
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-'));
const br = spawn(exe, ['--headless=new', '--remote-debugging-port=50410', `--user-data-dir=${prof}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 3500));
const ver = await (await fetch('http://127.0.0.1:50410/json/version')).json();

// AdsPower falso devolvendo o endereço de controle LOCAL do navegador real
const ads = http.createServer((q, r) => { r.setHeader('content-type', 'application/json'); r.end(JSON.stringify({ code: 0, data: { ws: { puppeteer: ver.webSocketDebuggerUrl }, debug_port: '50410' } })); }).listen(50395);
const bridge = spawn('node', ['tools/pc-bridge.js'], { env: { ...process.env, BRIDGE_TOKEN: TOKEN, BRIDGE_PORT: '50397', ADSPOWER_LOCAL: 'http://127.0.0.1:50395' }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1200));

process.env.WARMUP_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'd-'));
process.env.ADSPOWER_URL = 'http://127.0.0.1:50397';
process.env.ADSPOWER_BRIDGE_TOKEN = TOKEN;
const { ads: client } = await import('../src/adspower.js');
const { chromium } = await import('playwright-core');
let code = 0;
try {
  const { ws } = await client.start('qualquer');
  console.log('endereço entregue ao app:', ws.replace(TOKEN, '***'));
  const b = await chromium.connectOverCDP(ws, { timeout: 20000 });
  const page = b.contexts()[0].pages()[0] || await b.contexts()[0].newPage();
  await page.goto('data:text/html,<title>via ponte</title><h1>ok</h1>');
  const t = await page.title();
  console.log('título lido pelo navegador através da ponte:', t);
  code = t === 'via ponte' ? 0 : 1;
  await b.close();
} catch (e) { console.log('ERRO', e.message); code = 1; }
console.log(code === 0 ? 'OK   E2E: app → ponte → navegador real (CDP)' : 'FALHA E2E');
br.kill(); bridge.kill(); ads.close();
try { fs.rmSync(prof, { recursive: true, force: true }); } catch {}
process.exit(code);
