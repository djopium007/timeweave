// POST /api/hit  { p: "/path", r: "https://referrer" }
// First-party page-view beacon for the admin Traffic tab. Stores no IP and no cookie:
// the visitor id is an HMAC of ip + user-agent + UTC day, so it rotates every day and cannot be
// reversed. Geo comes from Vercel's edge headers. Obvious bots are dropped before insert.
import { createHmac } from 'node:crypto';
import { db, json, readJsonBody, safeError } from './_lib.js';

const BOT_RE = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|whatsapp|telegram|discord|curl|wget|python-requests|go-http-client|okhttp|java\//i;
const MAX_PATH = 200;

function device(ua) {
  if (/ipad|tablet|kindle|silk|playbook/i.test(ua)) return 'tablet';
  if (/mobi|iphone|android.*mobile|windows phone|opera mini/i.test(ua)) return 'mobile';
  if (/android/i.test(ua)) return 'tablet';
  return 'desktop';
}
function browser(ua) {
  if (/edg\//i.test(ua)) return 'Edge';
  if (/opr\/|opera/i.test(ua)) return 'Opera';
  if (/samsungbrowser/i.test(ua)) return 'Samsung';
  if (/brave/i.test(ua)) return 'Brave';
  if (/firefox|fxios/i.test(ua)) return 'Firefox';
  if (/chrome|crios/i.test(ua)) return 'Chrome';
  if (/safari/i.test(ua)) return 'Safari';
  return 'Other';
}
function cleanPath(p) {
  p = String(p || '').split('?')[0].split('#')[0].trim();
  if (!p.startsWith('/') || p.length > MAX_PATH || /[^\w\-./]/.test(p)) return null;
  return p.replace(/\/+$/, '') || '/';
}
function refHost(r) {
  try { const u = new URL(String(r || '')); return u.hostname.replace(/^www\./, '').slice(0, 100); } catch { return null; }
}
function done(res) { res.statusCode = 204; res.setHeader('Cache-Control', 'no-store'); res.end(); }
async function body(req) {
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  return readJsonBody(req);
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return json(res, 405, { error: 'Method not allowed' }); }
    const ua = String(req.headers['user-agent'] || '').slice(0, 300);
    if (!ua || BOT_RE.test(ua)) return done(res);
    const b = await body(req);
    const path = cleanPath(b.p);
    if (!path) return done(res);
    const ref = refHost(b.r);
    const self = /(^|\.)reelorder\.com$/i.test(ref || '') || /vercel\.app$/i.test(ref || '');
    const ip = ((req.headers['x-forwarded-for'] || '') + '').split(',')[0].trim();
    const salt = process.env.IP_HASH_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || 'reelorder-local';
    const day = new Date().toISOString().slice(0, 10);
    const visitor_hash = createHmac('sha256', salt).update(ip + '|' + ua + '|' + day).digest('hex').slice(0, 24);
    const dec = (v) => { try { return v ? decodeURIComponent(String(v)).slice(0, 80) : null; } catch { return null; } };
    const row = {
      path,
      referrer_host: self ? null : ref,
      country: String(req.headers['x-vercel-ip-country'] || '').slice(0, 2).toUpperCase() || null,
      region: dec(req.headers['x-vercel-ip-country-region']),
      city: dec(req.headers['x-vercel-ip-city']),
      device: device(ua),
      browser: browser(ua),
      visitor_hash,
    };
    const { error } = await db().from('page_views').insert(row);
    if (error) throw error;
    return done(res);
  } catch (e) {
    return safeError(res, e, 'Could not record view');
  }
}
