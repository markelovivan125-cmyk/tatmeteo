import { kv } from '@vercel/kv';

const ADMIN_SECRET = 'super-admin-key'; // Ваш секретный ключ

export default async function handler(req, res) {
  const secret = req.query.secret || req.body?.secret;
  if (secret !== ADMIN_SECRET) return res.status(403).json({ error: 'Доступ запрещен' });

  if (req.method === 'GET') {
    const passwords = await kv.smembers('passwords');
    const logs = await kv.lrange('logs', 0, 19);

    const passStatus = [];
    for (const p of passwords) {
      // Ищем все активные сессии для этого пароля
      const keys = await kv.keys(`sess:${p}:*`);
      let ips = [];
      for (const k of keys) {
        const ip = await kv.get(k);
        if (ip) ips.push(ip);
      }
      passStatus.push({ 
        password: p, 
        activeDevices: keys.length, 
        ips: ips.join(', ') 
      });
    }

    return res.json({ passwords: passStatus, logs });
  }

  if (req.method === 'POST') {
    const { action, password } = req.body || {};

    if (action === 'generate') {
      const newPass = Math.random().toString(36).slice(2, 10);
      await kv.sadd('passwords', newPass);
      return res.json({ success: true, password: newPass });
    }

    if (action === 'delete') {
      await kv.srem('passwords', password);
      // Удаляем все активные сессии, привязанные к этому паролю
      const keys = await kv.keys(`sess:${password}:*`);
      if (keys.length > 0) {
        await kv.del(...keys);
      }
      return res.json({ success: true });
    }
  }

  return res.status(404).json({ error: 'Not found' });
}
