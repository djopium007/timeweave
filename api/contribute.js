// POST /api/contribute  { type:'new'|'edit', name, handle?, email?, note?, website? (honeypot) }
//   -> { ok:true, id, queuePosition }
// Stores the submission in Supabase `contributions` (service-role only) and emails the editor via Resend.
// Env: SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, CONTRIBUTE_NOTIFY_EMAIL (default opi@jayasinghe.me).
import { createHash } from 'node:crypto';
import { db, json, readJsonBody, siteOrigin, FROM_EMAIL, SUPPORT_EMAIL } from './_lib.js';

const NOTIFY_TO = process.env.CONTRIBUTE_NOTIFY_EMAIL || 'opi@jayasinghe.me';
const clean = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
const cleanMulti = (v, max) => String(v == null ? '' : v).replace(/\r\n?/g, '\n').trim().slice(0, max);
const esc = (s) => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

async function sendEmail(payload) {
  if (!process.env.RESEND_API_KEY) return { skipped: 'no_api_key' };
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, ...payload }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(j).slice(0, 300)}`);
  return { sent: j.id };
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return json(res, 405, { error: 'Method not allowed' }); }
    const body = await readJsonBody(req);
    if (clean(body.website, 50)) return json(res, 200, { ok: true, id: null, queuePosition: 0 }); // honeypot: pretend success

    const type = body.type === 'edit' ? 'edit' : 'new';
    const title = clean(body.name || body.title, 160);
    const handle = clean(body.handle, 80);
    const email = clean(body.email, 200).toLowerCase();
    const note = cleanMulti(body.note, 5000);
    if (!title) return json(res, 400, { error: 'Tell us which franchise this is about.' });
    if (email && !EMAIL_RE.test(email)) return json(res, 400, { error: 'That email address doesn’t look right.' });

    const ip = ((req.headers['x-forwarded-for'] || '') + '').split(',')[0].trim();
    const ipHash = ip ? createHash('sha256').update(ip).digest('hex').slice(0, 24) : null;

    // Light rate limit: max 5 submissions per IP per hour.
    if (ipHash) {
      const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count } = await db().from('contributions').select('id', { count: 'exact', head: true }).eq('ip_hash', ipHash).gte('created_at', since);
      if ((count || 0) >= 5) return json(res, 429, { error: 'Too many submissions — please try again in an hour.' });
    }

    const { data: row, error } = await db().from('contributions')
      .insert({ type, title, handle: handle || null, email: email || null, note: note || null, ip_hash: ipHash })
      .select('id,created_at').single();
    if (error) throw error;

    const { count: pending } = await db().from('contributions').select('id', { count: 'exact', head: true }).eq('status', 'pending');
    const queuePosition = Math.max(1, pending || 1);

    const origin = siteOrigin(req);
    const label = type === 'edit' ? 'Suggested edit' : 'New franchise';
    const text = [
      `${label}: ${title}`, '',
      `From: ${handle || '(no handle)'}${email ? ` <${email}>` : ' (no email)'}`,
      `Queue position: #${queuePosition} · id ${row.id}`, '',
      note || '(no notes)', '', `— ${origin}/contribute`,
    ].join('\n');
    const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111">
<p style="margin:0 0 4px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#888">ReelOrder contribution · ${esc(label)}</p>
<h2 style="margin:0 0 14px;font-size:22px">${esc(title)}</h2>
<p style="margin:0 0 14px"><b>From:</b> ${esc(handle || '(no handle)')}${email ? ` &lt;<a href="mailto:${esc(email)}">${esc(email)}</a>&gt;` : ' (no email)'}<br><b>Queue:</b> #${queuePosition} &middot; <span style="color:#888">${esc(row.id)}</span></p>
<pre style="white-space:pre-wrap;font-family:inherit;background:#f4f5f7;border-radius:8px;padding:14px;margin:0 0 14px">${esc(note || '(no notes)')}</pre>
<p style="margin:0;color:#888;font-size:13px">Sent from ${esc(origin)}/contribute${email ? ' — reply to this email to answer the contributor.' : ''}</p></div>`;

    let notify;
    try {
      notify = await sendEmail({
        to: [NOTIFY_TO], reply_to: email || SUPPORT_EMAIL,
        subject: `[ReelOrder] ${label}: ${title}${handle ? ` — from ${handle}` : ''}`,
        text, html, headers: { 'X-Entity-Ref-ID': row.id },
      });
      await db().from('contributions').update({ notified_at: new Date().toISOString() }).eq('id', row.id);
    } catch (e) {
      console.error('contribute notify failed', e);
      await db().from('contributions').update({ notify_error: String(e.message || e).slice(0, 300) }).eq('id', row.id);
    }

    // Acknowledge the contributor (best effort, only when they left an email).
    if (email) {
      sendEmail({
        to: [email], reply_to: SUPPORT_EMAIL,
        subject: `Got it — your ${title} ${type === 'edit' ? 'edit' : 'map'} is in the ReelOrder review queue`,
        text: `Thanks${handle ? ` ${handle}` : ''}! Your ${label.toLowerCase()} for "${title}" is in the review queue at #${queuePosition}. Reviews usually take a few days; we'll reply here if we need anything.\n\n${origin}`,
        html: `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111"><p>Thanks${esc(handle ? ` ${handle}` : '')}!</p><p>Your ${esc(label.toLowerCase())} for <b>${esc(title)}</b> is in the ReelOrder review queue at <b>#${queuePosition}</b>. Reviews usually take a few days; we'll reply to this email if we need anything.</p><p style="color:#888;font-size:13px"><a href="${esc(origin)}" style="color:#888">reelorder.com</a></p></div>`,
      }).catch(e => console.error('contribute ack failed', e));
    }

    return json(res, 200, { ok: true, id: row.id, queuePosition, notified: !!(notify && notify.sent) });
  } catch (e) {
    console.error('contribute error', e);
    return json(res, 500, { error: e.message || 'Could not submit right now' });
  }
}
