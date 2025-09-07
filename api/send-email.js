// api/send-email.js (ESM, verbose + JSON-safe errors)
import { Resend } from 'resend';

// Safely turn any error into JSON
function toJSONSafe(obj) {
  try {
    return JSON.parse(JSON.stringify(obj, Object.getOwnPropertyNames(obj)));
  } catch {
    return { message: String(obj) };
  }
}
// Best-guess human message
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
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Read raw JSON body (Vercel Node func doesn't auto-parse)
    let raw = '';
    for await (const chunk of req) raw += chunk;

    let payload = {};
    if (raw) {
      try { payload = JSON.parse(raw); }
      catch { return res.status(400).json({ error: 'Invalid JSON body' }); }
    }

    if (!process.env.RESEND_API_KEY) {
      return res.status(500).json({ error: 'Missing RESEND_API_KEY env var' });
    }

    const { to, subject, csv, filename = 'jackattack_scores.csv', text } = payload || {};
    if (!to || !csv) {
      return res.status(400).json({ error: 'Missing "to" or "csv"' });
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
      const details = toJSONSafe(error);
      return res.status(502).json({
        error: pickMsg(error),
        name: details.name || undefined,
        code: details.code || undefined,
        details
      });
    }

    return res.status(200).json({ ok: true, id: data?.id || null });
  } catch (e) {
    const details = toJSONSafe(e);
    return res.status(500).json({ error: pickMsg(e), details });
  }
}
