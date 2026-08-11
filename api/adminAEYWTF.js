import { Redis } from '@upstash/redis';
import crypto from 'crypto';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

/* ─── Мастер-пароль админки («admin_master_key»): ТОЛЬКО из env (никогда не хардкодить!).
   ПОЛНАЯ ИНСТРУКЦИЯ (генерация ключа, Vercel, локально): README.md → «admin_master_key».
   Как задать:
   • Vercel: Dashboard → Project → Settings → Environment Variables →
     ADMIN_MASTER_PASS → значение → Production/Preview/Development → Redeploy.
   • Локально: cp .env.example .env, вписать значение; `vercel dev` подхватит сам.
   ВАЖНО: старый пароль засветился в истории коммитов публичного репозитория —
   после деплоя задайте НОВОЕ значение (историю git не очистить задним числом). ─── */
const ADMIN_MASTER_PASS = process.env.ADMIN_MASTER_PASS || '';

/* Сравнение, устойчивое к timing-атакам: длины выравниваем хэшированием */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export default async function handler(req, res) {
  const action = req.query.action;
  const cookies = req.headers.cookie || '';
  const adminCookieMatch = cookies.match(/admin_sess=([^;]+)/);
  const adminSess = adminCookieMatch ? adminCookieMatch[1] : null;

  if (req.method === 'POST' && action === 'admin_login') {
    const getBody = () => new Promise((resolve) => {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve({}); } });
    });
    const body = await getBody();

    if (!ADMIN_MASTER_PASS) {
      /* Не даём доступ и не логируем значения */
      return res.status(500).json({ error: 'ADMIN_MASTER_PASS не задан на сервере' });
    }
    if (typeof body.masterPassword === 'string' && safeEqual(body.masterPassword, ADMIN_MASTER_PASS)) {
      const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
      await redis.set(`admin_sess:${token}`, '1', { ex: 86400 }); 
      res.setHeader('Set-Cookie', `admin_sess=${token}; HttpOnly; Path=/; Max-Age=86400; SameSite=Lax`);
      return res.json({ success: true });
    }
    return res.status(401).json({ error: 'Неверный мастер-пароль' });
  }

  let isAuthorized = false;
  if (adminSess) {
    const exists = await redis.get(`admin_sess:${adminSess}`);
    if (exists) isAuthorized = true;
  }

  if (!isAuthorized) {
    return res.status(403).json({ error: 'Доступ запрещен. Авторизуйтесь.' });
  }

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
