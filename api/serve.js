import { Redis } from '@upstash/redis';
import fs from 'fs';
import path from 'path';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  // 1. Проверка авторизации
  const cookies = req.headers.cookie || '';
  const passMatch = cookies.match(/auth_pass=([^;]+)/);
  const sidMatch = cookies.match(/auth_sid=([^;]+)/);

  let isAuth = false;
  if (passMatch && sidMatch) {
    try {
      const exists = await redis.exists(`sess:${passMatch[1]}:${sidMatch[1]}`);
      if (exists === 1) isAuth = true;
    } catch (e) {
      console.error('Redis error:', e);
    }
  }

  if (!isAuth) {
    res.writeHead(302, { Location: '/login.html' });
    res.end();
    return;
  }

  // 2. Определение запрошенного файла
  let reqPath = req.url;
  if (reqPath.includes('?path=')) {
    reqPath = reqPath.split('?path=')[1];
  } else if (reqPath === '/' || reqPath === '/api/serve') {
    reqPath = 'index.html';
  }
  
  reqPath = reqPath.split('?')[0]; // Убираем параметры
  reqPath = decodeURIComponent(reqPath);
  
  // Полностью очищаем от любых слешей в начале и конце, чтобы path.join сработал правильно
  reqPath = reqPath.replace(/^\/+|\/+$/g, '');
  reqPath = reqPath.replace(/\.\.\//g, ''); // Защита от выхода из папки

  const filePath = path.join(process.cwd(), 'protected', reqPath);
  
  try {
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      // Выводим реальный путь в ошибку, чтобы понять, чего не хватает
      res.status(404).send(`404: File Not Found<br>Искал здесь: ${filePath}`);
      return;
    }

    const ext = path.extname(filePath);
    let contentType = 'text/html; charset=utf-8';
    if (ext === '.js') contentType = 'text/javascript; charset=utf-8';
    else if (ext === '.css') contentType = 'text/css; charset=utf-8';
    else if (ext === '.png') contentType = 'image/png';
    else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';

    const fileContent = fs.readFileSync(filePath);
    res.setHeader('Content-Type', contentType);
    res.status(200).send(fileContent);
  } catch (e) {
    console.error('Serve Error:', e);
    res.status(500).send('Internal Server Error');
  }
}
