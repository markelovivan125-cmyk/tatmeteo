import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Секретный ключ администратора (совпадает с ключом в public/admin.html)
const ADMIN_SECRET = 'xR9_@dminK3y#2024Sec!';

export default async function handler(req, res) {
  // Проверка секретного ключа из URL (?secret=...) или из тела запроса
  const secret = req.query.secret || req.body?.secret;
  if (secret !== ADMIN_SECRET) {
    return res.status(403).json({ error: 'Доступ запрещен' });
  }

  try {
    // --- ПОЛУЧЕНИЕ ДАННЫХ (GET) ---
    if (req.method === 'GET') {
      const passwords = await redis.smembers('passwords');
      const logs = await redis.lrange('logs', 0, 19);

      const passStatus = [];
      for (const p of passwords) {
        // Ищем все активные сессии для этого пароля
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

    // --- ДЕЙСТВИЯ (POST) ---
    if (req.method === 'POST') {
      // Надежное чтение тела запроса
      const getBody = () => new Promise((resolve) => {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          try { resolve(JSON.parse(body)); } 
          catch { resolve({}); }
        });
      });

      const body = await getBody();
      const { action, password } = body;

      // Генерация нового пароля
      if (action === 'generate') {
        const newPass = Math.random().toString(36).slice(2, 10);
        await redis.sadd('passwords', newPass);
        return res.json({ success: true, password: newPass });
      }

      // Удаление пароля
      if (action === 'delete') {
        if (!password) return res.status(400).json({ error: 'Не указан пароль для удаления' });
        
        // Удаляем сам пароль из множества
        await redis.srem('passwords', password);
        
        // Удаляем привязку устройства (чтобы пароль стал полностью чист)
        await redis.del(`device:${password}`);
        
        // Удаляем все активные сессии этого пароля (выкидываем юзера, если он онлайн)
        const keys = await redis.keys(`sess:${password}:*`);
        if (keys.length > 0) {
          await redis.del(...keys);
        }
        
        return res.json({ success: true });
      }
    }

    // Если метод не GET и не POST
    return res.status(404).json({ error: 'Not found' });

  } catch (error) {
    console.error('Admin API Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
