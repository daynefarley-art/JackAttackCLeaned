// api/send-email.js (ESM, DIAGNOSTIC MODE — returns full plain-text details)
import { Resend } from 'resend';

function dump(obj) {
  try { return JSON.stringify(obj, Object.getOwnPropertyNames(obj)); }
  catch { return String(obj); }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).type('text/plain').send('Method not allowed (POST only)');
  }

  try {
    // Read raw JSON body
    let raw = '';
    for await (const chunk of req) raw += chunk;

    let payload = {};
    if (raw) {
      try { payload = JSON.parse(raw); }
      catch { return res.status(400).type('text/plain').send(`Invalid JSON body:\n${raw}`); }
    }

    if (!process.env.RESEND_API_KEY) {
      return res.status(500).type('text/plain').send('Missing RESEND_API_KEY env var');
    }

    const { to, subject = 'Jack Attack Test', csv, filename = 'test.csv', text = 'CSV attached' } = payload || {};
    if (!to || !csv) {
      return res.status(400).type('text/plain').send(`Missing "to" or "csv". Payload was:\n${dump(payload)}`);
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const base64 = Buffer.from(csv, 'utf8').toString('base64');

    const result = await resend.emails.send({
      from: 'Jack Attack Scorer <onboarding@resend.dev>',
      to,
      subject,
      text,
      attachments: [{ filename, content: base64 }]
    });

    // result is { data, error }
    if (result?.error) {
      return res.status(502).type('text/plain').send(`Resend error:\n${dump(result.error)}`);
    }

    return res.status(200).type('text/plain').send(`OK\n${dump(result)}`);
  } catch (e) {
    return res.status(500).type('text/plain').send(`Crash:\n${dump(e)}`);
  }
}
