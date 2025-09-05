// api/ping.js (ESM)
export default function handler(req, res) {
  res.status(200).json({ pong: true });
}
