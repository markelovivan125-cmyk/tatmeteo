import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.TATMETEOSTORAGE_REDIS_REST_URL || process.env.tatmeteostorage_REDIS_REST_URL,
  token: process.env.TATMETEOSTORAGE_REDIS_REST_TOKEN || process.env.tatmeteostorage_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  const action = req.query.action;
  const userIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress;

  const getBody = () => new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(body)); } 
      catch { resolve({}); }
    });
  });

  if (req.method === 'POST') {
    const body = await getBody();
    const { password } = body;

    if (action === 'login') {
      if (!password) return res.status(400).json({ success: false, error: 'Введите пароль' });

      const exists = await redis.sismember('passwords', password);
      if (exists !== 1) return res.json({ success: false, error: 'Неверный пароль' });

      const sessionKeys = await redis.keys(`sess:${password}:*`);
      if (sessionKeys.length >= 1) {
        return res.json({ success: false, error: '🚫 Доступ запрещен! Этот пароль уже используется на другом устройстве.' });
      }

      const sid = Math.random().toString(36).slice(2);
      await redis.set(`sess:${password}:${sid}`, userIp, { ex: 60 });
      
      await redis.lpush('logs', `[${new Date().toLocaleString('ru-RU')}] IP: ${userIp} | ${password} | Вход (Устр: 1/1)`);

      res.setHeader('Set-Cookie', [
        `auth_pass=${password}; HttpOnly; Path=/; Max-Age=3600; SameSite=Lax`,
        `auth_sid=${sid}; HttpOnly; Path=/; Max-Age=3600; SameSite=Lax`
      ]);
      return res.json({ success: true });
    }

    if (action === 'heartbeat') {
      const cookies = req.headers.cookie || '';
      const passMatch = cookies.match(/auth_pass=([^;]+)/);
      const sidMatch = cookies.match(/auth_sid=([^;]+)/);
      
      if (passMatch && sidMatch) {
        const pass = passMatch[1];
        const sid = sidMatch[1];
        const exists = await redis.exists(`sess:${pass}:${sid}`);
        if (exists === 1) {
          await redis.set(`sess:${pass}:${sid}`, userIp, { ex: 60 });
        }
      }
      return res.json({ success: true });
    }

    if (action === 'logout') {
      const cookies = req.headers.cookie || '';
      const passMatch = cookies.match(/auth_pass=([^;]+)/);
      const sidMatch = cookies.match(/auth_sid=([^;]+)/);
      
      if (passMatch && sidMatch) {
        await redis.del(`sess:${passMatch[1]}:${sidMatch[1]}`);
        await redis.lpush('logs', `[${new Date().toLocaleString('ru-RU')}] IP: ${userIp} | ${passMatch[1]} | Выход`);
        
        res.setHeader('Set-Cookie', [
          'auth_pass=; HttpOnly; Path=/; Max-Age=0',
          'auth_sid=; HttpOnly; Path=/; Max-Age=0'
        ]);
      }
      return res.json({ success: true });
    }
  }

  return res.status(404).json({ error: 'Not found' });
}
