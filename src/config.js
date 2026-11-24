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
    facebookRatio: 0.2, // só em perfis marcados como logados no Facebook
    acceptCookies: true, // true = aceita cookies; false = só recusa
    niche: 'spirituality,health,fitness', // categorias principais das personas
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
  return c;
}
