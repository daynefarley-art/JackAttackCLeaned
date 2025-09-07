// api/send-email.js — LITE MODE: accepts empty body, hardcoded recipient, no attachment
import { Resend } from 'resend';

const MODE = 'lite'; // so we can verify deployment with GET

function sendJson(res, status, body) {
  res.status(status);
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}
function msg(err) {
  if (!err) return 'Unknown error';
  if (typeof err === 'string') return err;
  if (err.message) return err.message;
  if (err.error?.message) return err.error.message;
  if (Array.isArray(err.errors) && err.errors[0]?.message) return err.errors[0].message;
  return 'Unspecified error';
}

export default async function handler(req, res) {
  // GET returns mode so we can confirm which version is live
  if (req.method === 'GET') {
    return sendJson(res, 200, { ok: true, mode: MODE });
  }
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    // Read body but DON'T require fields — we default below
    let raw = '';
    for await (const chunk of req) raw += chunk;

    let payload = {};
    if (raw) {
      try { payload = JSON.parse(raw); } catch { /* ignore invalid JSON */ }
    }

    if (!process.env.RESEND_API_KEY) {
      return sendJson(res, 500, { error: 'Missing RESEND_API_KEY env var' });
    }

    // ✅ Hardcode allowed recipient (trial restriction)
    const toList = ['dayne.farley@gmail.com'];

    // ✅ Default subject & CSV so empty body works
    const subject = (payload?.subject || 'Jack Attack Test (lite)').toString();
    const csv = (payload?.csv || 'team,score\nA,10\nB,8').toString();

    // Send CSV inline (no attachment to keep it simple)
    const text = `Final score (inline)\n\n${csv}\n`;

    const resend = new Resend(process.env.RESEND_API_KEY);
    const from = 'Jack Attack Scorer <onboarding@resend.dev>'; // permitted test sender

    const { data, error } = await resend.emails.send({
      from,
      to: toList,
      subject,
      text
    });

    if (error) return sendJson(res, 502, { error: msg(error) });
    return sendJson(res, 200, { ok: true, id: data?.id || null });
  } catch (e) {
    return sendJson(res, 500, { error: msg(e) });
  }
}
