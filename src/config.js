import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = process.env.WARMUP_DATA_DIR || path.join(ROOT, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const FILE = path.join(DATA_DIR, 'config.json');

export const defaults = {
  adspower: {
    baseUrl: 'http://127.0.0.1:50325', // no NAS: endereço da ponte no PC (ex.: http://192.168.0.10:50326)
    apiKey: '',
    bridgeToken: '', // preenchido = modo remoto: fala com o AdsPower pela ponte do PC (tools/pc-bridge.js)
    minGapMs: 1100, // a API do AdsPower limita ~1 requisição/segundo
  },
  scheduler: {
    concurrency: 3, // perfis abertos ao mesmo tempo
    sliceMinutes: 20, // tempo por perfil quando a rampa está desligada
    ramp: true, // rampa progressiva por perfil (dia 1 → dia 7)
    rampMinutes: [5, 8, 11, 14, 17, 20, 20],
    sliceJitterPct: 20, // varia o tempo ±% para não ficar robótico
    adaptive: true, // não abre novos perfis se o computador estiver sobrecarregado
    cpuMax: 80, // % de CPU média acima da qual não abre novos perfis
    memMinMB: 2500, // RAM disponível mínima para abrir novo perfil
    startStaggerSec: 10, // intervalo mínimo entre aberturas
    pauseBetweenCyclesMin: 0,
    requireProxy: true, // false = também aquece perfis sem proxy (navegam pelo IP do computador)
    headless: true, // segundo plano: sem janela
    // Quem aquecer: um perfil entra se casar com qualquer uma das opções ligadas
    scope: {
      facebook: true, // perfis marcados como logados no Facebook ou com páginas cadastradas
      newProfiles: true, // perfis novos (criados há pouco ou que ainda não navegaram)
      others: true, // todos os demais
    },
    newProfileDays: 30, // "novo" = criado nos últimos N dias
    groupFilter: '', // nomes de grupos separados por vírgula (vazio = todos)
    includeIds: '', // lista manual de ids (vazio = usa as opções acima)
    excludeIds: '',
  },
  browsing: {
    minPageSec: 20,
    maxPageSec: 80,
    pageTimeoutSec: 30,
    maxInternalClicks: 3,
    searchRatio: 0.3, // chance de iniciar por busca no Google
    youtubeRatio: 0.3,
    facebookOnly: false, // true = perfis do Facebook só navegam no Facebook (nada de Google/YouTube/sites)
    facebookRatio: 0.2, // só em perfis marcados como logados no Facebook
    acceptCookies: true, // true = aceita cookies; false = só recusa
    niche: 'spirituality,health,fitness', // categorias principais das personas
  },
  facebook: {
    pagesEnabled: true, // aquece as páginas do Facebook (visita a própria página cadastrada)
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
  cofre: { url: '', apiKey: '', aliases: {} }, // só leitura: páginas do Facebook em aquecimento
  auth: {
    googleClientId: '',
    googleClientSecret: '',
    allowedEmails: '', // e-mails que podem entrar, separados por vírgula
    allowedDomains: '', // domínios inteiros liberados (ex.: suaempresa.com)
    publicUrl: '', // endereço(s) público(s) deste app, separados por vírgula (para o retorno do Google)
    ssoSecret: '', // o mesmo segredo do Hub (32+ caracteres): entra sem novo login
    ssoHours: 12,
    passwordLogin: true, // senha do painel como reserva (desligue no NAS depois de configurar o Google)
  },
  hub: { url: '' }, // endereço do Hub (link "Voltar ao Hub" no topo)
  dashboard: { port: 4747, host: '0.0.0.0', password: '' }, // só aceita IPs de rede local
};

function merge(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b || {})) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) ? merge(a?.[k] || {}, v) : v;
  }
  return out;
}

// Variáveis de ambiente (NAS/Docker). Dois tipos:
//  - padrão (SOFT): valem só até alguém salvar outro valor na tela; o que for salvo na tela (data/config.json) manda.
//    AdsPower, Cofre e Hub ficam aqui: o PC do AdsPower pode mudar e a tela precisa poder trocar URL, chave e token.
//  - travadas (HARD): mandam sobre a tela e nunca são gravadas no arquivo (acesso: Google, e-mails, segredo do Hub).
const SOFT_MAP = {
  ADSPOWER_URL: 'adspower.baseUrl', ADSPOWER_API_KEY: 'adspower.apiKey', ADSPOWER_BRIDGE_TOKEN: 'adspower.bridgeToken',
  COFRE_URL: 'cofre.url', COFRE_API_KEY: 'cofre.apiKey', HUB_URL: 'hub.url',
};
const ENV_MAP = {
  GOOGLE_CLIENT_ID: 'auth.googleClientId', GOOGLE_CLIENT_SECRET: 'auth.googleClientSecret',
  ALLOWED_EMAILS: 'auth.allowedEmails', ALLOWED_DOMAINS: 'auth.allowedDomains', PUBLIC_URL: 'auth.publicUrl', SSO_SECRET: 'auth.ssoSecret',
  DASHBOARD_PASSWORD: 'dashboard.password', PORT: 'dashboard.port', HOST: 'dashboard.host',
};
const setPath = (o, p, v) => { const k = p.split('.'); k.slice(0, -1).reduce((a, x) => (a[x] ??= {}), o)[k.at(-1)] = v; };
const getPath = (o, p) => p.split('.').reduce((a, x) => a?.[x], o);
const envPatch = () => {
  const patch = {}, locked = [];
  for (const [env, p] of Object.entries(ENV_MAP)) {
    const v = process.env[env];
    if (v === undefined || v === '') continue;
    setPath(patch, p, p === 'dashboard.port' ? Number(v) : v);
    locked.push(p);
  }
  if (process.env.PASSWORD_LOGIN !== undefined) { setPath(patch, 'auth.passwordLogin', process.env.PASSWORD_LOGIN !== '0'); locked.push('auth.passwordLogin'); }
  return { patch, locked };
};

let fileCfg = {};
try { fileCfg = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch {}
const ENV = envPatch();
const SOFT = (() => { const o = {}; for (const [env, p] of Object.entries(SOFT_MAP)) if (process.env[env]) setPath(o, p, process.env[env]); return o; })();
const compute = () => merge(merge(merge(defaults, SOFT), fileCfg), ENV.patch);
let cfg = compute();

export const getConfig = () => cfg;
export const lockedPaths = () => ENV.locked;

export function updateConfig(patch) {
  const locked = new Set(ENV.locked);
  // não deixa a tela gravar por cima de um valor definido pelo servidor (variável de ambiente)
  const clean = structuredClone(patch);
  for (const p of locked) { const k = p.split('.'); let o = clean; for (const x of k.slice(0, -1)) o = o?.[x]; if (o && k.at(-1) in o) delete o[k.at(-1)]; }
  fileCfg = merge(fileCfg, clean);
  fs.writeFileSync(FILE, JSON.stringify(fileCfg, null, 2));
  cfg = compute();
  return cfg;
}

const SECRETS = ['adspower.apiKey', 'adspower.bridgeToken', 'cofre.apiKey', 'auth.googleClientSecret', 'auth.ssoSecret'];

/** Configuração para a tela: segredos nunca saem; `hasSecret[path]` diz se existem. */
export function maskedConfig() {
  const c = structuredClone(cfg);
  c.hasSecret = {};
  for (const p of SECRETS) { c.hasSecret[p] = !!getPath(cfg, p); const k = p.split('.'); k.slice(0, -1).reduce((a, x) => a[x], c)[k.at(-1)] = ''; }
  // compatibilidade com telas antigas
  c.adspower.hasKey = c.hasSecret['adspower.apiKey'];
  if (c.cofre) c.cofre.hasKey = c.hasSecret['cofre.apiKey'];
  delete c.dashboard.password;
  c.locked = ENV.locked;
  return c;
}
