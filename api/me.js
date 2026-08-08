import Redis from 'ioredis';

if (!global._redis) {
  global._redis = new Redis(process.env.tatmeteostorage_REDIS_URL);
}
const redis = global._redis;

export default async function handler(req, res) {
  const cookies = req.headers.cookie || '';
  const passMatch = cookies.match(/auth_pass=([^;]+)/);
  const sidMatch = cookies.match(/auth_sid=([^;]+)/);
  
  if (passMatch && sidMatch) {
    const pass = passMatch[1];
    const sid = sidMatch[1];
    
    const exists = await redis.exists(`sess:${pass}:${sid}`);
    if (exists === 1) {
      return res.json({ auth: true });
    }
  }
  
  return res.json({ auth: false });
}
