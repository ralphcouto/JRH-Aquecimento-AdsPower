import { spawn } from 'node:child_process';
import { ads } from './adspower.js';
import { getConfig } from './config.js';
import { store } from './store.js';
import { sysmon } from './sysmon.js';
import { runSession } from './session.js';

const csv = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);

/** Rodízio de perfis: abre N por vez, cada um por `sliceMinutes`, até completar todos; depois reinicia. */
class Scheduler {
  status = 'stopped'; // stopped | running | paused | stopping
  profiles = [];
  noProxy = [];
  queue = [];
  active = new Map(); // profileId -> { live, abort }
  doneThisCycle = new Set();
  failedThisCycle = new Set();
  retried = new Set();
  cycleStartedAt = 0;
  lastStartAt = 0;
  lastShedAt = 0;
  nextCycleAt = 0;
  note = '';
  #timer = null;
  #caff = null;

  // mantém o Mac acordado só enquanto o rodízio está rodando
  #awake(on) {
    if (on && !this.#caff && process.platform === 'darwin') {
      this.#caff = spawn('caffeinate', ['-i', '-m', '-s', '-w', String(process.pid)], { stdio: 'ignore' });
      this.#caff.on('exit', () => (this.#caff = null));
    } else if (!on && this.#caff) { this.#caff.kill(); this.#caff = null; }
  }

  /** Minutos de navegação do perfil: rampa por dia desde a primeira sessão dele. */
  rampInfo(profileId) {
    const s = getConfig().scheduler;
    const first = store.firstRun(profileId);
    const day = first ? Math.floor((Date.now() - first) / 864e5) : 0;
    const arr = s.rampMinutes?.length ? s.rampMinutes : [s.sliceMinutes];
    const minutes = s.ramp ? arr[Math.min(day, arr.length - 1)] : s.sliceMinutes;
    return { day: day + 1, minutes, warmed: s.ramp && day >= arr.length };
  }

  get cycle() { return store.state.cycle; }

  async loadProfiles() {
    const all = await ads.listProfiles();
    const s = getConfig().scheduler;
    const groups = csv(s.groupFilter).map((g) => g.toLowerCase());
    const inc = new Set(csv(s.includeIds)), exc = new Set(csv(s.excludeIds));
    this.profiles = all.filter((p) => (!groups.length || groups.includes(p.group.toLowerCase())) && (!inc.size || inc.has(p.id)) && !exc.has(p.id));
    this.noProxy = this.profiles.filter((p) => p.proxy === 'sem proxy');
    if (s.requireProxy) this.profiles = this.profiles.filter((p) => p.proxy !== 'sem proxy');
    return this.profiles;
  }

  async #buildQueue() {
    await this.loadProfiles();
    // perfis ainda na rampa (novos) vão primeiro; dentro de cada grupo, quem ficou mais tempo sem navegar
    const warmed = (p) => (this.rampInfo(p.id).warmed ? 1 : 0);
    this.queue = [...this.profiles].sort((a, b) => warmed(a) - warmed(b) || store.lastRun(a.id) - store.lastRun(b.id) || a.serial - b.serial);
    this.doneThisCycle.clear(); this.failedThisCycle.clear(); this.retried.clear();
    this.cycleStartedAt = Date.now();
  }

  async start() {
    if (this.status === 'running') return;
    if (this.status === 'paused') return this.resume();
    this.note = 'Carregando perfis…';
    this.status = 'running';
    this.#awake(true);
    try {
      await this.#buildQueue();
      this.note = '';
    } catch (e) {
      this.status = 'stopped'; this.#awake(false); this.note = 'Erro ao listar perfis: ' + e.message;
      throw e;
    }
    this.#timer = setInterval(() => this.#tick().catch((e) => (this.note = e.message)), 1000);
  }

  pause() { if (this.status === 'running') { this.status = 'paused'; this.#awake(false); } }
  resume() { if (this.status === 'paused') { this.status = 'running'; this.#awake(true); } }

  async stop() {
    if (this.status === 'stopped') return;
    this.status = 'stopping';
    clearInterval(this.#timer);
    for (const a of this.active.values()) a.abort.abort('parado pelo usuário');
    const t0 = Date.now();
    while (this.active.size && Date.now() - t0 < 90000) await new Promise((r) => setTimeout(r, 500));
    this.status = 'stopped';
    this.#awake(false);
    this.queue = [];
  }

  /** Limite dinâmico de perfis simultâneos conforme CPU/RAM do Mac. */
  effectiveConcurrency() {
    const s = getConfig().scheduler;
    if (!s.adaptive) return s.concurrency;
    const cpu = sysmon.avgCpu(20000), avail = sysmon.availMB;
    if (cpu > s.cpuMax || avail < s.memMinMB) return Math.min(s.concurrency, this.active.size); // segura
    return s.concurrency;
  }

  #overloaded() {
    const s = getConfig().scheduler;
    return s.adaptive && (sysmon.avgCpu(20000) > s.cpuMax + 10 || sysmon.availMB < s.memMinMB * 0.6);
  }

  /** A cada 1 min confere se algum perfil ganhou proxy/foi criado e o coloca NA FRENTE da fila. */
  async #refreshNew() {
    if (Date.now() - (this.lastRefresh || 0) < 60000) return;
    this.lastRefresh = Date.now();
    const known = new Set([...this.queue.map((p) => p.id), ...this.active.keys(), ...this.doneThisCycle, ...this.failedThisCycle]);
    await this.loadProfiles();
    const fresh = this.profiles.filter((p) => !known.has(p.id));
    if (fresh.length) {
      this.queue.unshift(...fresh);
      this.note = `${fresh.length} perfil(is) novo(s)/com proxy entrou(aram) na frente da fila`;
    }
  }

  async #tick() {
    if (this.status !== 'running') return;
    const s = getConfig().scheduler;
    await this.#refreshNew().catch(() => {});

    // proteção: sobrecarga severa → encerra o perfil mais novo mais cedo (no máx. 1 por minuto)
    if (this.#overloaded() && this.active.size > 1 && Date.now() - this.lastShedAt > 60000) {
      const newest = [...this.active.values()].sort((a, b) => b.live.startedAt - a.live.startedAt)[0];
      newest.abort.abort('proteção de recursos');
      this.lastShedAt = Date.now();
      this.note = 'Mac sobrecarregado: encerrando um perfil mais cedo';
    }

    if (this.nextCycleAt && Date.now() < this.nextCycleAt) return;
    this.nextCycleAt = 0;

    // nunca abre dois perfis que compartilham o mesmo IP de proxy ao mesmo tempo
    const hostOf = (proxy) => String(proxy).replace(/^.*:\/\//, '').split(':')[0];
    while (this.status === 'running' && this.queue.length && this.active.size < this.effectiveConcurrency()
      && Date.now() - this.lastStartAt >= s.startStaggerSec * 1000) {
      const busy = new Set([...this.active.values()].map((a) => hostOf(a.live.proxy)));
      const idx = this.queue.findIndex((p) => !busy.has(hostOf(p.proxy)));
      if (idx < 0) break;
      this.#launch(this.queue.splice(idx, 1)[0]);
      this.lastStartAt = Date.now();
    }
    if (this.active.size && this.active.size >= s.concurrency) this.note = '';
    else if (this.queue.length && this.active.size < s.concurrency && this.active.size >= this.effectiveConcurrency()) this.note = 'Aguardando CPU/RAM liberarem para abrir mais perfis';

    // ciclo completo?
    if (!this.queue.length && !this.active.size && this.status === 'running') {
      store.state.cycle++; store.saveState();
      this.nextCycleAt = Date.now() + s.pauseBetweenCyclesMin * 60000;
      try { await this.#buildQueue(); } catch (e) { this.note = 'Erro ao recarregar perfis: ' + e.message; this.nextCycleAt = Date.now() + 30000; }
    }
  }

  #launch(profile) {
    const s = getConfig().scheduler;
    const abort = new AbortController();
    const live = {};
    const jitter = 1 + (Math.random() * 2 - 1) * (s.sliceJitterPct / 100);
    const sliceMs = Math.round(this.rampInfo(profile.id).minutes * 60000 * jitter);
    this.active.set(profile.id, { live, abort });
    runSession({ profile, sliceMs, signal: abort.signal, live })
      .then((sum) => {
        if (sum.error && !sum.pages && !this.retried.has(profile.id) && this.status === 'running') {
          this.retried.add(profile.id); this.queue.push(profile); // uma nova tentativa no fim da fila
        } else if (sum.error && !sum.pages) this.failedThisCycle.add(profile.id);
        else this.doneThisCycle.add(profile.id);
      })
      .catch((e) => { this.failedThisCycle.add(profile.id); this.note = e.message; })
      .finally(() => this.active.delete(profile.id));
  }

  snapshot() {
    const total = this.profiles.length;
    return {
      status: this.status, cycle: this.cycle, note: this.note,
      noProxy: this.noProxy.length, total, done: this.doneThisCycle.size, failed: this.failedThisCycle.size, queued: this.queue.length,
      cycleStartedAt: this.cycleStartedAt, nextCycleAt: this.nextCycleAt,
      effectiveConcurrency: this.effectiveConcurrency(),
      active: [...this.active.values()].map((a) => ({ ...a.live })),
      profiles: this.profiles.map((p) => ({ ...p, ramp: this.rampInfo(p.id), flags: store.flags(p.id) })),
      queueIds: this.queue.slice(0, 20).map((p) => p.id),
    };
  }
}

export const scheduler = new Scheduler();
