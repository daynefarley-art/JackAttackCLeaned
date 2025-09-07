// api/send-email.js (ESM, returns full error details)
import { Resend } from 'resend';

function sendJson(res, status, body) {
  res.status(status);
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}
function dumpError(err) {
  try {
    return JSON.parse(JSON.stringify(err, Object.getOwnPropertyNames(err)));
  } catch {
    return { message: String(err) };
  }
}
function pickMsg(err) {
  if (!err) return 'Unknown error';
  if (typeof err === 'string') return err;
  if (err.message) return err.message;
  if (err.error?.message) return err.error.message;
  if (Array.isArray(err.errors) && err.errors[0]?.message) return err.errors[0].message;
  return 'Unspecified error';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
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

    const { to, subject, csv, filename = 'jackattack_scores.csv', text } = payload || {};
    if (!to || !csv) {
      return sendJson(res, 400, { error: 'Missing "to" or "csv"' });
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const base64 = Buffer.from(csv, 'utf8').toString('base64');

    const { data, error } = await resend.emails.send({
      from: 'Jack Attack Scorer <onboarding@resend.dev>',
      to,
      subject: subject || 'Jack Attack final score',
      text: text || 'Final score attached as CSV.',
      attachments: [{ filename, content: base64 }]
    });

    if (error) {
      return sendJson(res, 502, { error: pickMsg(error), details: dumpError(error) });
    }

    return sendJson(res, 200, { ok: true, id: data?.id || null });
  } catch (e) {
    return sendJson(res, 500, { error: pickMsg(e), details: dumpError(e) });
  }
}
