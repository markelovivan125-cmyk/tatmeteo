import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
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
    const { password, captchaId, captchaCode } = body;

    if (action === 'login') {
      // 1. Проверка капчи
      if (!captchaId || !captchaCode) return res.json({ success: false, error: 'Введите код с картинки' });
      const realCaptcha = await redis.get(`captcha:${captchaId}`);
      await redis.del(`captcha:${captchaId}`); // Удаляем использованную капчу
      if (!realCaptcha || realCaptcha !== captchaCode.toLowerCase()) {
        return res.json({ success: false, error: 'Неверный код с картинки' });
      }

      // 2. Защита от перебора (Брутфорса)
      const attempts = await redis.get(`attempts:${userIp}`);
      if (attempts && parseInt(attempts) >= 5) {
        return res.status(429).json({ success: false, error: '🚫 Слишком много попыток. IP заблокирован на 15 минут.' });
      }

      if (!password) return res.status(400).json({ success: false, error: 'Введите пароль' });

      const exists = await redis.sismember('passwords', password);
      if (exists !== 1) {
        await redis.incr(`attempts:${userIp}`);
        await redis.expire(`attempts:${userIp}`, 900); // Блок на 15 мин
        return res.json({ success: false, error: 'Неверный пароль' });
      }

      // 3. Безопасная привязка устройства (HttpOnly Cookie)
      const cookies = req.headers.cookie || '';
      const devMatch = cookies.match(/device_token=([^;]+)/);
      const currentDeviceToken = devMatch ? devMatch[1] : null;

      const boundDevice = await redis.get(`device:${password}`);

      if (boundDevice) {
        if (boundDevice !== currentDeviceToken) {
          return res.json({ success: false, error: '🚫 Доступ запрещен! Пароль привязан к другому устройству.' });
        }
      } else {
        // Привязываем устройство навсегда
        const newDevToken = Math.random().toString(36).slice(2) + Date.now().toString(36);
        await redis.set(`device:${password}`, newDevToken);
        res.setHeader('Set-Cookie', `device_token=${newDevToken}; HttpOnly; Path=/; Max-Age=31536000; SameSite=Lax`);
      }

      // Сбрасываем счетчик ошибок при успехе
      await redis.del(`attempts:${userIp}`);

      const sid = Math.random().toString(36).slice(2);
      await redis.set(`sess:${password}:${sid}`, userIp, { ex: 86400 });
      await redis.lpush('logs', `[${new Date().toLocaleString('ru-RU')}] IP: ${userIp} | ${password} | Вход`);

      res.setHeader('Set-Cookie', [
        `auth_pass=${password}; HttpOnly; Path=/; Max-Age=86400; SameSite=Lax`,
        `auth_sid=${sid}; HttpOnly; Path=/; Max-Age=86400; SameSite=Lax`
      ]);
      return res.json({ success: true });
    }

    if (action === 'heartbeat') {
      const cookies = req.headers.cookie || '';
      const passMatch = cookies.match(/auth_pass=([^;]+)/);
      const sidMatch = cookies.match(/auth_sid=([^;]+)/);
      if (passMatch && sidMatch) {
        const exists = await redis.exists(`sess:${passMatch[1]}:${sidMatch[1]}`);
        if (exists === 1) await redis.set(`sess:${passMatch[1]}:${sidMatch[1]}`, userIp, { ex: 86400 });
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
