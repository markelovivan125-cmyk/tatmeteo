import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  const action = req.query.action;
  const userIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress;

  // Надежная функция для чтения тела запроса на Vercel
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

    // --- ВХОД ---
    if (action === 'login') {
      if (!password) return res.status(400).json({ success: false, error: 'Введите пароль' });

      const exists = await kv.sismember('passwords', password);
      if (!exists) return res.json({ success: false, error: 'Неверный пароль' });

      const isLocked = await kv.get(`lock:${password}`);
      if (isLocked) return res.json({ success: false, error: 'Этот пароль уже используется другим устройством!' });

      await kv.set(`lock:${password}`, userIp, { ex: 60 });
      await kv.lpush('logs', `[${new Date().toLocaleString('ru-RU')}] IP: ${userIp} | ${password} | Вход`);

      res.setHeader('Set-Cookie', `auth_pass=${password}; HttpOnly; Path=/; Max-Age=3600; SameSite=Lax`);
      return res.json({ success: true });
    }

    // --- ПУЛЬС (Heartbeat) ---
    if (action === 'heartbeat') {
      const cookie = req.headers.cookie || '';
      const match = cookie.match(/auth_pass=([^;]+)/);
      if (match) {
        await kv.set(`lock:${match[1]}`, userIp, { ex: 60 });
      }
      return res.json({ success: true });
    }

    // --- ВЫХОД ---
    if (action === 'logout') {
      const cookie = req.headers.cookie || '';
      const match = cookie.match(/auth_pass=([^;]+)/);
      if (match) {
        await kv.del(`lock:${match[1]}`);
        await kv.lpush('logs', `[${new Date().toLocaleString('ru-RU')}] IP: ${userIp} | ${match[1]} | Выход`);
        res.setHeader('Set-Cookie', 'auth_pass=; HttpOnly; Path=/; Max-Age=0');
      }
      return res.json({ success: true });
    }
  }

  return res.status(404).json({ error: 'Not found' });
}
