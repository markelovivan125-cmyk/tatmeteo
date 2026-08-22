// Прокси WMS nowcast.ru — НАСТОЯЩИЙ доплер (радиальная скорость ДМРЛ, слои bufr_vel1..4).

const TOKEN_URL = 'https://www.nowcast.ru/get_token';
const WMS_URL = 'https://www.nowcast.ru/baltrad_wsgi';
const TIMEOUT_MS = 18000;

let cachedToken = null;
let tokenExpMs = 0;

function parseJwtExp(token) {
  try {
    const payload = token.split('.')[1];
    const json = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    if (json && Number.isFinite(+json.exp)) return +json.exp * 1000;
  } catch (e) {}
  return 0;
}

async function getToken(signal, forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedToken && now < tokenExpMs) return cachedToken;
  const r = await fetch(TOKEN_URL, { signal, headers: { 'User-Agent': 'tatmeteo-doppler/1.0' } });
  if (!r.ok) throw new Error('get_token HTTP ' + r.status);
  const j = await r.json();
  if (!j || !j.token) throw new Error('get_token: пустой ответ');
  cachedToken = j.token;
  const exp = parseJwtExp(j.token);
  tokenExpMs = exp ? exp - 60000 : now + 10 * 60 * 1000;
  return cachedToken;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const qIdx = req.url.indexOf('?');
  let qs = qIdx >= 0 ? req.url.slice(qIdx + 1) : '';
  qs = qs.split('&').filter(p => !/^token=/i.test(p)).join('&');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  try {
    let token = await getToken(ctrl.signal, false);
    let upstream = null;

    try {
      upstream = await fetch(WMS_URL + '?' + qs + '&token=' + encodeURIComponent(token), {
        signal: ctrl.signal,
        headers: { 'User-Agent': 'tatmeteo-doppler/1.0' }
      });
    } catch (e) {
      if (e.name === 'AbortError') throw e;
    }

    if (!upstream || upstream.status === 401 || upstream.status === 403) {
      token = await getToken(ctrl.signal, true);
      upstream = await fetch(WMS_URL + '?' + qs + '&token=' + encodeURIComponent(token), {
        signal: ctrl.signal,
        headers: { 'User-Agent': 'tatmeteo-doppler/1.0' }
      });
    }

    clearTimeout(timer);
    if (!upstream.ok) {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Cache-Control', 'no-store');
      return res.end('nowcast upstream: HTTP ' + upstream.status);
    }

    const buf = Buffer.from(await upstream.arrayBuffer());
    const hasTime = /(^|&)time=/i.test(qs);
    const ct = upstream.headers.get('content-type') || 'image/png';

    if (/(^|&)request=getmap(&|$)/i.test(qs) && ct.indexOf('image') < 0) {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Cache-Control', 'no-store');
      return res.end('4x4 upstream: не изображение (' + ct + ')');
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', ct);
    res.setHeader('Cache-Control', hasTime
      ? 'public, max-age=3600, s-maxage=86400, immutable'
      : 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');
    return res.end(buf);
  } catch (e) {
    clearTimeout(timer);
    res.statusCode = 502;
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Cache-Control', 'no-store');
    return res.end('nowcast proxy: ' + (e.name === 'AbortError' ? 'timeout' : e.message));
  }
}
