import express from 'express';
import cookieParser from 'cookie-parser';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { Redis } from '@upstash/redis';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// --- Store Abstraction (In-Memory with optional Upstash Redis fallback) ---
const hasRedisConfig = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
const redisClient = hasRedisConfig
  ? new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN })
  : null;

class InMemoryStore {
  constructor() {
    this.data = new Map();
    this.sets = new Map();
    this.lists = new Map();
    this.ttls = new Map();

    // Default passwords for demo/standalone usage
    const defaultPasswords = new Set(['tatmeteo', 'demo', 'radar2026']);
    this.sets.set('passwords', defaultPasswords);
    this.lists.set('logs', [`[${new Date().toLocaleString('ru-RU')}] [Инициализация] Сервер запущен`]);
  }

  async get(key) {
    this._checkExpire(key);
    return this.data.has(key) ? this.data.get(key) : null;
  }

  async set(key, value, opts) {
    this.data.set(key, String(value));
    if (opts && opts.ex) {
      this.ttls.set(key, Date.now() + opts.ex * 1000);
    } else {
      this.ttls.delete(key);
    }
    return 'OK';
  }

  async del(key) {
    this.data.delete(key);
    this.sets.delete(key);
    this.lists.delete(key);
    this.ttls.delete(key);
    return 1;
  }

  async exists(key) {
    this._checkExpire(key);
    return (this.data.has(key) || this.sets.has(key) || this.lists.has(key)) ? 1 : 0;
  }

  async sismember(key, val) {
    const set = this.sets.get(key);
    return set && set.has(val) ? 1 : 0;
  }

  async sadd(key, val) {
    if (!this.sets.has(key)) this.sets.set(key, new Set());
    this.sets.get(key).add(val);
    return 1;
  }

  async srem(key, val) {
    const set = this.sets.get(key);
    if (set) set.delete(val);
    return 1;
  }

  async smembers(key) {
    const set = this.sets.get(key);
    return set ? Array.from(set) : [];
  }

  async lpush(key, val) {
    if (!this.lists.has(key)) this.lists.set(key, []);
    this.lists.get(key).unshift(val);
    return this.lists.get(key).length;
  }

  async lrange(key, start, stop) {
    const list = this.lists.get(key) || [];
    return list.slice(start, stop < 0 ? list.length : stop + 1);
  }

  async incr(key) {
    this._checkExpire(key);
    const curr = parseInt(this.data.get(key) || '0', 10);
    const next = curr + 1;
    this.data.set(key, String(next));
    return next;
  }

  async expire(key, seconds) {
    if (this.data.has(key) || this.sets.has(key) || this.lists.has(key)) {
      this.ttls.set(key, Date.now() + seconds * 1000);
      return 1;
    }
    return 0;
  }

  async keys(pattern) {
    const regexStr = '^' + pattern.replace(/\*/g, '.*') + '$';
    const regex = new RegExp(regexStr);
    const matched = [];
    for (const k of this.data.keys()) {
      if (!this._isExpired(k) && regex.test(k)) matched.push(k);
    }
    return matched;
  }

  _checkExpire(key) {
    if (this._isExpired(key)) {
      this.data.delete(key);
      this.sets.delete(key);
      this.lists.delete(key);
      this.ttls.delete(key);
    }
  }

  _isExpired(key) {
    if (this.ttls.has(key) && Date.now() > this.ttls.get(key)) {
      return true;
    }
    return false;
  }
}

const memStore = new InMemoryStore();

const store = {
  get: (k) => (redisClient ? redisClient.get(k) : memStore.get(k)),
  set: (k, v, opts) => (redisClient ? redisClient.set(k, v, opts) : memStore.set(k, v, opts)),
  del: (k) => (redisClient ? redisClient.del(k) : memStore.del(k)),
  exists: (k) => (redisClient ? redisClient.exists(k) : memStore.exists(k)),
  sismember: (k, v) => (redisClient ? redisClient.sismember(k, v) : memStore.sismember(k, v)),
  sadd: (k, v) => (redisClient ? redisClient.sadd(k, v) : memStore.sadd(k, v)),
  srem: (k, v) => (redisClient ? redisClient.srem(k, v) : memStore.srem(k, v)),
  smembers: (k) => (redisClient ? redisClient.smembers(k) : memStore.smembers(k)),
  lpush: (k, v) => (redisClient ? redisClient.lpush(k, v) : memStore.lpush(k, v)),
  lrange: (k, st, sp) => (redisClient ? redisClient.lrange(k, st, sp) : memStore.lrange(k, st, sp)),
  incr: (k) => (redisClient ? redisClient.incr(k) : memStore.incr(k)),
  expire: (k, sec) => (redisClient ? redisClient.expire(k, sec) : memStore.expire(k, sec)),
  keys: (k) => (redisClient ? redisClient.keys(k) : memStore.keys(k))
};

const ADMIN_MASTER_PASS = process.env.ADMIN_MASTER_PASS || 'admin';

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// --- Session Auth Middleware Helper ---
async function isUserAuthenticated(req) {
  const pass = req.cookies.auth_pass;
  const sid = req.cookies.auth_sid;
  if (!pass || !sid) return false;
  try {
    const exists = await store.exists(`sess:${pass}:${sid}`);
    return exists === 1;
  } catch (e) {
    console.error('Auth verification error:', e);
    return false;
  }
}

// --- API Endpoints ---

// 1. CAPTCHA
app.get('/api/captcha', async (req, res) => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let text = '';
  for (let i = 0; i < 5; i++) text += chars.charAt(Math.floor(Math.random() * chars.length));

  const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
  await store.set(`captcha:${id}`, text.toLowerCase(), { ex: 300 });

  let svg = `<svg width="150" height="50" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<rect width="100%" height="100%" fill="#1a1e24" rx="6" />`;
  for (let i = 0; i < 6; i++) {
    const x1 = Math.random() * 150, y1 = Math.random() * 50;
    const x2 = Math.random() * 150, y2 = Math.random() * 50;
    svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="rgba(197,239,105,0.3)" stroke-width="1.5"/>`;
  }
  text.split('').forEach((c, i) => {
    const x = 16 + i * 26;
    const y = 32 + (Math.random() * 10 - 5);
    const rot = Math.random() * 26 - 13;
    svg += `<text x="${x}" y="${y}" font-family="monospace" font-size="24" font-weight="800" fill="#c5ef69" transform="rotate(${rot} ${x} ${y})">${c}</text>`;
  });
  svg += `</svg>`;

  res.setHeader('Cache-Control', 'no-store, max-age=0');
  return res.json({ id, svg });
});

// 2. AUTH / LOGIN
app.post('/api/auth', async (req, res) => {
  const action = req.query.action || req.body.action;
  if (action !== 'login') return res.status(400).json({ success: false, error: 'Неизвестное действие' });

  const { password, captchaId, captchaCode } = req.body || {};
  const userIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';

  if (!captchaId || !captchaCode) {
    return res.json({ success: false, error: 'Введите проверочный код' });
  }

  const realCaptcha = await store.get(`captcha:${captchaId}`);
  await store.del(`captcha:${captchaId}`);

  if (!realCaptcha || realCaptcha !== String(captchaCode).toLowerCase().trim()) {
    return res.json({ success: false, error: 'Неверный проверочный код' });
  }

  const attempts = await store.get(`attempts:${userIp}`);
  if (attempts && parseInt(attempts, 10) >= 5) {
    return res.status(429).json({ success: false, error: '🚫 Слишком много попыток. IP заблокирован на 15 минут.' });
  }

  if (!password) {
    return res.status(400).json({ success: false, error: 'Введите пароль' });
  }

  const exists = await store.sismember('passwords', password.trim());
  if (exists !== 1) {
    await store.incr(`attempts:${userIp}`);
    await store.expire(`attempts:${userIp}`, 900);
    return res.json({ success: false, error: 'Неверный пароль доступа' });
  }

  const currentDeviceToken = req.cookies.device_token;
  const boundDevice = await store.get(`device:${password}`);

  if (boundDevice) {
    if (boundDevice !== currentDeviceToken) {
      return res.json({ success: false, error: '🚫 Доступ запрещен! Пароль привязан к другому устройству.' });
    }
  } else {
    const newDevToken = Math.random().toString(36).slice(2) + Date.now().toString(36);
    await store.set(`device:${password}`, newDevToken);
    res.cookie('device_token', newDevToken, { httpOnly: true, path: '/', maxAge: 315360000000, sameSite: 'lax' });
  }

  await store.del(`attempts:${userIp}`);

  const sid = Math.random().toString(36).slice(2) + Date.now().toString(36);
  await store.set(`sess:${password}:${sid}`, userIp);
  await store.lpush('logs', `[${new Date().toLocaleString('ru-RU')}] Вход с IP: ${userIp} (Пароль: ${password})`);

  res.cookie('auth_pass', password, { httpOnly: true, path: '/', sameSite: 'lax' });
  res.cookie('auth_sid', sid, { httpOnly: true, path: '/', sameSite: 'lax' });

  return res.json({ success: true });
});

// 3. ME (Session Check)
app.get('/api/me', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  const auth = await isUserAuthenticated(req);
  return res.json({ auth });
});

// 4. ADMIN
app.all('/api/admin', async (req, res) => {
  const action = req.query.action || req.body?.action;

  if (req.method === 'POST' && action === 'admin_login') {
    const { masterPassword } = req.body || {};
    if (!ADMIN_MASTER_PASS) {
      return res.status(500).json({ error: 'ADMIN_MASTER_PASS не задан' });
    }
    if (typeof masterPassword === 'string' && safeEqual(masterPassword, ADMIN_MASTER_PASS)) {
      const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
      await store.set(`admin_sess:${token}`, '1', { ex: 86400 });
      res.cookie('admin_sess', token, { httpOnly: true, path: '/', maxAge: 86400000, sameSite: 'lax' });
      return res.json({ success: true });
    }
    return res.status(401).json({ error: 'Неверный мастер-пароль' });
  }

  const adminSess = req.cookies.admin_sess;
  let isAuthorized = false;
  if (adminSess) {
    const exists = await store.get(`admin_sess:${adminSess}`);
    if (exists) isAuthorized = true;
  }

  if (!isAuthorized) {
    return res.status(403).json({ error: 'Доступ запрещен. Авторизуйтесь.' });
  }

  if (req.method === 'GET') {
    const passwords = await store.smembers('passwords');
    const logs = await store.lrange('logs', 0, 19);

    const passStatus = [];
    for (const p of passwords) {
      const keys = await store.keys(`sess:${p}:*`);
      let ips = [];
      for (const k of keys) {
        const ip = await store.get(k);
        if (ip) ips.push(ip);
      }
      passStatus.push({ password: p, activeDevices: keys.length, ips: ips.join(', ') });
    }

    return res.json({ passwords: passStatus, logs });
  }

  if (req.method === 'POST') {
    const { action: postAction, password } = req.body || {};

    if (postAction === 'generate') {
      const newPass = Math.random().toString(36).slice(2, 10);
      await store.sadd('passwords', newPass);
      return res.json({ success: true, password: newPass });
    }

    if (postAction === 'delete') {
      if (!password) return res.status(400).json({ error: 'Не указан пароль' });
      await store.srem('passwords', password);
      await store.del(`device:${password}`);
      const keys = await store.keys(`sess:${password}:*`);
      for (const k of keys) await store.del(k);
      return res.json({ success: true });
    }
  }

  return res.status(400).json({ error: 'Неподдерживаемый запрос' });
});

// 5. PROXY: idark / idarkProxy (REMOVED)
app.get(['/api/idark', '/api/idarkProxy'], (req, res) => {
  return res.status(410).json({ error: 'idark source removed' });
});

// 6. PROXY: nowcastProxy
let cachedNowcastToken = null;
let nowcastTokenExpMs = 0;

async function getNowcastToken(signal) {
  const now = Date.now();
  if (cachedNowcastToken && now < nowcastTokenExpMs) return cachedNowcastToken;
  const r = await fetch('https://www.nowcast.ru/get_token', { signal, headers: { 'User-Agent': 'tatmeteo-doppler/1.0' } });
  if (!r.ok) throw new Error('get_token HTTP ' + r.status);
  const j = await r.json();
  if (!j || !j.token) throw new Error('get_token: пустой ответ');
  cachedNowcastToken = j.token;
  nowcastTokenExpMs = now + 10 * 60 * 1000;
  return cachedNowcastToken;
}

app.get('/api/nowcastProxy', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const qIdx = req.url.indexOf('?');
  let qs = qIdx >= 0 ? req.url.slice(qIdx + 1) : '';
  qs = qs.split('&').filter(p => !/^token=/i.test(p)).join('&');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 18000);

  try {
    const token = await getNowcastToken(ctrl.signal);
    let upstream = null, lastErr = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        upstream = await fetch(`https://www.nowcast.ru/baltrad_wsgi?${qs}&token=${encodeURIComponent(token)}`, {
          signal: ctrl.signal,
          headers: { 'User-Agent': 'tatmeteo-doppler/1.0' }
        });
        if (upstream.status < 500) break;
        lastErr = new Error('upstream HTTP ' + upstream.status);
      } catch (e) {
        if (e.name === 'AbortError') throw e;
        lastErr = e; upstream = null;
      }
      if (attempt === 0) await new Promise(r => setTimeout(r, 800));
    }

    clearTimeout(timer);
    if (!upstream) throw lastErr || new Error('upstream недоступен');

    if (upstream.status === 401 || upstream.status === 403) {
      cachedNowcastToken = null; nowcastTokenExpMs = 0;
      return res.status(502).send('nowcast: токен отклонён');
    }
    if (!upstream.ok) {
      return res.status(502).send(`nowcast upstream: HTTP ${upstream.status}`);
    }

    const buf = Buffer.from(await upstream.arrayBuffer());
    const ct = upstream.headers.get('content-type') || 'image/png';
    res.setHeader('Content-Type', ct);
    res.setHeader('Cache-Control', 'public, max-age=60');
    return res.send(buf);
  } catch (e) {
    clearTimeout(timer);
    return res.status(502).send(`nowcast proxy error: ${e.message}`);
  }
});

// 7. PROXY: satProxy (EUMETSAT)
app.get('/api/satProxy', async (req, res) => {
  const UPSTREAM = 'https://view.eumetsat.int/geoserver/wms';
  const qIdx = req.url.indexOf('?');
  const qs = qIdx >= 0 ? req.url.slice(qIdx + 1) : '';

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);

  try {
    const upstream = await fetch(UPSTREAM + (qs ? '?' + qs : ''), {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'tatmeteo-proxy/1.0' }
    });
    clearTimeout(timer);

    if (!upstream.ok) {
      return res.status(502).send(`EUMETSAT error: HTTP ${upstream.status}`);
    }

    const buf = Buffer.from(await upstream.arrayBuffer());
    const hasTime = /(^|&)time=/i.test(qs);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/png');
    res.setHeader('Cache-Control', hasTime ? 'public, max-age=3600, s-maxage=86400, immutable' : 'public, max-age=60');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.send(buf);
  } catch (e) {
    clearTimeout(timer);
    return res.status(502).send(`Satellite proxy error: ${e.message}`);
  }
});

// 8. PROXY: lightning (Blitzortung)
app.get('/api/lightning', async (req, res) => {
  const user = process.env.BLITZORTUNG_USER || '';
  const pass = process.env.BLITZORTUNG_PASS || '';
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (!user || !pass) {
    return res.status(503).json({ error: 'BLITZORTUNG_USER/PASS не заданы на сервере' });
  }

  const minLat = parseFloat(req.query.minLat), maxLat = parseFloat(req.query.maxLat);
  const minLon = parseFloat(req.query.minLon), maxLon = parseFloat(req.query.maxLon);
  const minutes = Math.max(5, Math.min(120, parseInt(req.query.minutes, 10) || 30));
  const hasBbox = [minLat, maxLat, minLon, maxLon].every(Number.isFinite);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);

  try {
    const upstream = await fetch('https://data.blitzortung.org/Data/Protected/strikes.json', {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'tatmeteo-lightning/1.0',
        'Accept': 'application/json',
        'Authorization': 'Basic ' + Buffer.from(user + ':' + pass).toString('base64')
      }
    });
    clearTimeout(timer);

    if (!upstream.ok) {
      return res.status(502).json({ error: `Blitzortung upstream: HTTP ${upstream.status}` });
    }

    const data = await upstream.json();
    const raw = Array.isArray(data) ? data : (Array.isArray(data.strikes) ? data.strikes : []);
    const now = Date.now() / 1000;
    const since = now - minutes * 60;
    const strikes = [];

    for (let i = 0; i < raw.length; i++) {
      const s = raw[i];
      if (!Array.isArray(s) || s.length < 3) continue;
      let t = +s[0];
      if (t > 1e15) t = t / 1e9;
      else if (t > 1e12) t = t / 1e3;
      const lat = +s[1], lon = +s[2];
      if (!Number.isFinite(t) || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      if (t < since) continue;
      if (hasBbox && (lat < minLat || lat > maxLat || lon < minLon || lon > maxLon)) continue;
      strikes.push([+lat.toFixed(4), +lon.toFixed(4), Math.round(t)]);
    }

    return res.json({ strikes, count: strikes.length, fetched_at: Math.round(now) });
  } catch (e) {
    clearTimeout(timer);
    return res.status(502).json({ error: e.name === 'AbortError' ? 'Blitzortung: тайм-аут' : e.message });
  }
});

// --- Protected Routes (Radar App) ---
async function handleProtected(req, res, targetFile = 'index.html') {
  const isAuth = await isUserAuthenticated(req);
  if (!isAuth) {
    if (req.headers.accept && req.headers.accept.includes('text/html')) {
      return res.redirect('/login.html');
    }
    return res.status(401).json({ error: 'Необходима авторизация' });
  }

  const filePath = path.join(__dirname, 'protected', targetFile);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('404: File Not Found');
  }

  res.setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate');
  return res.sendFile(filePath);
}

app.get('/radar', (req, res) => handleProtected(req, res, 'index.html'));
app.get('/index.html', (req, res) => handleProtected(req, res, 'index.html'));
app.get('/protected/:file(*)', (req, res) => handleProtected(req, res, req.params.file));

// --- Public Routes & Static Files ---
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'landing.html'));
});

app.get(['/forecast', '/forecast.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'forecast.html'));
});

app.get(['/login', '/login.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get(['/admin', '/admin.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

// Catch-all for unauthenticated or unknown requests
app.use(async (req, res) => {
  const reqPath = req.path.replace(/^\/+/, '');
  const protectedPath = path.join(__dirname, 'protected', reqPath);

  if (fs.existsSync(protectedPath) && !fs.statSync(protectedPath).isDirectory()) {
    return handleProtected(req, res, reqPath);
  }

  res.status(404).sendFile(path.join(__dirname, 'public', 'landing.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`==================================================`);
  console.log(`⚡ Tatmeteo Radar Server active on http://0.0.0.0:${PORT}`);
  console.log(`🔑 Demo password: tatmeteo  | Admin pass: ${ADMIN_MASTER_PASS}`);
  console.log(`==================================================`);
});
