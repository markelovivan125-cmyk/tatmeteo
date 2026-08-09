export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
  try {
    // Используем HTTPS-прокси, так как Vercel блокирует исходящие HTTP запросы
    const response = await fetch('https://corsproxy.io/?url=http://data.blitzortung.org/Data/Protected/strikes.json');
    if (response.ok) {
      const text = await response.text();
      // Blitzortung отдает данные в формате массива массивов
      if (text.startsWith('[')) {
        const strikes = JSON.parse(text);
        return res.status(200).json(strikes);
      }
    }
    return res.status(200).json([]);
  } catch (e) {
    return res.status(200).json([]);
  }
}
