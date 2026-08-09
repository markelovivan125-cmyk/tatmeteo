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
    const exists = await redis.exists(`sess:${passMatch[1]}:${sidMatch[1]}`);
    if (exists === 1) isAuth = true;
  }

  if (!isAuth) {
    res.writeHead(302, { Location: '/login.html' });
    res.end();
    return;
  }

  // 2. Отдача файлов
  let reqPath = req.url === '/' ? '/index.html' : req.url;
  reqPath = reqPath.split('?')[0]; // Убираем параметры (?v=123)
  
  // Защита от выхода за пределы папки
  reqPath = reqPath.replace(/\.\.\//g, '');

  const filePath = path.join(process.cwd(), 'protected', reqPath);
  
  try {
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.status(404).send('404: File Not Found');
      return;
    }

    const ext = path.extname(filePath);
    let contentType = 'text/html; charset=utf-8';
    if (ext === '.js') contentType = 'text/javascript; charset=utf-8';
    else if (ext === '.css') contentType = 'text/css; charset=utf-8';
    else if (ext === '.png') contentType = 'image/png';
    else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
    else if (ext === '.json') contentType = 'application/json; charset=utf-8';

    const fileContent = fs.readFileSync(filePath);
    res.setHeader('Content-Type', contentType);
    res.status(200).send(fileContent);
  } catch (e) {
    console.error('Serve Error:', e);
    res.status(500).send('Internal Server Error');
  }
}
