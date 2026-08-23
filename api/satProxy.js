export default async function handler(req, res) {
  res.status(410).json({
    error: "External data parsing/proxy is disabled on this deployment.",
    endpoint: "/api/nowcastProxy",
  });
}
