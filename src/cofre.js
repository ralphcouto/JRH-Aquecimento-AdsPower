// Sincroniza as páginas do Facebook (kind=fb_page) do Cofre de Ativos com os perfis do AdsPower. Só leitura.
import { getConfig } from './config.js';

const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const STATUS_OK = new Set(['aquecendo']); // só páginas em aquecimento

/** Acha o perfil do AdsPower dono da página: alias manual > nome igual > "FB - <nome>". */
function matchProfile(parent, profiles, aliases) {
  const target = norm(aliases[parent] || parent);
  return profiles.find((p) => norm(p.name) === target)
    || profiles.find((p) => norm(p.name).replace(/^fb\s*-\s*/, '') === target)
    || null;
}

export async function syncCofre(profiles) {
  const c = getConfig().cofre || {};
  const key = process.env.COFRE_API_KEY || c.apiKey;
  if (!c.url || !key || /COLE_AQUI/.test(key)) throw new Error('Configure cofre.url e cofre.apiKey em data/config.json');
  const res = await fetch(`${c.url.replace(/\/$/, '')}/v1/assets?kind=fb_page&limit=500`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`Cofre respondeu ${res.status}`);
  const assets = (await res.json()).assets || [];
  const byProfile = new Map(), unmatched = new Map();
  for (const a of assets) {
    if (!STATUS_OK.has(a.status) || !/^https:\/\/(www\.|m\.|web\.)?facebook\.com\//.test(a.url || '')) continue;
    const p = matchProfile(a.parent_code, profiles, c.aliases || {});
    if (!p) { unmatched.set(a.parent_code, (unmatched.get(a.parent_code) || 0) + 1); continue; }
    if (!byProfile.has(p.id)) byProfile.set(p.id, { profile: p, pages: [] });
    byProfile.get(p.id).pages.push({ name: a.name, url: a.url });
  }
  return { total: assets.length, byProfile, unmatched: Object.fromEntries(unmatched) };
}
