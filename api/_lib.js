// Shared helpers for the ReelOrder poster store API routes (Vercel Node functions).
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fqcdslarscuplbdimgzs.supabase.co';
export const PREVIEW_BUCKET = 'poster-previews';
export const MASTER_BUCKET = 'poster-masters';

let _stripe, _db;

export function stripe() {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is not set');
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
  }
  return _stripe;
}

export function db() {
  if (!_db) {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
    _db = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  }
  return _db;
}

export function previewUrl(path) {
  return path ? `${SUPABASE_URL}/storage/v1/object/public/${PREVIEW_BUCKET}/${path}` : null;
}

// Host allow-list. The Host / X-Forwarded-Host headers are attacker-controlled, and this origin
// ends up in Stripe success_url and in the download link we email to buyers — an unchecked value
// there is a phishing primitive. Anything unrecognised falls back to the canonical domain.
export const CANONICAL_ORIGIN = 'https://reelorder.com';
const ALLOWED_HOSTS = new Set(['reelorder.com', 'www.reelorder.com']);
const PREVIEW_HOST = /^[a-z0-9][a-z0-9-]*(\.[a-z0-9-]+)*\.vercel\.app$/;

export function siteOrigin(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, '');
  const host = String((req && req.headers && (req.headers['x-forwarded-host'] || req.headers.host)) || '')
    .split(',')[0].trim().toLowerCase();
  if (ALLOWED_HOSTS.has(host)) return `https://${host}`;
  if (PREVIEW_HOST.test(host)) return `https://${host}`;
  return CANONICAL_ORIGIN;
}

/** Log the real error, return a generic one. Internal messages must not reach the client. */
export function safeError(res, e, fallback = 'Something went wrong', status = 500) {
  console.error(fallback, e);
  return json(res, status, { error: fallback });
}

export function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const raw = await readRawBody(req);
  if (!raw.length) return {};
  try { return JSON.parse(raw.toString('utf8')); } catch { return {}; }
}

// ---------------------------------------------------------------------------------------------
// Style / bundle resolution. A poster row carries `styles` (jsonb array of {key,label,preview_path,
// master_path,...}). The buyer picks one style key, or BUNDLE_KEY for every style at once.
// Bundle price = price_cents + bundle_step_cents × (styles − 1).
export const BUNDLE_KEY = 'bundle';

/**
 * @returns {{ ok:true, styles:Array, style:object|null, isBundle:boolean, key:string, label:string,
 *             priceCents:number, masters:Array<{key,label,master_path}> } | { ok:false, status:number, error:string }}
 */
export function resolveStyle(poster, styleKey) {
  const styles = Array.isArray(poster.styles) ? poster.styles : [];
  const key = String(styleKey || '').trim().toLowerCase();
  const base = Number(poster.price_cents) || 0;
  if (key === BUNDLE_KEY) {
    if (styles.length < 2 || poster.bundle_enabled === false) return { ok: false, status: 400, error: 'This poster has no bundle option' };
    const step = Number.isFinite(Number(poster.bundle_step_cents)) ? Number(poster.bundle_step_cents) : 300;
    const masters = styles.filter(s => s.master_path).map(s => ({ key: s.key, label: s.label, master_path: s.master_path }));
    if (masters.length !== styles.length) return { ok: false, status: 409, error: 'Some styles in this bundle are not available yet' };
    return { ok: true, styles, style: null, isBundle: true, key: BUNDLE_KEY, label: `All ${styles.length} styles bundle`,
      priceCents: base + step * (styles.length - 1), masters };
  }
  let style = null;
  if (key) {
    style = styles.find(x => x.key === key) || null;
    if (!style) return { ok: false, status: 400, error: 'Unknown style for this poster' };
  } else if (styles.length) style = styles[0];
  const masterPath = style ? style.master_path : poster.master_path;
  if (!masterPath) return { ok: false, status: 409, error: 'This poster is not available for download yet' };
  return { ok: true, styles, style, isBundle: false, key: style ? style.key : '',
    label: style && styles.length > 1 ? style.label : '', priceCents: base,
    masters: [{ key: style ? style.key : 'default', label: style ? style.label : '', master_path: masterPath }] };
}

/** Record (or refresh) an order row from a Checkout Session. Idempotent on session id. */
export async function recordOrder(session) {
  const posterId = session.metadata && session.metadata.poster_id;
  // A refund lives only in our own row (the Checkout Session stays payment_status='paid' forever),
  // so never let a later write downgrade 'refunded' back to 'paid'.
  const { data: existing } = await db().from('poster_orders').select('status').eq('stripe_session_id', session.id).maybeSingle();
  const locked = existing && (existing.status === 'refunded' || existing.status === 'revoked');
  const row = {
    stripe_session_id: session.id,
    stripe_payment_intent: typeof session.payment_intent === 'string' ? session.payment_intent : (session.payment_intent && session.payment_intent.id) || null,
    email: (session.customer_details && session.customer_details.email) || session.customer_email || null,
    poster_id: posterId || null,
    style_key: (session.metadata && session.metadata.style_key) || null,
    amount_cents: session.amount_total,
    currency: session.currency,
    status: locked ? existing.status : (session.payment_status === 'paid' ? 'paid' : session.payment_status),
  };
  const { error } = await db().from('poster_orders').upsert(row, { onConflict: 'stripe_session_id', ignoreDuplicates: false });
  if (error) throw error;
  return row;
}

// ---------------------------------------------------------------------------------------------
// Order confirmation email (Resend). Sent once per session, from the webhook (or from the
// download API as a fallback if the webhook was late). Requires RESEND_API_KEY.
export const FROM_EMAIL = process.env.ORDER_EMAIL_FROM || 'ReelOrder <orders@reelorder.com>';
export const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'orders@reelorder.com';

function esc(s) { return String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

export function orderEmailHtml({ title, styleLabel, downloadUrl, guideUrl, amountLabel, bundleCount }) {
  const t = esc(title), st = styleLabel ? ` <span style="color:#9DB0C4">· ${esc(styleLabel)}</span>` : '';
  const packLine = bundleCount > 1
    ? `Your bundle has <b style="color:#E9EDF3">${bundleCount} poster packs</b> — one per style — and the download page lists each ZIP separately. Every pack has the poster in four print ratios at 300&nbsp;dpi plus a bonus phone wallpaper.`
    : 'Your pack has the poster in four print ratios at 300&nbsp;dpi plus a bonus phone wallpaper.';
  return `<!doctype html><html><body style="margin:0;background:#0a0c10;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#E9EDF3">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0c10"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">
<tr><td style="padding:0 0 22px;font-size:20px;font-weight:700;letter-spacing:.04em;text-transform:uppercase">Reel<span style="color:#FF5747">Order</span></td></tr>
<tr><td style="background:#12151b;border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:28px">
  <div style="font-family:Menlo,Consolas,monospace;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#3DDC84;margin-bottom:8px">Payment received</div>
  <h1 style="margin:0 0 10px;font-size:26px;line-height:1.15;color:#fff">Your ${t} poster is ready${st}</h1>
  <p style="margin:0 0 22px;color:#A9B4C2;font-size:15px;line-height:1.6">Thanks for your order${amountLabel ? ` (${esc(amountLabel)})` : ''}. This is a <b style="color:#E9EDF3">digital file</b> — nothing is posted to you. ${packLine}</p>
  <a href="${downloadUrl}" style="display:inline-block;background:#ffffff;color:#0a0c10;text-decoration:none;font-weight:700;font-size:15px;letter-spacing:.04em;text-transform:uppercase;padding:14px 24px;border-radius:10px">&#8595;&nbsp; Download your poster pack${bundleCount > 1 ? 's' : ''}</a>
  <p style="margin:18px 0 0;color:#8b97a6;font-size:13px;line-height:1.7">This page issues a fresh download link every time you open it, so keep this email — it's your permanent way back to the file.<br>Not sure which file to print? <a href="${guideUrl}" style="color:#9FE8FF">Read the printing guide</a> (it's also inside the ZIP).</p>
</td></tr>
<tr><td style="padding:22px 4px 0;color:#6b7686;font-size:12px;line-height:1.7;font-family:Menlo,Consolas,monospace">Personal-use licence: print as many copies as you like; please don't resell or share the file.<br>Questions? Reply to this email.<br><a href="https://reelorder.com/posters" style="color:#9DB0C4">reelorder.com/posters</a></td></tr>
</table></td></tr></table></body></html>`;
}

/** Send the confirmation email for a paid Checkout Session, once. Never throws. */
export async function maybeSendOrderEmail(session, req) {
  try {
    if (!process.env.RESEND_API_KEY) { console.warn('RESEND_API_KEY not set — order email skipped'); return { skipped: 'no_api_key' }; }
    const to = (session.customer_details && session.customer_details.email) || session.customer_email;
    if (!to) return { skipped: 'no_email' };
    const { data: order } = await db().from('poster_orders').select('id,email_sent_at,poster_id,style_key').eq('stripe_session_id', session.id).maybeSingle();
    if (!order) return { skipped: 'no_order_row' };
    if (order.email_sent_at) return { skipped: 'already_sent' };
    const { data: poster } = await db().from('posters').select('title,styles').eq('id', order.poster_id).maybeSingle();
    const styles = poster && Array.isArray(poster.styles) ? poster.styles : [];
    const isBundle = order.style_key === BUNDLE_KEY;
    const style = !isBundle && order.style_key ? styles.find(x => x.key === order.style_key) : null;
    const styleLabel = isBundle ? `All ${styles.length} styles bundle` : (style && styles.length > 1 ? style.label : '');
    const origin = siteOrigin(req);
    const title = (poster && poster.title) || 'Timeline';
    const amountLabel = session.amount_total != null && session.currency ? `${(session.currency || '').toUpperCase()} ${(session.amount_total / 100).toFixed(2)}` : '';
    const html = orderEmailHtml({
      title, styleLabel,
      downloadUrl: `${origin}/posters/thanks?session_id=${encodeURIComponent(session.id)}`,
      guideUrl: `${origin}/print-guide.html`, amountLabel, bundleCount: isBundle ? styles.length : 1,
    });
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM_EMAIL, to: [to], reply_to: SUPPORT_EMAIL,
        subject: `Your ${title} poster${isBundle ? ' bundle' : ''} is ready — download inside`,
        html,
        text: `Thanks for your ReelOrder order. Your ${title} poster pack${isBundle ? `s (${styles.length} styles, digital files, nothing is posted) are` : ' (digital file, nothing is posted) is'} ready.\n\nDownload: ${origin}/posters/thanks?session_id=${session.id}\nPrinting guide: ${origin}/print-guide.html\n\nKeep this email — the link above always issues a fresh download.`,
        headers: { 'X-Entity-Ref-ID': session.id },
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      await db().from('poster_orders').update({ email_error: `${r.status} ${JSON.stringify(j).slice(0, 300)}` }).eq('id', order.id);
      console.error('resend error', r.status, j);
      return { error: r.status };
    }
    await db().from('poster_orders').update({ email_sent_at: new Date().toISOString(), email_error: null }).eq('id', order.id);
    return { sent: j.id };
  } catch (e) {
    console.error('order email failed', e);
    return { error: e.message };
  }
}
