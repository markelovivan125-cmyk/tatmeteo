import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  const action = req.query.action;
  const userIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress;

  if (req.method === 'POST') {
    const { password } = req.body || {};

    // --- ВХОД ---
    if (action === 'login') {
      if (!password) return res.json({ success: false, error: 'Введите пароль' });

      // Проверяем, существует ли пароль в базе (множество 'passwords')
      const exists = await kv.sismember('passwords', password);
      if (!exists) return res.json({ success: false, error: 'Неверный пароль' });

      // Проверяем, не висит ли блокировка (занят ли пароль)
      const isLocked = await kv.get(`lock:${password}`);
      if (isLocked) return res.json({ success: false, error: 'Этот пароль уже используется другим устройством!' });

      // Ставим блокировку на 60 секунд (пульс будет продлевать её)
      await kv.set(`lock:${password}`, userIp, { ex: 60 });

      // Записываем в логи
      await kv.lpush('logs', `[${new Date().toLocaleString('ru-RU')}] IP: ${userIp} | ${password} | Вход`);

      // Ставим куку, что юзер авторизован
      res.setHeader('Set-Cookie', `auth_pass=${password}; HttpOnly; Path=/; Max-Age=3600; SameSite=Lax`);
      return res.json({ success: true });
    }

    // --- ПУЛЬС (Heartbeat) ---
    if (action === 'heartbeat') {
      const cookie = req.headers.cookie || '';
      const match = cookie.match(/auth_pass=([^;]+)/);
      if (match) {
        // Продлеваем блокировку на 60 секунд
        await kv.set(`lock:${match[1]}`, userIp, { ex: 60 });
      }
      return res.json({ success: true });
    }

    // --- ВЫХОД ---
    if (action === 'logout') {
      const cookie = req.headers.cookie || '';
      const match = cookie.match(/auth_pass=([^;]+)/);
      if (match) {
        await kv.del(`lock:${match[1]}`); // Снимаем блокировку
        await kv.lpush('logs', `[${new Date().toLocaleString('ru-RU')}] IP: ${userIp} | ${match[1]} | Выход`);
        res.setHeader('Set-Cookie', 'auth_pass=; HttpOnly; Path=/; Max-Age=0');
      }
      return res.json({ success: true });
    }
  }

  return res.status(404).json({ error: 'Not found' });
}