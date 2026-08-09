export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
  try {
    const { minLat, maxLat, minLon, maxLon } = req.query;
    
    // Используем надежный CORS-прокси, так как Vercel блокирует HTTP
    const response = await fetch('https://corsproxy.io/?url=http://data.blitzortung.org/Data/Protected/strikes.json');
    if (response.ok) {
      const text = await response.text();
      if (text.startsWith('[')) {
        const strikes = JSON.parse(text);
        let now = Date.now();
        let oneHourAgo = now / 1000 - 3600; // 1 час в секундах
        
        let filteredStrikes = [];
        for (let i = 0; i < strikes.length; i++) {
          let s = strikes[i];
          // Формат: [timestamp, lat, lon, status]
          let time = s[0];
          let lat = s[1];
          let lon = s[2];
          
          // Оставляем только свежие (до 1 часа) и те, что в видимой области карты
          if (time >= oneHourAgo && lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon) {
            filteredStrikes.push([lat, lon]);
          }
        }
        return res.status(200).json(filteredStrikes);
      }
    }
    return res.status(200).json([]);
  } catch (e) {
    return res.status(200).json([]);
  }
}
