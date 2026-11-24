// Benchmark: abre perfis um a um, todos navegando de verdade, medindo CPU/RAM do Mac a cada passo.
// Uso: npm run bench -- [maxPerfis=12] [segundosPorPasso=60]
import fs from 'node:fs';
import path from 'node:path';
import { ads } from '../src/adspower.js';
import { DATA_DIR, getConfig, updateConfig } from '../src/config.js';
import { sysmon } from '../src/sysmon.js';
import { runSession } from '../src/session.js';

const MAX = Number(process.argv[2] || 12);
const STEP_SEC = Number(process.argv[3] || 60);
const CPU_LIMIT = 85, MEM_LIMIT = 2000, SWAP_LIMIT = 3000;

sysmon.start();
await new Promise((r) => setTimeout(r, 6000));
const profiles = (await ads.listProfiles()).filter((p) => !/^$/.test(p.id)).slice(0, MAX);
const base = sysmon.snapshot();
console.log(`Base: CPU ${base.cpu30}% · RAM livre ${base.availMB} MB · swap ${base.swapMB} MB · ${profiles.length} perfis disponíveis p/ teste`);

const running = [];
const abort = new AbortController();
const rows = [];
let reason = 'limite de perfis do teste atingido';

for (let n = 1; n <= profiles.length; n++) {
  const p = profiles[n - 1];
  const live = {};
  running.push(runSession({ profile: p, sliceMs: 60 * 60000, signal: abort.signal, live }).catch((e) => console.log('erro', e.message)));
  console.log(`\n▶ Passo ${n}: abrindo ${p.name}…`);
  await new Promise((r) => setTimeout(r, STEP_SEC * 1000));
  const s = sysmon.snapshot();
  const cpu = sysmon.avgCpu(Math.min(40000, STEP_SEC * 700));
  const row = { perfis: n, cpu, availMB: s.availMB, browserMB: s.browserMB, mbPorPerfil: Math.round(s.browserMB / n), swapMB: s.swapMB, load1: s.load1 };
  rows.push(row);
  console.log(`   CPU ${cpu}% · RAM livre ${s.availMB} MB · navegadores ${s.browserMB} MB (~${row.mbPorPerfil} MB/perfil) · swap ${s.swapMB} MB · load ${s.load1}`);
  if (cpu > CPU_LIMIT) { reason = `CPU > ${CPU_LIMIT}%`; break; }
  if (s.availMB < MEM_LIMIT) { reason = `RAM livre < ${MEM_LIMIT} MB`; break; }
  if (s.swapMB - base.swapMB > SWAP_LIMIT) { reason = 'uso de swap crescendo'; break; }
}

abort.abort('benchmark finalizado');
console.log('\nEncerrando perfis do teste…');
await Promise.allSettled(running);

const last = rows.at(-1);
const bad = reason !== 'limite de perfis do teste atingido';
const maxOk = bad ? Math.max(1, last.perfis - 1) : last.perfis;
const safe = Math.max(1, Math.floor(maxOk * 0.8));
console.log(`\n=== RESULTADO ===\nMotivo da parada: ${reason}\nMáximo funcional medido: ${maxOk} perfis simultâneos\nRecomendado (80% do máximo, com folga): ${safe}`);
fs.writeFileSync(path.join(DATA_DIR, 'bench.json'), JSON.stringify({ at: Date.now(), base, rows, reason, maxOk, safe }, null, 2));
if (process.argv.includes('--apply')) { updateConfig({ scheduler: { concurrency: safe } }); console.log('Concorrência salva na configuração.'); }
process.exit(0);
