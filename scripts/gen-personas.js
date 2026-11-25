// Cria o cadastro fixo de perfis de usuário (personas) para os perfis novos do AdsPower.
// Uso: npm run gen-personas            (só quem ainda não tem)
//      npm run gen-personas -- --refazer   (recria todos os perfis novos)
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from '../src/config.js';
import { buildPersona, loadPersonas, savePersonas } from '../src/persona.js';

const FIRST = ['Jake', 'Emily', 'Ryan', 'Olivia', 'Tyler', 'Megan', 'Chris', 'Hannah', 'Brandon', 'Sophie', 'Ethan', 'Chloe', 'Logan', 'Grace', 'Mason', 'Ava', 'Caleb', 'Lily', 'Owen', 'Nora', 'Dylan', 'Maya', 'Aaron', 'Ella', 'Jordan', 'Zoe', 'Kevin', 'Leah', 'Adam', 'Claire', 'Noah', 'Amber', 'Derek', 'Paige', 'Trevor', 'Naomi'];
const LAST = ['Carter', 'Bennett', 'Hayes', 'Brooks', 'Foster', 'Reed', 'Cole', 'Parker', 'Morgan', 'Ward', 'Price', 'Hughes', 'Sullivan', 'Russell', 'Fisher', 'Kelly', 'Bailey', 'Murphy', 'Rivera', 'Cooper', 'Howard', 'Gray', 'James', 'Watson', 'Wood', 'Ross', 'Powell', 'Long', 'Patterson', 'Hunter'];
const hash = (s) => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

const redo = process.argv.includes('--refazer');
const file = path.join(DATA_DIR, 'criados.jsonl');
const novos = [...new Map(fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((x) => x.ok).map((x) => [x.id, x])).values()];
const reg = { ...loadPersonas() };
const usados = new Set(Object.values(reg).map((p) => p.fullName));
let feitos = 0;

for (const n of novos) {
  if (reg[n.id] && !redo) continue;
  const base = buildPersona({ id: n.id }, 'US'); // sem cadastro ainda: gera valores determinísticos
  const h = hash(n.id);
  let full = '';
  for (let k = 0; k < 50; k++) { full = `${FIRST[(h + k * 7) % FIRST.length]} ${LAST[(h >>> 5) % LAST.length + (k % 3)] || LAST[0]}`; if (!usados.has(full)) break; }
  usados.add(full);
  reg[n.id] = {
    profileName: n.name, fullName: full, name: full.split(' ')[0], age: base.age, country: 'US', lang: 'en',
    trait: base.trait, interests: base.interests, pace: +base.pace.toFixed(2), scrollSpeed: +base.scrollSpeed.toFixed(2),
    searchBias: +base.searchBias.toFixed(2), depth: base.depth, createdAt: Date.now(),
  };
  feitos++;
}
savePersonas(reg);
console.log(`Perfis de usuário criados: ${feitos} · total no cadastro: ${Object.keys(reg).length}`);
for (const n of novos.slice(0, 5)) { const p = reg[n.id]; console.log(`  ${n.name}: ${p.fullName}, ${p.age} anos, ${p.trait}, interesses: ${p.interests.join(', ')}`); }
