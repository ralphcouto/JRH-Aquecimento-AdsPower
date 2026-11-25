import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getConfig } from './config.js';

const run = promisify(execFile);

class SysMon {
  history = []; // {t, cpu, availMB, browserMB, load1}
  #prev = null;
  cpu = 0;
  availMB = os.freemem() / 1048576;
  browserMB = 0;
  browserProcs = 0;
  swapMB = 0;
  load1 = 0;
  totalMB = os.totalmem() / 1048576;
  cores = os.cpus().length;

  start() {
    this.#tickCpu();
    setInterval(() => this.#tickCpu(), 2000).unref();
    this.#tickSlow();
    setInterval(() => this.#tickSlow(), 5000).unref();
  }

  #tickCpu() {
    if (getConfig().adspower.bridgeToken) { this.history.push({ t: Date.now(), cpu: this.cpu, availMB: Math.round(this.availMB), browserMB: Math.round(this.browserMB), load1: 0 }); if (this.history.length > 360) this.history.shift(); return; }
    const cur = os.cpus().reduce((a, c) => {
      const t = Object.values(c.times).reduce((x, y) => x + y, 0);
      return { idle: a.idle + c.times.idle, total: a.total + t };
    }, { idle: 0, total: 0 });
    if (this.#prev) {
      const di = cur.idle - this.#prev.idle, dt = cur.total - this.#prev.total;
      this.cpu = dt > 0 ? Math.round((1 - di / dt) * 100) : this.cpu;
    }
    this.#prev = cur;
    this.load1 = os.loadavg()[0];
    this.history.push({ t: Date.now(), cpu: this.cpu, availMB: Math.round(this.availMB), browserMB: Math.round(this.browserMB), load1: +this.load1.toFixed(2) });
    if (this.history.length > 360) this.history.shift();
  }

  /** Modo remoto: mede o PC do AdsPower pela ponte, não o NAS. */
  async #tickRemote() {
    const { baseUrl, bridgeToken } = getConfig().adspower;
    try {
      const r = await fetch(new URL('/sys', baseUrl), { headers: { 'x-bridge-token': bridgeToken }, signal: AbortSignal.timeout(4000) });
      const j = await r.json();
      this.cpu = j.cpu ?? this.cpu; this.availMB = j.availMB ?? this.availMB; this.totalMB = j.totalMB ?? this.totalMB;
      this.browserMB = j.browserMB ?? 0; this.browserProcs = j.browserProcs ?? 0; this.cores = j.cores ?? this.cores;
    } catch {}
  }

  async #tickSlow() {
    if (getConfig().adspower.bridgeToken) return this.#tickRemote();
    try {
      if (process.platform === 'darwin') {
        const { stdout } = await run('vm_stat');
        const page = Number(/page size of (\d+)/.exec(stdout)?.[1] || 16384);
        const g = (k) => Number(new RegExp(`${k}:\\s+(\\d+)`).exec(stdout)?.[1] || 0);
        // "disponível" ≈ livre + inativa + especulativa + purgável (o que o macOS recupera sem swap)
        this.availMB = ((g('Pages free') + g('Pages inactive') + g('Pages speculative') + g('Pages purgeable')) * page) / 1048576;
        const sw = await run('sysctl', ['-n', 'vm.swapusage']);
        this.swapMB = Number(/used = ([\d.]+)M/.exec(sw.stdout)?.[1] || 0);
      } else this.availMB = os.freemem() / 1048576;
      const { stdout } = await run('ps', ['-A', '-o', 'rss=,comm=']);
      let kb = 0, n = 0;
      for (const line of stdout.split('\n')) {
        if (/SunBrowser|FlowerBrowser|chrome_crashpad|Chromium|Google Chrome|AdsPower/i.test(line) && !/Helper \(Alerts\)/.test(line)) {
          const m = /^\s*(\d+)\s/.exec(line);
          if (m) { kb += Number(m[1]); n++; }
        }
      }
      this.browserMB = kb / 1024;
      this.browserProcs = n;
    } catch {}
  }

  snapshot() {
    return {
      cpu: this.cpu,
      cpu30: this.avgCpu(30000),
      availMB: Math.round(this.availMB),
      totalMB: Math.round(this.totalMB),
      browserMB: Math.round(this.browserMB),
      browserProcs: this.browserProcs,
      swapMB: Math.round(this.swapMB),
      load1: +this.load1.toFixed(2),
      cores: this.cores,
    };
  }

  avgCpu(windowMs) {
    const cut = Date.now() - windowMs;
    const pts = this.history.filter((h) => h.t >= cut);
    return pts.length ? Math.round(pts.reduce((a, b) => a + b.cpu, 0) / pts.length) : this.cpu;
  }
}

export const sysmon = new SysMon();
