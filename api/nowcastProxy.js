// Прокси WMS nowcast.ru — НАСТОЯЩИЙ доплер (радиальная скорость ДМРЛ, слои bufr_vel1..4).
//
// Зачем прокси: ответы nowcast.ru идут БЕЗ CORS-заголовков → при прямых запросах из
// браузера canvas становится tainted (ломаются экспорт композита). Плюс токен
// nowcast привязан к IP запрашивающего — получаем его ЗДЕСЬ, на сервере, и здесь же
// подставляем в запросы. Токен клиенту НЕ возвращается и НЕ логируется.
//
// Схема: клиент → /api/nowcastProxy?<WMS-параметры Leaflet> →
//        сервер добавляет &token=<кэшированный> → https://www.nowcast.ru/baltrad_wsgi

const TOKEN_URL = 'https://www.nowcast.ru/get_token';
const WMS_URL = 'https://www.nowcast.ru/baltrad_wsgi';
const TIMEOUT_MS = 12000;

// Кэш токена в глобальной области инстанса serverless-функции
let cachedToken = null;
let tokenExpMs = 0; // момент, когда токен пора обновить

function parseJwtExp(token) {
  // JWT-подобный токен: header.payload.sig; payload — base64url JSON с полем exp (unix-сек)
  try {
    const payload = token.split('.')[1];
    const json = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    if (json && Number.isFinite(+json.exp)) return +json.exp * 1000;
  } catch (e) { /* не парсится — обновим по таймеру */ }
  return 0;
}

async function getToken(signal) {
  const now = Date.now();
  if (cachedToken && now < tokenExpMs) return cachedToken;
  const r = await fetch(TOKEN_URL, { signal, headers: { 'User-Agent': 'tatmeteo-doppler/1.0' } });
  if (!r.ok) throw new Error('get_token HTTP ' + r.status);
  const j = await r.json();
  if (!j || !j.token) throw new Error('get_token: пустой ответ');
  cachedToken = j.token;
  const exp = parseJwtExp(j.token);
  // Обновляем за 60с до истечения; если exp не распознан — раз в 10 минут
  tokenExpMs = exp ? exp - 60000 : now + 10 * 60 * 1000;
  return cachedToken;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*'); // свой домен; подстраховка

  const qIdx = req.url.indexOf('?');
  let qs = qIdx >= 0 ? req.url.slice(qIdx + 1) : '';
  // Клиентский token из query отбрасываем, если вдруг прислали — используем только свой
  qs = qs.split('&').filter(p => !/^token=/i.test(p)).join('&');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const token = await getToken(ctrl.signal);
    const upstream = await fetch(WMS_URL + '?' + qs + '&token=' + encodeURIComponent(token), {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'tatmeteo-doppler/1.0' }
    });
    clearTimeout(timer);

    if (upstream.status === 401 || upstream.status === 403) {
      cachedToken = null; tokenExpMs = 0; // токен протух/отклонён — сбросить кэш
      res.statusCode = 502;
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Cache-Control', 'no-store');
      return res.end('nowcast: токен отклонён (HTTP ' + upstream.status + ')');
    }
    if (!upstream.ok) {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Cache-Control', 'no-store');
      return res.end('nowcast upstream: HTTP ' + upstream.status);
    }

    const buf = Buffer.from(await upstream.arrayBuffer());
    const hasTime = /(^|&)time=/i.test(qs);
    res.statusCode = 200;
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/png');
    // Исторические кадры (TIME= задан) неизменяемы — сутки на CDN; LIVE — 5 минут
    res.setHeader('Cache-Control', hasTime
      ? 'public, max-age=3600, s-maxage=86400, immutable'
      : 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');
    res.end(buf);
  } catch (e) {
    clearTimeout(timer);
    res.statusCode = 502;
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Cache-Control', 'no-store');
    res.end('nowcast proxy: ' + (e.name === 'AbortError' ? 'timeout' : e.message));
  }
}
