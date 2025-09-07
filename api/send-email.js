// api/send-email.js (ESM, resilient + full error surface)
import { Resend } from 'resend';

function sendJson(res, status, body) {
  res.status(status);
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}
function dumpErr(e) {
  try { return JSON.parse(JSON.stringify(e, Object.getOwnPropertyNames(e))); }
  catch { return { message: String(e) }; }
}
function pickMsg(err) {
  if (!err) return 'Unknown error';
  if (typeof err === 'string') return err;
  if (err.message) return err.message;
  if (err.error?.message) return err.error.message;
  if (Array.isArray(err.errors) && err.errors[0]?.message) return err.errors[0].message;
  if (err.name) return `${err.name}`;
  return 'Unspecified error';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    // Read raw JSON body
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

    // Make 'to' an array (Resend accepts both, but array is safest)
    const toList = Array.isArray(to) ? to : [to];

    // Attach CSV with explicit contentType
    const base64 = Buffer.from(csv, 'utf8').toString('base64');
    const attachments = [{
      filename,
      content: base64,
      contentType: 'text/csv'
    }];

    // Keep the permitted test sender unless you verified a domain
    const from = 'Jack Attack Scorer <onboarding@resend.dev>';

    // Resend v3 returns { data, error } OR throws; handle both
    let data, error;
    try {
      ({ data, error } = await resend.emails.send({
        from,
        to: toList,
        subject: subject || 'Jack Attack final score',
        text: text || 'Final score attached as CSV.',
        attachments
      }));
    } catch (thrown) {
      return sendJson(res, 502, { error: pickMsg(thrown), details: dumpErr(thrown) });
    }

    if (error) {
      return sendJson(res, 502, { error: pickMsg(error), details: dumpErr(error) });
    }

    return sendJson(res, 200, { ok: true, id: data?.id || null });
  } catch (e) {
    return sendJson(res, 500, { error: pickMsg(e), details: dumpErr(e) });
  }
}
