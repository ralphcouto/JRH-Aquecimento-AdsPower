// Comportamento humanizado: mouse, rolagem, digitação, leitura e detecção de bloqueios.

export const rand = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));

export function sleep(ms, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const t = setTimeout(done, ms);
    function done() { signal?.removeEventListener('abort', done); clearTimeout(t); resolve(); }
    signal?.addEventListener('abort', done, { once: true });
  });
}

const mousePos = new WeakMap();

export async function moveMouse(page, x, y) {
  const from = mousePos.get(page) || { x: rand(100, 500), y: rand(100, 400) };
  const dist = Math.hypot(x - from.x, y - from.y);
  const steps = Math.max(8, Math.min(40, Math.round(dist / 25)));
  // curva de Bézier quadrática com ponto de controle desviado
  const cx = (from.x + x) / 2 + rand(-80, 80);
  const cy = (from.y + y) / 2 + rand(-60, 60);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // ease in-out
    const px = (1 - e) ** 2 * from.x + 2 * (1 - e) * e * cx + e * e * x + rand(-1, 1);
    const py = (1 - e) ** 2 * from.y + 2 * (1 - e) * e * cy + e * e * y + rand(-1, 1);
    await page.mouse.move(px, py);
    await new Promise((r) => setTimeout(r, rand(6, 18)));
  }
  mousePos.set(page, { x, y });
}

export async function wander(page) {
  const vp = await page.evaluate(() => ({ width: innerWidth, height: innerHeight })).catch(() => ({ width: 1000, height: 600 }));
  await moveMouse(page, rand(60, vp.width - 60), rand(80, vp.height - 80));
}

/** Rola a página por ~durationMs, com pausas, pequenas voltas e movimentos de mouse. */
export async function readPage(page, durationMs, persona, signal) {
  const end = Date.now() + durationMs;
  let scrolled = 0;
  await wander(page).catch(() => {});
  while (Date.now() < end && !signal?.aborted) {
    const r = Math.random();
    try {
      if (r < 0.12) {
        const d = -randInt(80, 260);
        await page.mouse.wheel(0, d);
        scrolled += Math.abs(d);
      } else if (r < 0.2) {
        await wander(page);
      } else {
        const chunk = randInt(2, 4);
        for (let i = 0; i < chunk; i++) {
          const d = randInt(60, 140) * persona.scrollSpeed;
          await page.mouse.wheel(0, d);
          scrolled += d;
          await sleep(rand(30, 90), signal);
        }
      }
    } catch { break; }
    // pausa de "leitura"
    await sleep(Math.min(rand(700, 3200) * persona.pace, Math.max(0, end - Date.now())), signal);
  }
  return Math.round(scrolled);
}

export async function typeLike(page, text, signal) {
  for (const ch of text) {
    if (signal?.aborted) return;
    await page.keyboard.type(ch, { delay: rand(40, 140) });
    if (Math.random() < 0.06) await sleep(rand(200, 500), signal);
  }
}

/** Analisa a página em busca de captcha, login obrigatório, bloqueios e banners de cookies que cobrem a tela. */
export async function inspectPage(page) {
  try {
    return await page.evaluate(() => {
      const url = location.href;
      const title = document.title || '';
      const text = (document.body?.innerText || '').slice(0, 6000).toLowerCase();
      const vw = innerWidth, vh = innerHeight;
      const out = { url, title, textLen: text.length, flag: null };

      const frames = [...document.querySelectorAll('iframe')].map((f) => f.src || '');
      const captchaFrame = frames.some((s) => /recaptcha|hcaptcha|captcha|challenges\.cloudflare|arkoselabs|geetest/i.test(s));
      const captchaText = /verify (that )?you are (a )?human|are you a robot|unusual traffic|not a robot|checking your browser|just a moment|attention required|access denied|request blocked|press & hold|pressione e segure|verifique que você é humano|i'm not a robot/i.test(
        title.toLowerCase() + ' ' + text.slice(0, 1500)
      );
      if (/\/sorry\/|\/captcha|\/challenge|\/blocked/i.test(url) || (captchaFrame && text.length < 1500) || (captchaText && text.length < 2500)) {
        out.flag = 'captcha';
        return out;
      }
      if (/consent\.|\/consent|\/privacy-gate|gdpr/i.test(url)) { out.flag = 'cookie_wall'; return out; }

      // login/paywall obrigatório: pouco conteúdo e campo de senha visível
      const pw = document.querySelector('input[type=password]');
      if (pw && pw.offsetParent && text.length < 1500) { out.flag = 'login_wall'; return out; }

      // overlays fixos que cobrem a tela (consentimento ou modal bloqueante)
      for (const el of document.querySelectorAll('div,section,aside,dialog,form')) {
        const cs = getComputedStyle(el);
        if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
        const r = el.getBoundingClientRect();
        const area = (Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0))) / (vw * vh);
        if (area < 0.35) continue;
        const t = (el.innerText || '').toLowerCase();
        if (/cookie|consent|consentimento|privacy|privacidade|gdpr|datenschutz|accept all|aceitar|akzeptieren|accepter/.test(t)) {
          out.flag = 'cookie_wall';
          return out;
        }
        if (area > 0.6 && /sign in|log in|subscribe|entrar|assine|inscreva|register/.test(t) && cs.zIndex !== 'auto') {
          out.flag = 'login_wall';
          return out;
        }
      }
      return out;
    });
  } catch {
    return { url: page.url(), title: '', textLen: 0, flag: 'inspect_error' };
  }
}

/** Escolhe um link interno "natural" (títulos de matérias, produtos…) e devolve posição na tela. */
export async function pickInternalLink(page) {
  try {
    return await page.evaluate(() => {
      const host = location.hostname.replace(/^www\./, '');
      const base = host.split('.').slice(-2).join('.');
      const bad = /login|signin|sign-in|account|cart|checkout|subscribe|assine|download|mailto:|tel:|\.pdf|logout|register|privacy|terms|cookie|policy|javascript:|#$|\/tag\/?$/i;
      const roots = document.querySelectorAll('main a[href], article a[href]');
      const anchors = [...(roots.length > 8 ? roots : document.querySelectorAll('a[href]'))];
      const vh = innerHeight, vw = innerWidth;
      const cands = [];
      for (const a of anchors) {
        let u;
        try { u = new URL(a.href, location.href); } catch { continue; }
        if (!/^https?:$/.test(u.protocol)) continue;
        if (!u.hostname.endsWith(base)) continue;
        if (bad.test(a.href) || u.href === location.href) continue;
        const t = (a.innerText || a.getAttribute('aria-label') || '').trim();
        if (t.length < 12 || t.length > 140) continue;
        const r = a.getBoundingClientRect();
        if (r.width < 40 || r.height < 10 || r.top < 60 || r.bottom > vh - 20 || r.left < 0 || r.right > vw) continue;
        const cs = getComputedStyle(a);
        if (cs.visibility === 'hidden' || cs.display === 'none') continue;
        cands.push({ a, r, t });
      }
      if (!cands.length) return null;
      const c = cands[Math.floor(Math.random() * cands.length)];
      c.a.removeAttribute('target'); // evita abrir nova aba
      return { x: c.r.left + Math.min(c.r.width - 4, 10 + Math.random() * (c.r.width - 20)), y: c.r.top + c.r.height / 2, text: c.t, href: c.a.href };
    });
  } catch { return null; }
}

export const domainOf = (url) => {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
};

const REJECT = /^(reject all|reject|decline all|decline|deny all|deny|refuse all|refuse|only (necessary|essential)( cookies)?|necessary( cookies)? only|essential only|continue without accepting|rejeitar tudo|rejeitar todos|rejeitar|recusar|negar|apenas (os )?(necessários|essenciais)|rechazar todo|rechazar|solo (las )?necesarias|alle ablehnen|ablehnen|nur (notwendige|erforderliche)|tout refuser|refuser|continuer sans accepter|rifiuta tutto|rifiuta|solo necessari|alles weigeren|weigeren)$/i;

/** Procura um botão de "Rejeitar/Apenas necessários" e clica. NUNCA clica em "Aceitar". */
const ACCEPT = /^(accept all( cookies)?|accept( cookies)?|allow all( cookies)?|allow cookies|i agree|agree( and continue)?|agree & proceed|got it|ok|okay|aceitar tudo|aceitar todos( os cookies)?|aceitar( cookies)?|concordo|entendi|permitir todos|aceptar todo|aceptar( cookies)?|alle akzeptieren|akzeptieren|zustimmen|tout accepter|accepter|j'accepte|accetta tutto|accetta|alles accepteren|accepteren)$/i;
export async function tryConsent(page, accept) {
  return tryRejectConsent(page, accept ? ACCEPT : REJECT);
}
export async function tryRejectConsent(page, re0 = REJECT) {
  try {
    const pos = await page.evaluate((src) => {
      const re = new RegExp(src, 'i');
      const els = document.querySelectorAll('button, a, [role=button], input[type=button], input[type=submit]');
      for (const el of els) {
        const t = (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ');
        if (!t || t.length > 40 || !re.test(t)) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 20 || r.height < 10 || r.bottom < 0 || r.top > innerHeight) continue;
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }
      return null;
    }, re0.source);
    if (!pos) return false;
    await moveMouse(page, pos.x, pos.y);
    await sleep(rand(250, 700));
    await page.mouse.click(pos.x, pos.y);
    await sleep(rand(900, 1600));
    return true;
  } catch { return false; }
}
