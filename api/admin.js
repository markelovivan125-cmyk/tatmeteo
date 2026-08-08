import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  // Проверка секретного ключа полностью удалена!

  if (req.method === 'GET') {
    const passwords = await kv.smembers('passwords');
    const logs = await kv.lrange('logs', 0, 19);

    const passStatus = [];
    for (const p of passwords) {
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
      const keys = await kv.keys(`sess:${password}:*`);
      if (keys.length > 0) {
        await kv.del(...keys);
      }
      return res.json({ success: true });
    }
  }

  return res.status(404).json({ error: 'Not found' });
}
