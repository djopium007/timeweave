// GET /api/download?session_id=cs_...            -> { ok, title, email, url, expiresIn }
// GET /api/download?session_id=cs_...&redirect=1 -> 302 to a short-lived signed URL for the master file
//
// The only thing that unlocks a master file is a Stripe Checkout Session whose payment_status is 'paid'.
// The session id is the buyer's receipt: it lives in the success URL and in their Stripe email.
import { stripe, db, json, recordOrder, MASTER_BUCKET } from './_lib.js';

const SIGNED_TTL_SECONDS = 15 * 60;

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return json(res, 405, { error: 'Method not allowed' }); }
    const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
    const sessionId = String(q.session_id || '').trim();
    if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) return json(res, 400, { error: 'Missing or invalid session_id' });

    const session = await stripe().checkout.sessions.retrieve(sessionId);
    if (!session || session.payment_status !== 'paid') {
      return json(res, 402, { error: 'Payment not completed for this session', status: session && session.payment_status });
    }
    const posterId = session.metadata && session.metadata.poster_id;
    if (!posterId) return json(res, 409, { error: 'Session has no poster attached' });

    const { data: poster, error } = await db()
      .from('posters').select('id,title,master_path,size_label,file_label').eq('id', posterId).single();
    if (error || !poster || !poster.master_path) return json(res, 404, { error: 'Poster file not found' });

    // Make sure an order row exists even if the webhook was late/missed, then count the download.
    await recordOrder(session);
    await db().rpc('bump_poster_download', { p_session_id: session.id }).then(() => {}, () => {});

    const ext = (poster.master_path.split('.').pop() || 'jpg').toLowerCase();
    const filename = `ReelOrder - ${poster.title} - Timeline Poster 24x36.${ext}`.replace(/[\\/:*?"<>|]+/g, '');
    const { data: signed, error: sErr } = await db().storage
      .from(MASTER_BUCKET)
      .createSignedUrl(poster.master_path, SIGNED_TTL_SECONDS, { download: filename });
    if (sErr || !signed) throw sErr || new Error('Could not sign URL');

    if (q.redirect) {
      res.statusCode = 302;
      res.setHeader('Location', signed.signedUrl);
      res.setHeader('Cache-Control', 'no-store');
      return res.end();
    }
    return json(res, 200, {
      ok: true,
      posterId: poster.id,
      title: poster.title,
      sizeLabel: poster.size_label,
      fileLabel: poster.file_label,
      email: (session.customer_details && session.customer_details.email) || null,
      url: signed.signedUrl,
      expiresIn: SIGNED_TTL_SECONDS,
    });
  } catch (e) {
    console.error('download error', e);
    const code = e && e.statusCode === 404 ? 404 : 500;
    return json(res, code, { error: code === 404 ? 'Unknown checkout session' : (e.message || 'Download failed') });
  }
}
