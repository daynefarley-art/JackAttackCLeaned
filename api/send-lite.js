// api/send-lite.js — brand-new route, cannot fail on missing body
import { Resend } from 'resend';

function sendJson(res, status, body) {
  res.status(status);
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  // GET: prove this file is live
  if (req.method === 'GET') {
    return sendJson(res, 200, { ok: true, mode: 'lite' });
  }
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  // Read body (but we’ll default values if none provided)
  let raw = '';
  for await (const chunk of req) raw += chunk;
  let payload = {};
  if (raw) {
    try { payload = JSON.parse(raw); } catch { /* ignore invalid JSON */ }
  }

  if (!process.env.RESEND_API_KEY) {
    return sendJson(res, 500, { error: 'Missing RESEND_API_KEY env var' });
  }

  // Trial-safe recipient (hardcoded)
  const toList = ['dayne.farley@gmail.com'];

  // Defaults so an empty body works
  const subject = (payload?.subject || 'Jack Attack Test (lite)').toString();
  const csv = (payload?.csv || 'team,score\nA,10\nB,8').toString();

  const text = `Final score (inline)\n\n${csv}\n`;

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const from = 'Jack Attack Scorer <onboarding@resend.dev>'; // test sender
    const { data, error } = await resend.emails.send({ from, to: toList, subject, text });
    if (error) return sendJson(res, 502, { error: error.message || 'Send blocked' });
    return sendJson(res, 200, { ok: true, id: data?.id || null });
  } catch (e) {
    return sendJson(res, 500, { error: e?.message || 'Unexpected error' });
  }
}
