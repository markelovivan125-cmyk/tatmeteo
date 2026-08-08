export default async function handler(req, res) {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/auth_pass=([^;]+)/);
  if (match) {
    return res.json({ auth: true });
  }
  return res.json({ auth: false });
}