import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// --- НАСТРОЙКА БЕЗОПАСНОСТИ АДМИНА ---
// Измените этот пароль на свой сложный!
const ADMIN_MASTER_PASS = 'AdminRadar2024!'; 

export default async function handler(req, res) {
  const action = req.query.action;
  const cookies = req.headers.cookie || '';
  const adminCookieMatch = cookies.match(/admin_sess=([^;]+)/);
  const adminSess = adminCookieMatch ? adminCookieMatch[1] : null;

  // 1. ВХОД В АДМИНКУ (Проверка мастер-пароля)
  if (req.method === 'POST' && action === 'admin_login') {
    const getBody = () => new Promise((resolve) => {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve({}); } });
    });
    const body = await getBody();

    if (body.masterPassword === ADMIN_MASTER_PASS) {
      // Выдаем секретный токен сессии
      const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
      await redis.set(`admin_sess:${token}`, '1', { ex: 86400 }); // Сессия на 24 часа
      res.setHeader('Set-Cookie', `admin_sess=${token}; HttpOnly; Path=/; Max-Age=86400; SameSite=Lax`);
      return res.json({ success: true });
    }
    return res.status(401).json({ error: 'Неверный мастер-пароль' });
  }

  // 2. ПРОВЕРКА АВТОРИЗАЦИИ ДЛЯ ВСЕХ ОСТАЛЬНЫХ ЗАПРОСОВ
  let isAuthorized = false;
  if (adminSess) {
    const exists = await redis.get(`admin_sess:${adminSess}`);
    if (exists) isAuthorized = true;
  }

  if (!isAuthorized) {
    return res.status(403).json({ error: 'Доступ запрещен. Авторизуйтесь.' });
  }

  // --- АВТОРИЗОВАННЫЕ ДЕЙСТВИЯ ---
  try {
    if (req.method === 'GET') {
      const passwords = await redis.smembers('passwords');
      const logs = await redis.lrange('logs', 0, 19);

      const passStatus = [];
      for (const p of passwords) {
        const keys = await redis.keys(`sess:${p}:*`);
        let ips = [];
        for (const k of keys) {
          const ip = await redis.get(k);
          if (ip) ips.push(ip);
        }
        passStatus.push({ password: p, activeDevices: keys.length, ips: ips.join(', ') });
      }

      return res.json({ passwords: passStatus, logs });
    }

    if (req.method === 'POST') {
      const getBody = () => new Promise((resolve) => {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve({}); } });
      });
      const body = await getBody();
      const { action: postAction, password } = body;

      if (postAction === 'generate') {
        const newPass = Math.random().toString(36).slice(2, 10);
        await redis.sadd('passwords', newPass);
        return res.json({ success: true, password: newPass });
      }

      if (postAction === 'delete') {
        if (!password) return res.status(400).json({ error: 'Не указан пароль' });
        await redis.srem('passwords', password);
        await redis.del(`device:${password}`);
        const keys = await redis.keys(`sess:${password}:*`);
        if (keys.length > 0) await redis.del(...keys);
        return res.json({ success: true });
      }
    }

    return res.status(404).json({ error: 'Not found' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
