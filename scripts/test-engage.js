// Teste real de 1 sessão (curtir/comentar forçados) em um perfil. Uso: node scripts/test-engage.js "Vietnã 06" [minutos]
import { ads } from '../src/adspower.js';
import { getConfig } from '../src/config.js';
import { runSession } from '../src/session.js';
import { allActions } from '../src/fbstats.js';

const cfg = getConfig();
Object.assign(cfg.browsing, { facebookRatio: 1 });
Object.assign(cfg.facebook, { pageRatio: 0, reelRatio: 1, likeChance: 1, commentChance: 1, reelsPerVisit: [2, 2], reelWatchSec: [10, 14] });
const p = (await ads.listProfiles()).find((x) => x.name === process.argv[2]);
const t0 = Date.now();
const live = {};
const r = await runSession({ profile: p, sliceMs: (Number(process.argv[3]) || 6) * 60000, signal: new AbortController().signal, live });
console.log('sessão:', JSON.stringify({ pages: r.pages, ok: r.ok, skipped: r.skipped, error: r.error }));
for (const a of allActions().filter((x) => x.ts >= t0)) console.log(a.type, a.ms ? Math.round(a.ms / 1000) + 's' : '', a.text || a.motivo || '');
process.exit(0);
