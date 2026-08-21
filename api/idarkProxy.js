// Прокси данных 4x4 (idarkmeteo.host) — индексные кадры ДМРЛ.
// Клиент ходит на свой домен; API-ключ живёт ТОЛЬКО на сервере
// (в env IDARK_API_KEY или захардкоженный fallback) и клиенту не отдаётся.
//
// Запросы:
//   /api/idarkProxy?manifest=1                  → manifest.json (список моментов/продуктов/охватов)
//   /api/idarkProxy?palettes=1                  → palettes.json (палитры)
//   /api/idarkProxy?product=dbz&mosaic=europe&date=20260821&time=1430
//                                                → кадр PNG (индексный)
//
// Ответы кэшируются: кадры по моменту неизменяемы (по документации источника),
// манифест обновляется раз в 10 минут.

const UPSTREAM = 'https://idarkmeteo.host/api/v1';
const API_KEY = process.env.IDARK_API_KEY || 'rk_cfUVnoGCIodAp4ujrdlFmN9J';
const TIMEOUT_MS = 20000;

export default async function handler(req, res) {
  const u = new URL(req.url, 'http://x');
  const product = u.searchParams.get('product');
  const mosaic = u.searchParams.get('mosaic');
  const date = u.searchParams.get('date');
  const time = u.searchParams.get('time');

  let path;
  let isManifest = false;
  let isPalettes = false;
  if (u.searchParams.get('manifest')) {
    path = '/manifest.json';
    isManifest = true;
  } else if (u.searchParams.get('palettes')) {
    path = '/palettes.json';
    isPalettes = true;
  } else if (product && mosaic && date && time) {
    path = '/data/' + encodeURIComponent(product) + '/' + encodeURIComponent(mosaic) + '/' + date + '/' + time + '.png';
  } else {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'bad request: нужен manifest=1 | palettes=1 | product+mosaic+date+time' }));
    return;
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(UPSTREAM + path, {
      signal: ctrl.signal,
      headers: { 'X-API-Key': API_KEY, 'User-Agent': 'tatmeteo-idark/1.0' }
    });
    clearTimeout(timer);

    if (r.status === 401 || r.status === 403) {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'idark API key rejected (401/403)' }));
      return;
    }
    if (r.status === 429) {
      res.statusCode = 429;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'idark rate limit exceeded' }));
      return;
    }
    if (!r.ok) {
      res.statusCode = r.status;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'idark upstream HTTP ' + r.status }));
      return;
    }

    const buf = Buffer.from(await r.arrayBuffer());
    if (isManifest || isPalettes) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      /* манифест обновляется раз в 10 минут — кэшируем 8 минут */
      res.setHeader('Cache-Control', 'public, max-age=480, s-maxage=480');
      res.end(buf);
    } else {
      res.setHeader('Content-Type', 'image/png');
      /* кадр по моменту неизменяем — кэшируем надолго */
      res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, immutable');
      res.end(buf);
    }
  } catch (e) {
    clearTimeout(timer);
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'idark proxy error: ' + (e.name === 'AbortError' ? 'upstream timeout' : e.message) }));
  }
}
