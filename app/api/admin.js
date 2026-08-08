import { kv } from '@vercel/kv';

const ADMIN_SECRET = 'tatarmeteorology12345'; // Смените на свой сложный ключ!

export default async function handler(req, res) {
  const secret = req.query.secret || req.body?.secret;
  if (secret !== ADMIN_SECRET) return res.status(403).json({ error: 'Доступ запрещен' });

  if (req.method === 'GET') {
    const passwords = await kv.smembers('passwords');
    const logs = await kv.lrange('logs', 0, 19); // Последние 20 логов

    const passStatus = [];
    for (const p of passwords) {
      const ip = await kv.get(`lock:${p}`);
      passStatus.push({ password: p, inUse: !!ip, ip });
    }

    return res.json({ passwords: passStatus, logs });
  }

  if (req.method === 'POST') {
    const { action, password } = req.body || {};

    if (action === 'generate') {
      const newPass = Math.random().toString(36).slice(2, 10); // 8-символьный пароль
      await kv.sadd('passwords', newPass);
      return res.json({ success: true, password: newPass });
    }

    if (action === 'delete') {
      await kv.srem('passwords', password);
      await kv.del(`lock:${password}`);
      return res.json({ success: true });
    }
  }

  return res.status(404).json({ error: 'Not found' });
}