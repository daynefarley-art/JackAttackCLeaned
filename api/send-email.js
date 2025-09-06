// api/send-email.js (ESM, verbose errors)
import { Resend } from 'resend';

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

    // Validate env + inputs
    if (!process.env.RESEND_API_KEY) {
      return res.status(500).json({ error: 'Missing RESEND_API_KEY env var' });
    }
    const { to, subject, csv, filename = 'jackattack_scores.csv', text } = payload || {};
    if (!to || !csv) {
      return res.status(400).json({ error: 'Missing "to" or "csv"' });
    }

    const resend = new Resend(process.env.RESEND_API_KEY);

    // Attach CSV as base64
    const base64 = Buffer.from(csv, 'utf8').toString('base64');
    const result = await resend.emails.send({
      from: 'Jack Attack Scorer <onboarding@resend.dev>',
      to,
      subject: subject || 'Jack Attack final score',
      text: text || 'Final score attached as CSV.',
      attachments: [{ filename, content: base64 }],
    });

    if (result?.error) {
      console.error('Resend error:', result.error);
      return res.status(502).json({ error: result.error.message || 'Resend send failed' });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('send-email crash:', e);
    return res.status(500).json({ error: e?.message || 'Unexpected error' });
  }
}
