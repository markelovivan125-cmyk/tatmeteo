import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.TATMETEOSTORAGE_REDIS_REST_URL || process.env.tatmeteostorage_REDIS_REST_URL,
  token: process.env.TATMETEOSTORAGE_REDIS_REST_TOKEN || process.env.tatmeteostorage_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
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
        await redis.sadd('passwords', newPass);
        return res.json({ success: true, password: newPass });
      }

      if (action === 'delete') {
        await redis.srem('passwords', password);
        const keys = await redis.keys(`sess:${password}:*`);
        if (keys.length > 0) {
          await redis.del(...keys);
        }
        return res.json({ success: true });
      }
    }

    return res.status(404).json({ error: 'Not found' });
  } catch (error) {
    console.error('Admin API Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
