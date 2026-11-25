// Verifica os sites do catálogo e grava data/sites.json. Uso: npm run check-sites
import { checkAll, catalog } from '../src/siteregistry.js';

const total = catalog().size;
console.log(`Testando ${total} sites…`);
const reg = await checkAll({ onProgress: (n, t, d, r) => process.stdout.write(`\r${n}/${t} ${d.padEnd(38)}${r.ok ? 'ok ' : 'FALHOU ' + r.reason}`.padEnd(90)) });
const all = Object.entries(reg);
const bad = all.filter(([, e]) => !e.ok);
console.log(`\n\nLiberados: ${all.length - bad.length} · reprovados: ${bad.length}`);
for (const [d, e] of bad) console.log(`  ✖ ${d} — ${e.reason}`);
