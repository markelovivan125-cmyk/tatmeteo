import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

function randomText(len) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let str = '';
  for (let i = 0; i < len; i++) str += chars.charAt(Math.floor(Math.random() * chars.length));
  return str;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  const text = randomText(5);
  const id = Math.random().toString(36).slice(2);
  
  await redis.set(`captcha:${id}`, text.toLowerCase(), { ex: 300 });

  let svg = `<svg width="150" height="50" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<rect width="100%" height="100%" fill="#051a0e" />`;
  for (let i = 0; i < 6; i++) {
    svg += `<line x1="${Math.random()*150}" y1="${Math.random()*50}" x2="${Math.random()*150}" y2="${Math.random()*50}" stroke="rgba(0,255,157,0.3)" stroke-width="2"/>`;
  }
  text.split('').forEach((c, i) => {
    const x = 15 + i * 25;
    const y = 30 + Math.random() * 10 - 5;
    const rot = Math.random() * 30 - 15;
    const color = `hsl(${Math.random()*120 + 120}, 70%, 60%)`;
    svg += `<text x="${x}" y="${y}" font-family="monospace" font-size="24" font-weight="bold" fill="${color}" transform="rotate(${rot} ${x} ${y})">${c}</text>`;
  });
  svg += `</svg>`;
  
  return res.json({ id, svg });
}
