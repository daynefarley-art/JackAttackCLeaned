// api/send-email.js — LITE TEST: no attachment, hardcoded recipient, CSV defaulted
import { Resend } from 'resend';

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
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });

  try {
    // Read raw JSON body (don’t fail if empty)
    let raw = '';
    for await (const chunk of req) raw += chunk;

    let payload = {};
    if (raw) {
      try { payload = JSON.parse(raw); }
      catch { /* fall through with empty/defaults */ }
    }

    if (!process.env.RESEND_API_KEY) {
      return sendJson(res, 500, { error: 'Missing RESEND_API_KEY env var' });
    }

    // HARD-CODED recipient to satisfy Resend trial restriction
    const toList = ['dayne.farley@gmail.com'];

    // Subject & CSV (defaults so empty body still works)
    const subject = (payload?.subject || 'Jack Attack Test').toString();
    const csv = (payload?.csv || 'team,score\nA,10\nB,8').toString();

    const text =
`Final score (inline, lite mode)

${csv}
`;

    const resend = new Resend(process.env.RESEND_API_KEY);
    const from = 'Jack Attack Scorer <onboarding@resend.dev>'; // permitted test sender

    const { data, error } = await resend.emails.send({
      from,
      to: toList,
      subject,
      text
    });

    if (error) return sendJson(res, 502, { error: msg(error), details: error });
    return sendJson(res, 200, { ok: true, id: data?.id || null });
  } catch (e) {
    return sendJson(res, 500, { error: msg(e) });
  }
}
