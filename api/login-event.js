// POST /api/login-event   Authorization: Bearer <supabase access token>
// Records one sign-in for the calling user (admin Users tab → login history). Country/device
// come from the request, provider from the session's identity. Duplicate events for the same
// user inside 60 s are collapsed so a token refresh or tab focus never double-counts.
import { db, json, safeError } from './_lib.js';

function device(ua) {
  if (/ipad|tablet|kindle|silk|playbook/i.test(ua)) return 'tablet';
  if (/mobi|iphone|android.*mobile|windows phone|opera mini/i.test(ua)) return 'mobile';
  if (/android/i.test(ua)) return 'tablet';
  return 'desktop';
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return json(res, 405, { error: 'Method not allowed' }); }
    const auth = String(req.headers.authorization || '');
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (!token) return json(res, 401, { error: 'Sign in required' });
    const sb = db();
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data || !data.user) return json(res, 401, { error: 'Session expired' });
    const u = data.user;
    // Most recent identity wins; app_metadata.provider is the one used for this session on
    // fresh sign-ins, and the first identity is a fallback for old accounts.
    const provider = (u.app_metadata && u.app_metadata.provider) || ((u.identities || [])[0] || {}).provider || 'email';
    const { data: last } = await sb.from('login_events').select('created_at').eq('user_id', u.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (last && Date.now() - new Date(last.created_at).getTime() < 60 * 1000) return json(res, 200, { ok: true, deduped: true });
    const ua = String(req.headers['user-agent'] || '').slice(0, 300);
    const dec = (v) => { try { return v ? decodeURIComponent(String(v)).slice(0, 80) : null; } catch { return null; } };
    const { error: insErr } = await sb.from('login_events').insert({
      user_id: u.id,
      provider: String(provider).slice(0, 40),
      event: 'sign_in',
      country: String(req.headers['x-vercel-ip-country'] || '').slice(0, 2).toUpperCase() || null,
      region: dec(req.headers['x-vercel-ip-country-region']),
      city: dec(req.headers['x-vercel-ip-city']),
      device: device(ua),
      ua,
    });
    if (insErr) throw insErr;
    return json(res, 200, { ok: true });
  } catch (e) {
    return safeError(res, e, 'Could not record sign-in');
  }
}
