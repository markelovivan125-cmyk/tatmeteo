export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
  try {
    // Запрашиваем данные молний за последний час
    const response = await fetch('http://data.blitzortung.org/Data/Protected/strikes.json');
    if (response.ok) {
      const text = await response.text();
      // Blitzortung отдает данные в формате массива массивов
      const strikes = JSON.parse(text);
      return res.status(200).json(strikes);
    } else {
      return res.status(200).json([]);
    }
  } catch (e) {
    return res.status(200).json([]);
  }
}
