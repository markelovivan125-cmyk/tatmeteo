import http from 'http';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
  const { minLat, maxLat, minLon, maxLon } = req.query;

  const options = {
    hostname: 'data.blitzortung.org',
    path: '/Data/Protected/strikes.json',
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'Referer': 'http://blitzortung.org/'
    }
  };

  return new Promise((resolve) => {
    const request = http.request(options, (response) => {
      let data = '';
      
      if (response.statusCode !== 200) {
        res.status(200).json({ error: "Blitzortung HTTP error: " + response.statusCode });
        resolve();
        return;
      }

      response.on('data', chunk => { data += chunk; });
      response.on('end', () => {
        try {
          const strikes = JSON.parse(data);
          let oneHourAgo = Date.now() / 1000 - 3600;
          let filteredStrikes = [];
          
          for (let i = 0; i < strikes.length; i++) {
            let s = strikes[i];
            let time = s[0], lat = s[1], lon = s[2];
            
            if (time >= oneHourAgo && lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon) {
              filteredStrikes.push([lat, lon]);
            }
          }
          res.status(200).json(filteredStrikes);
        } catch (e) {
          res.status(200).json({ error: "Parse error" });
        }
        resolve();
      });
    });

    request.on('error', (e) => {
      res.status(200).json({ error: e.message });
      resolve();
    });

    request.end();
  });
}
