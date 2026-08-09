import { Redis } from '@upstash/redis';
import fs from 'fs';
import path from 'path';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  // 1. Проверка авторизации по куке
  const cookies = req.headers.cookie || '';
  const passMatch = cookies.match(/auth_pass=([^;]+)/);
  const sidMatch = cookies.match(/auth_sid=([^;]+)/);

  let isAuth = false;
  if (passMatch && sidMatch) {
    const exists = await redis.exists(`sess:${passMatch[1]}:${sidMatch[1]}`);
    if (exists === 1) isAuth = true;
  }

  // Если не авторизован - гоним на страницу входа
  if (!isAuth) {
    res.writeHead(302, { Location: '/login.html' });
    res.end();
    return;
  }

  // 2. Если авторизован - отдаем запрошенный файл из папки protected
  let reqPath = req.url === '/' ? '/index.html' : req.url;
  reqPath = reqPath.split('?')[0]; // Убираем параметры запроса
  
  // Защита от выхода за пределы папки
  reqPath = reqPath.replace(/\.\.\//g, '');

  const filePath = path.join(process.cwd(), 'protected', reqPath);
  
  try {
    if (!fs.existsSync(filePath)) {
      res.status(404).send('Файл не найден');
      return;
    }

    const ext = path.extname(filePath);
    let contentType = 'text/html';
    if (ext === '.js') contentType = 'text/javascript';
    else if (ext === '.css') contentType = 'text/css';
    else if (ext === '.png') contentType = 'image/png';

    const fileContent = fs.readFileSync(filePath);
    res.setHeader('Content-Type', contentType);
    res.status(200).send(fileContent);
  } catch (e) {
    res.status(500).send('Ошибка сервера');
  }
}
