// api/send-email.js (ESM, clear error messages)
import { Resend } from 'resend';

function errToString(e) {
  if (!e) return 'Unknown error';
  if (typeof e === 'string') return e;
  if (e.message) return e.message;
  try { return JSON.stringify(e); } catch { return String(e); }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Read raw body (Vercel Node functions don't auto-parse)
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
    if (!to || !csv) return res.status(400).json({ error: 'Missing "to" or "csv"' });

    const resend = new Resend(process.env.RESEND_API_KEY);

    const base64 = Buffer.from(csv, 'utf8').toString('base64');

    // Resend v3 returns { data, error }
    const { data, error } = await resend.emails.send({
      from: 'Jack Attack Scorer <onboarding@resend.dev>',
      to,
      subject: subject || 'Jack Attack final score',
      text: text || 'Final score attached as CSV.',
      attachments: [{ filename, content: base64 }]
    });

    if (error) {
      return res.status(502).json({ error: errToString(error) });
    }

    return res.status(200).json({ ok: true, id: data?.id || null });
  } catch (e) {
    return res.status(500).json({ error: errToString(e) });
  }
}
