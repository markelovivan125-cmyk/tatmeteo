import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  const cookies = req.headers.cookie || '';
  const passMatch = cookies.match(/auth_pass=([^;]+)/);
  const sidMatch = cookies.match(/auth_sid=([^;]+)/);
  
  if (passMatch && sidMatch) {
    const pass = passMatch[1];
    const sid = sidMatch[1];
    
    // Проверяем, существует ли еще сессия в Redis (не истекли ли 60 секунд)
    const exists = await kv.exists(`sess:${pass}:${sid}`);
    if (exists) {
      return res.json({ auth: true });
    }
  }
  
  return res.json({ auth: false });
}
