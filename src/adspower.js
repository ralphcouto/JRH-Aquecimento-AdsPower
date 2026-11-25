import fs from 'node:fs';
import path from 'node:path';
import { getConfig, DATA_DIR } from './config.js';

const CACHE = path.join(DATA_DIR, 'profiles-cache.json');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Cliente da Local API do AdsPower com fila serial (respeita 1 req/s). */
class AdsPowerClient {
  #chain = Promise.resolve();
  #last = 0;

  post(path, body) { return this.call(path, {}, body); }

  call(path, params = {}, body = null) {
    const run = async () => {
      const { baseUrl, apiKey, minGapMs, bridgeToken } = getConfig().adspower;
      for (let attempt = 0; attempt < 4; attempt++) {
        const wait = this.#last + minGapMs - Date.now();
        if (wait > 0) await sleep(wait);
        this.#last = Date.now();
        const url = new URL(path, baseUrl);
        for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
        const res = await fetch(url, {
          method: body ? 'POST' : 'GET',
          body: body ? JSON.stringify(body) : undefined,
          headers: { ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}), ...(bridgeToken ? { 'x-bridge-token': bridgeToken } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
          signal: AbortSignal.timeout(60000),
        }).catch((e) => { throw new Error(this.#netError(e, baseUrl, bridgeToken)); });
        const json = await res.json().catch(() => { throw new Error(`AdsPower: resposta inválida de ${baseUrl} (HTTP ${res.status}). A URL aponta para a API (ou para a ponte)?`); });
        if (json.code === 0) return json.data;
        if (/too many request/i.test(json.msg || '')) {
          await sleep(1500);
          continue;
        }
        throw new Error(`AdsPower: ${json.msg || 'erro'} (${path})`);
      }
      throw new Error(`AdsPower: limite de requisições (${path})`);
    };
    const p = this.#chain.then(run, run);
    this.#chain = p.catch(() => {});
    return p;
  }

  #netError(e, baseUrl, bridgeToken) {
    const txt = [e.cause?.code, e.cause?.message, ...(e.cause?.errors || []).map((x) => x.code || x.message), e.name, e.message].join(' ');
    const alvo = bridgeToken ? 'a ponte do PC' : 'o AdsPower';
    const dica = /ECONNREFUSED|refused/i.test(txt) ? `${alvo} recusou a conexão: não está rodando nessa porta`
      : /TIMEOUT|ETIMEDOUT|aborted/i.test(txt) ? 'sem resposta (IP errado, PC desligado ou Firewall bloqueando a porta)'
      : /ENOTFOUND|EAI_AGAIN/i.test(txt) ? 'endereço não encontrado'
      : /EHOSTUNREACH|ENETUNREACH/i.test(txt) ? 'PC inalcançável na rede'
      : /ECONNRESET/i.test(txt) ? 'conexão derrubada' : e.message;
    return `AdsPower: não consegui falar com ${baseUrl} — ${dica}`;
  }

  /** Última lista de perfis lida com sucesso (usada quando o AdsPower/ponte não responde). */
  cachedProfiles() {
    try { return JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch { return null; }
  }

  async listProfiles() {
    const all = [];
    for (let page = 1; page < 50; page++) {
      const data = await this.call('/api/v1/user/list', { page, page_size: 100 });
      const list = data.list || [];
      for (const p of list) {
        const px = p.user_proxy_config || {};
        all.push({
          id: p.user_id,
          name: p.name || p.user_id,
          serial: Number(p.serial_number) || 0,
          group: p.group_name || '',
          ip: p.ip || '',
          created: (Number(p.created_time) || 0) * 1000,
          country: (p.ip_country || '').toUpperCase(),
          // nunca guardamos usuário/senha do proxy
          proxy: px.proxy_host ? `${px.proxy_type || 'proxy'}://${px.proxy_host}:${px.proxy_port}` : 'sem proxy',
        });
      }
      if (list.length < 100) break;
    }
    all.sort((a, b) => a.serial - b.serial);
    try { fs.writeFileSync(CACHE, JSON.stringify({ at: Date.now(), profiles: all })); } catch {}
    return all;
  }

  async start(id, { headless = false } = {}) {
    const d = await this.call('/api/v1/browser/start', {
      user_id: id,
      open_tabs: 1,
      headless: headless ? 1 : 0,
      launch_args: JSON.stringify(['--mute-audio']), // perfis sempre sem som
    });
    return { ws: this.#viaBridge(d.ws?.puppeteer), debugPort: d.debug_port };
  }

  /** Modo remoto (NAS): o navegador abre no PC, então o endereço de controle passa pela ponte do PC. */
  #viaBridge(ws) {
    const { baseUrl, bridgeToken } = getConfig().adspower;
    if (!ws || !bridgeToken) return ws;
    const u = new URL(ws), b = new URL(baseUrl);
    return `${b.protocol === 'https:' ? 'wss' : 'ws'}://${b.host}/cdp/${u.port}${u.pathname}?token=${encodeURIComponent(bridgeToken)}`;
  }

  stop(id) {
    return this.call('/api/v1/browser/stop', { user_id: id });
  }

  async active(id) {
    const d = await this.call('/api/v1/browser/active', { user_id: id });
    return d.status === 'Active';
  }
}

export const ads = new AdsPowerClient();
