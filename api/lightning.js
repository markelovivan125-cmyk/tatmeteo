export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
  try {
    const { minLat, maxLat, minLon, maxLon } = req.query;
    
    // Обращаемся напрямую по HTTPS с заголовками браузера
    const response = await fetch('https://data.blitzortung.org/Data/Protected/strikes.json', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Referer': 'https://map.blitzortung.org/'
      }
    });

    if (!response.ok) {
      return res.status(200).json({ error: "Blitzortung API error: " + response.status });
    }

    const data = await response.json();
    let strikes = Array.isArray(data) ? data : (data.strikes || []);

    let now = Date.now();
    let oneHourAgo = now / 1000 - 3600; // 1 час в секундах
    
    let filteredStrikes = [];
    for (let i = 0; i < strikes.length; i++) {
      let s = strikes[i];
      let time, lat, lon;
      
      // Защита от разных форматов данных
      if (Array.isArray(s)) {
        time = s[0];
        lat = s[1];
        lon = s[2];
      } else if (typeof s === 'object') {
        time = s.time || s.timestamp || s.t;
        lat = s.lat || s.latitude;
        lon = s.lon || s.lng || s.longitude;
      }

      if (!time || !lat || !lon) continue;
      
      // Переводим в секунды, если пришли миллисекунды
      if (time > 10000000000) time /= 1000;

      // Фильтруем по времени (1 час) и координатам экрана
      if (time >= oneHourAgo && lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon) {
        filteredStrikes.push([lat, lon]);
      }
    }
    
    return res.status(200).json(filteredStrikes);
  } catch (e) {
    return res.status(200).json({ error: e.message });
  }
}
