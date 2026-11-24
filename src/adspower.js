import { getConfig } from './config.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Cliente da Local API do AdsPower com fila serial (respeita 1 req/s). */
class AdsPowerClient {
  #chain = Promise.resolve();
  #last = 0;

  post(path, body) { return this.call(path, {}, body); }

  call(path, params = {}, body = null) {
    const run = async () => {
      const { baseUrl, apiKey, minGapMs } = getConfig().adspower;
      for (let attempt = 0; attempt < 4; attempt++) {
        const wait = this.#last + minGapMs - Date.now();
        if (wait > 0) await sleep(wait);
        this.#last = Date.now();
        const url = new URL(path, baseUrl);
        for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
        const res = await fetch(url, {
          method: body ? 'POST' : 'GET',
          body: body ? JSON.stringify(body) : undefined,
          headers: { ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
          signal: AbortSignal.timeout(60000),
        });
        const json = await res.json();
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
          country: (p.ip_country || '').toUpperCase(),
          // nunca guardamos usuário/senha do proxy
          proxy: px.proxy_host ? `${px.proxy_type || 'proxy'}://${px.proxy_host}:${px.proxy_port}` : 'sem proxy',
        });
      }
      if (list.length < 100) break;
    }
    return all.sort((a, b) => a.serial - b.serial);
  }

  async start(id, { headless = false } = {}) {
    const d = await this.call('/api/v1/browser/start', {
      user_id: id,
      open_tabs: 1,
      headless: headless ? 1 : 0,
      launch_args: JSON.stringify(['--mute-audio']), // perfis sempre sem som
    });
    return { ws: d.ws?.puppeteer, debugPort: d.debug_port };
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
