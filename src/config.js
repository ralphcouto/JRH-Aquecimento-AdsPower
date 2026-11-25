import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = process.env.WARMUP_DATA_DIR || path.join(ROOT, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const FILE = path.join(DATA_DIR, 'config.json');

export const defaults = {
  adspower: {
    baseUrl: 'http://127.0.0.1:50325',
    apiKey: '',
    minGapMs: 1100, // a API do AdsPower limita ~1 requisição/segundo
  },
  scheduler: {
    concurrency: 3, // perfis abertos ao mesmo tempo
    sliceMinutes: 20, // tempo por perfil quando a rampa está desligada
    ramp: true, // rampa progressiva por perfil (dia 1 → dia 7)
    rampMinutes: [5, 8, 11, 14, 17, 20, 20],
    sliceJitterPct: 20, // varia o tempo ±% para não ficar robótico
    adaptive: true, // não abre novos perfis se o Mac estiver sobrecarregado
    cpuMax: 80, // % de CPU média acima da qual não abre novos perfis
    memMinMB: 2500, // RAM disponível mínima para abrir novo perfil
    startStaggerSec: 10, // intervalo mínimo entre aberturas
    pauseBetweenCyclesMin: 0,
    requireProxy: true, // ignora perfis sem proxy (senão navegariam pelo IP de casa)
    headless: true, // segundo plano: sem janela
    groupFilter: '', // nomes de grupos separados por vírgula (vazio = todos)
    includeIds: '', // ids separados por vírgula (vazio = todos)
    excludeIds: '',
  },
  browsing: {
    minPageSec: 20,
    maxPageSec: 80,
    pageTimeoutSec: 30,
    maxInternalClicks: 3,
    searchRatio: 0.3, // chance de iniciar por busca no Google
    youtubeRatio: 0.3,
    facebookOnly: false, // true = perfis marcados FB só navegam no Facebook
    facebookRatio: 0.2, // só em perfis marcados como logados no Facebook
    acceptCookies: true, // true = aceita cookies; false = só recusa
    niche: 'spirituality,health,fitness', // categorias principais das personas
  },
  facebook: {
    pageRatio: 0.25, // chance de visitar a própria página (se cadastrada)
    reelRatio: 0.45, // chance de buscar reels do nicho (o resto = feed)
    reelsPerVisit: [3, 6],
    reelWatchSec: [15, 60],
    likeChance: 0.35, // curtida simples por reel assistido
    commentChance: 0.12, // chance de comentar um reel assistido
    maxCommentsPerSession: 2,
    maxCommentsPerDay: 8, // por perfil
    maxLikesPerDay: 40, // por perfil
    comments: ['Needed this today 🙏', 'Love this energy ✨', 'Yes! Thank you for sharing 💫', 'This is so true 🙌', 'Beautiful reminder ❤️', 'Saving this one 🙏', 'I really needed to hear this today', 'Gratitude 🙏✨', 'Such a powerful message', 'This just made my day 😊', 'Amen to that 🙌', 'Love this so much ❤️', 'Exactly what I needed right now', 'Thank you for this 🙏', 'So inspiring ✨', 'Manifesting this 🙌', 'Feeling this deeply 💛', 'Good vibes only ✨', 'Perfect timing for this message 🙏', 'Beautiful 💫', 'Needed that reminder, thank you', 'This resonates so much', 'Receiving this 🙏✨', 'Wow, just what I needed 💛', 'Sending love and light ✨', 'Yes yes yes 🙌', 'So grateful for this ❤️', 'Powerful words 🙏', 'I believe in this 💫', 'Thank you for the reminder 🙏'],
    reelQueries: ['manifestation', 'manifestation tips', 'law of attraction', 'manifest your dream life', 'manifesting abundance', 'affirmations for manifestation', '369 method manifestation', 'vision board manifestation', 'manifestation journaling', 'attract what you want', 'wealth manifestation', 'money affirmations', 'abundance mindset', 'prosperity mindset', 'attract money', 'wealth frequency', 'financial abundance affirmations', 'rich mindset', 'prosperity affirmations', 'money manifestation'],
  },
  dashboard: { port: 4747, host: '0.0.0.0', password: '' }, // só aceita IPs de rede local
};

function merge(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b || {})) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) ? merge(a?.[k] || {}, v) : v;
  }
  return out;
}

let cfg = defaults;
try {
  cfg = merge(defaults, JSON.parse(fs.readFileSync(FILE, 'utf8')));
} catch {}
if (process.env.ADSPOWER_API_KEY) cfg.adspower.apiKey = process.env.ADSPOWER_API_KEY;
if (process.env.ADSPOWER_URL) cfg.adspower.baseUrl = process.env.ADSPOWER_URL;

export const getConfig = () => cfg;

export function updateConfig(patch) {
  cfg = merge(cfg, patch);
  fs.writeFileSync(FILE, JSON.stringify(cfg, null, 2));
  return cfg;
}

export function maskedConfig() {
  const c = structuredClone(cfg);
  c.adspower.hasKey = !!cfg.adspower.apiKey;
  c.adspower.apiKey = ''; // a chave nunca vai para o navegador
  delete c.dashboard.password;
  if (c.cofre) { c.cofre.hasKey = !!c.cofre.apiKey; c.cofre.apiKey = ''; }
  return c;
}
