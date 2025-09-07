// api/debug.js (ESM)
export default function handler(req, res) {
  res.status(200).json({
    hasResendKey: Boolean(process.env.RESEND_API_KEY),
    node: process.version
  });
}
