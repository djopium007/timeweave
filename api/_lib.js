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

export function siteOrigin(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, '');
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
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

/** Record (or refresh) an order row from a Checkout Session. Idempotent on session id. */
export async function recordOrder(session) {
  const posterId = session.metadata && session.metadata.poster_id;
  const row = {
    stripe_session_id: session.id,
    stripe_payment_intent: typeof session.payment_intent === 'string' ? session.payment_intent : (session.payment_intent && session.payment_intent.id) || null,
    email: (session.customer_details && session.customer_details.email) || session.customer_email || null,
    poster_id: posterId || null,
    amount_cents: session.amount_total,
    currency: session.currency,
    status: session.payment_status === 'paid' ? 'paid' : session.payment_status,
  };
  const { error } = await db().from('poster_orders').upsert(row, { onConflict: 'stripe_session_id', ignoreDuplicates: false });
  if (error) throw error;
  return row;
}
