import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './config.js';

const VISITS = path.join(DATA_DIR, 'visits.jsonl');
const SESSIONS = path.join(DATA_DIR, 'sessions.jsonl');
const STATE = path.join(DATA_DIR, 'state.json');

function readJsonl(file) {
  try {
    return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  } catch { return []; }
}

class Store {
  visits = readJsonl(VISITS);
  sessions = readJsonl(SESSIONS);
  state = (() => { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { return { cycle: 1, countries: {}, flags: {} }; } })();
  constructor() { this.state.flags ||= {}; }

  addVisit(v) {
    this.visits.push(v);
    fs.appendFile(VISITS, JSON.stringify(v) + '\n', () => {});
  }
  addSession(s) {
    this.sessions.push(s);
    fs.appendFile(SESSIONS, JSON.stringify(s) + '\n', () => {});
  }
  saveState() { fs.writeFile(STATE, JSON.stringify(this.state, null, 2), () => {}); }

  firstRun(profileId) {
    for (const s of this.sessions) if (s.profileId === profileId) return s.startedAt;
    return 0;
  }
  setFlags(id, flags) { this.state.flags[id] = { ...this.state.flags[id], ...flags }; this.saveState(); }
  flags(id) { return this.state.flags[id] || {}; }

  lastRun(profileId) {
    for (let i = this.sessions.length - 1; i >= 0; i--) if (this.sessions[i].profileId === profileId) return this.sessions[i].endedAt;
    return 0;
  }

  report() {
    const byProfile = {}, byDomain = {}, skipReasons = {}, byHour = {};
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let pagesToday = 0, okToday = 0, skToday = 0, dwellToday = 0, loadToday = 0, profToday = new Set(), okAll = 0, skippedAll = 0, dwellOk = 0, loadOk = 0;

    for (const v of this.visits) {
      const p = (byProfile[v.profileId] ||= { pages: 0, ok: 0, skipped: 0, errors: 0, dwellMs: 0 });
      p.pages++;
      const d = (byDomain[v.domain] ||= { domain: v.domain, visits: 0, ok: 0, skipped: 0, dwellMs: 0, loadMs: 0, reasons: {} });
      d.visits++;
      if (v.status === 'ok') {
        p.ok++; p.dwellMs += v.dwellMs; d.ok++; d.dwellMs += v.dwellMs; d.loadMs += v.loadMs || 0;
        okAll++; dwellOk += v.dwellMs; loadOk += v.loadMs || 0;
      } else {
        v.status === 'error' ? p.errors++ : p.skipped++;
        d.skipped++; skippedAll++;
        skipReasons[v.reason] = (skipReasons[v.reason] || 0) + 1;
        d.reasons[v.reason] = (d.reasons[v.reason] || 0) + 1;
      }
      if (v.ts >= today.getTime()) {
        pagesToday++; profToday.add(v.profileId);
        if (v.status === 'ok') { okToday++; dwellToday += v.dwellMs; loadToday += v.loadMs || 0; } else skToday++;
      }
      const h = new Date(v.ts); h.setMinutes(0, 0, 0);
      byHour[h.getTime()] = (byHour[h.getTime()] || 0) + 1;
    }
    for (const s of this.sessions) {
      const p = (byProfile[s.profileId] ||= { pages: 0, ok: 0, skipped: 0, errors: 0, dwellMs: 0 });
      p.sessions = (p.sessions || 0) + 1;
      p.sessionMs = (p.sessionMs || 0) + (s.endedAt - s.startedAt);
      p.lastRun = Math.max(p.lastRun || 0, s.endedAt);
      if (s.error) { p.lastError = s.error; p.lastErrorAt = s.endedAt; } else if (p.lastErrorAt && s.endedAt > p.lastErrorAt) p.lastError = null;
    }
    const domains = Object.values(byDomain).sort((a, b) => b.visits - a.visits).slice(0, 60).map((d) => ({
      ...d, avgDwellSec: d.ok ? Math.round(d.dwellMs / d.ok / 1000) : 0, avgLoadSec: d.ok ? +(d.loadMs / d.ok / 1000).toFixed(1) : 0,
    }));
    const hours = Object.entries(byHour).sort((a, b) => a[0] - b[0]).slice(-48).map(([t, n]) => ({ t: Number(t), n }));
    return {
      totals: {
        visits: this.visits.length, ok: okAll, skipped: skippedAll, sessions: this.sessions.length, pagesToday,
        avgDwellSec: okAll ? Math.round(dwellOk / okAll / 1000) : 0,
        avgLoadSec: okAll ? +(loadOk / okAll / 1000).toFixed(1) : 0,
        totalNavHours: +(dwellOk / 3600000).toFixed(2),
        skipRate: this.visits.length ? Math.round((skippedAll / this.visits.length) * 100) : 0,
      },
      today: {
        visits: pagesToday, ok: okToday, skipped: skToday, profiles: profToday.size,
        sessions: this.sessions.filter((x) => x.endedAt >= today.getTime()).length,
        avgDwellSec: okToday ? Math.round(dwellToday / okToday / 1000) : 0,
        avgLoadSec: okToday ? +(loadToday / okToday / 1000).toFixed(1) : 0,
        totalNavHours: +(dwellToday / 3600000).toFixed(2),
        skipRate: pagesToday ? Math.round((skToday / pagesToday) * 100) : 0,
      },
      byProfile, domains, skipReasons, hours,
      recent: this.visits.slice(-120).reverse(),
      recentSessions: this.sessions.slice(-30).reverse(),
    };
  }

  csv() {
    const cols = ['ts', 'profileId', 'country', 'source', 'category', 'domain', 'url', 'title', 'status', 'reason', 'loadMs', 'dwellMs', 'scrollPx'];
    const esc = (x) => `"${String(x ?? '').replace(/"/g, '""')}"`;
    return [cols.join(','), ...this.visits.map((v) => cols.map((c) => esc(c === 'ts' ? new Date(v.ts).toISOString() : v[c])).join(','))].join('\n');
  }
}

export const store = new Store();
