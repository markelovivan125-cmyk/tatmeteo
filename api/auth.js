import { kv } from '@vercel/kv';

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

    // --- ВХОД ---
    if (action === 'login') {
      if (!password) return res.status(400).json({ success: false, error: 'Введите пароль' });

      const exists = await kv.sismember('passwords', password);
      if (!exists) return res.json({ success: false, error: 'Неверный пароль' });

      // Считаем, сколько устройств уже онлайн с этим паролем
      const sessionKeys = await kv.keys(`sess:${password}:*`);
      const activeDevices = sessionKeys.length;

      // Если уже 1 или больше устройств онлайн - не пускаем (Лимит: 1 устройство)
      if (activeDevices >= 1) {
        return res.json({ success: false, error: '🚫 Доступ запрещен! Этот пароль уже используется на другом устройстве.' });
      }

      // Создаем уникальный ID сессии для этого устройства
      const sid = Math.random().toString(36).slice(2);
      // Сохраняем сессию в Redis на 60 секунд (пульс будет продлевать её)
      await kv.set(`sess:${password}:${sid}`, userIp, { ex: 60 });
      
      await kv.lpush('logs', `[${new Date().toLocaleString('ru-RU')}] IP: ${userIp} | ${password} | Вход (Устр: 1/1)`);

      // Ставим две куки: пароль и ID сессии
      res.setHeader('Set-Cookie', [
        `auth_pass=${password}; HttpOnly; Path=/; Max-Age=3600; SameSite=Lax`,
        `auth_sid=${sid}; HttpOnly; Path=/; Max-Age=3600; SameSite=Lax`
      ]);
      return res.json({ success: true });
    }

    // --- ПУЛЬС (Heartbeat) ---
    if (action === 'heartbeat') {
      const cookies = req.headers.cookie || '';
      const passMatch = cookies.match(/auth_pass=([^;]+)/);
      const sidMatch = cookies.match(/auth_sid=([^;]+)/);
      
      if (passMatch && sidMatch) {
        const pass = passMatch[1];
        const sid = sidMatch[1];
        const exists = await kv.exists(`sess:${pass}:${sid}`);
        if (exists) {
          await kv.set(`sess:${pass}:${sid}`, userIp, { ex: 60 });
        }
      }
      return res.json({ success: true });
    }

    // --- ВЫХОД ---
    if (action === 'logout') {
      const cookies = req.headers.cookie || '';
      const passMatch = cookies.match(/auth_pass=([^;]+)/);
      const sidMatch = cookies.match(/auth_sid=([^;]+)/);
      
      if (passMatch && sidMatch) {
        await kv.del(`sess:${passMatch[1]}:${sidMatch[1]}`);
        await kv.lpush('logs', `[${new Date().toLocaleString('ru-RU')}] IP: ${userIp} | ${passMatch[1]} | Выход`);
        
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
