import { CATEGORIES, countryInfo } from './sites.js';
import { getConfig } from './config.js';

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rng(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NAMES = {
  pt: ['Lucas', 'Mariana', 'Rafael', 'Camila', 'Bruno', 'Juliana', 'Thiago', 'Patrícia'],
  es: ['Carlos', 'Lucía', 'Javier', 'Marta', 'Diego', 'Elena'],
  de: ['Jonas', 'Lena', 'Felix', 'Marie', 'Lukas'],
  fr: ['Hugo', 'Camille', 'Louis', 'Léa', 'Nathan'],
  it: ['Marco', 'Giulia', 'Matteo', 'Chiara'],
  en: ['Jake', 'Emily', 'Ryan', 'Olivia', 'Tyler', 'Megan', 'Chris', 'Hannah', 'Brandon', 'Sophie'],
};
const LABEL = {
  news: 'Leitor de notícias', sports: 'Fã de esportes', tech: 'Entusiasta de tecnologia',
  shopping: 'Caçador de ofertas', entertainment: 'Cinéfilo/seriadão', finance: 'Curioso de finanças',
  travel: 'Viajante', food: 'Cozinheiro amador', health: 'Focado em bem-estar',
  auto: 'Apaixonado por carros', home: 'Faz-tudo/decoração',
  spirituality: 'Buscador espiritual', fitness: 'Praticante de exercícios',
};
const TRAITS = ['curioso', 'metódico', 'impulsivo', 'detalhista', 'distraído', 'objetivo'];

export function buildPersona(profile, country) {
  const r = rng(hash(profile.id));
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const info = countryInfo(country);
  // nicho do projeto: 2 interesses principais fixos + 1–2 sorteados para dar variedade
  const niche = String(getConfig().browsing.niche || '').split(',').map((x) => x.trim()).filter((x) => CATEGORIES.includes(x));
  const nichePool = [...niche];
  const interests = [];
  while (interests.length < 2 && nichePool.length) interests.push(nichePool.splice(Math.floor(r() * nichePool.length), 1)[0]);
  const pool = CATEGORIES.filter((c) => !interests.includes(c));
  const n = interests.length + 1 + Math.floor(r() * 2);
  while (interests.length < n) interests.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  const trait = pick(TRAITS);
  const names = NAMES[info.lang] || NAMES.en;
  return {
    id: profile.id,
    name: pick(names),
    age: 19 + Math.floor(r() * 36),
    trait,
    archetype: `${LABEL[interests[0]]} · ${trait}`,
    country,
    lang: info.lang,
    interests, // o primeiro pesa mais
    pace: 0.7 + r() * 0.9, // multiplicador do tempo de leitura
    scrollSpeed: 0.7 + r() * 0.8,
    searchBias: r() * 0.3 - 0.15,
    depth: 1 + Math.floor(r() * 3), // cliques internos por site
    pickInterest() {
      const x = Math.random();
      if (x < 0.4) return interests[0];
      if (x < 0.7) return interests[1];
      return interests[2 + Math.floor(Math.random() * (interests.length - 2))];
    },
  };
}

export function publicPersona(p) {
  return { name: p.name, age: p.age, archetype: p.archetype, interests: p.interests, lang: p.lang, pace: +p.pace.toFixed(2) };
}
