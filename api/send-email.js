// api/send-email.js — LITE TEST: no attachment, hardcoded to allowed address
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
    // Read raw JSON body (we still accept it, but we won’t use 'to' here)
    let raw = '';
    for await (const chunk of req) raw += chunk;
    let payload = {};
    if (raw) {
      try { payload = JSON.parse(raw); }
      catch { return sendJson(res, 400, { error: 'Invalid JSON body' }); }
    }

    if (!process.env.RESEND_API_KEY) {
      return sendJson(res, 500, { error: 'Missing RESEND_API_KEY env var' });
    }

    // HARD-CODED recipient to satisfy Resend trial restriction
    const toList = ['dayne.farley@gmail.com'];

    // Build a plain-text body with the CSV (no attachment)
    const subject = payload?.subject || 'Jack Attack Test';
    const csv = payload?.csv || 'col1,col2\nA,B';
    const text =
`Final score attached below as text (lite mode).
-----
${csv}
`;

    const resend = new Resend(process.env.RESEND_API_KEY);

    // IMPORTANT: keep the test sender while unverified
    const from = 'Jack Attack Scorer <onboarding@resend.dev>';

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
