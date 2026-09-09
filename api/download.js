// GET /api/download?session_id=cs_...                   -> { ok, title, email, url, files:[{key,label,url,filename}], expiresIn }
// GET /api/download?session_id=cs_...&redirect=1[&style=vN] -> 302 to a short-lived signed URL for one master file
//
// The only thing that unlocks a master file is a Stripe Checkout Session whose payment_status is 'paid'.
// The session id is the buyer's receipt: it lives in the success URL and in their Stripe email.
// A bundle purchase (metadata.style_key = 'bundle') returns one signed URL per style in `files`;
// `url` is always the first file so older clients keep working.
import { stripe, db, json, recordOrder, maybeSendOrderEmail, resolveStyle, MASTER_BUCKET, safeError } from './_lib.js';

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
      .from('posters').select('id,title,master_path,size_label,file_label,styles,price_cents,bundle_step_cents,bundle_enabled').eq('id', posterId).single();
    if (error || !poster) return json(res, 404, { error: 'Poster not found' });
    const styleKey = (session.metadata && session.metadata.style_key) || '';
    // Never let a bundle that was later disabled lock a paying customer out: resolve with the row as-is,
    // but if the bundle flag is off, still honour it for a session that already paid for it.
    const r = resolveStyle({ ...poster, bundle_enabled: true }, styleKey);
    if (!r.ok) return json(res, r.status === 400 ? 404 : r.status, { error: 'Poster file not found' });

    // Make sure an order row exists even if the webhook was late/missed, then count the download.
    const order = await recordOrder(session);
    // Stripe keeps payment_status='paid' after a refund, so the refund state lives in our own row.
    if (order.status === 'refunded' || order.status === 'revoked') {
      return json(res, 403, { error: 'This order was refunded — the download is no longer available.' });
    }
    await maybeSendOrderEmail(session, req);   // no-op if the webhook already sent it
    await db().rpc('bump_poster_download', { p_session_id: session.id }).then(() => {}, () => {});

    const multi = r.masters.length > 1;
    const files = [];
    for (const m of r.masters) {
      const ext = (m.master_path.split('.').pop() || 'zip').toLowerCase();
      const label = multi || r.label ? ` (${m.label || r.label})` : '';
      const filename = `ReelOrder - ${poster.title}${label} - Timeline Poster Pack.${ext}`.replace(/[\\/:*?"<>|]+/g, '');
      const { data: signed, error: sErr } = await db().storage
        .from(MASTER_BUCKET)
        .createSignedUrl(m.master_path, SIGNED_TTL_SECONDS, { download: filename });
      if (sErr || !signed) throw sErr || new Error('Could not sign URL');
      files.push({ key: m.key, label: m.label || '', url: signed.signedUrl, filename });
    }

    if (q.redirect) {
      const want = String(q.style || '').toLowerCase();
      const pick = files.find(f => f.key === want) || files[0];
      res.statusCode = 302;
      res.setHeader('Location', pick.url);
      res.setHeader('Cache-Control', 'no-store');
      return res.end();
    }
    const titleSuffix = r.label ? ` (${r.label})` : '';
    return json(res, 200, {
      ok: true,
      posterId: poster.id,
      title: poster.title + titleSuffix,
      posterTitle: poster.title,
      styleKey: r.key || null,
      isBundle: r.isBundle,
      sizeLabel: poster.size_label,
      fileLabel: poster.file_label,
      email: (session.customer_details && session.customer_details.email) || null,
      url: files[0].url,
      files,
      expiresIn: SIGNED_TTL_SECONDS,
    });
  } catch (e) {
    if (e && e.statusCode === 404) return json(res, 404, { error: 'Unknown checkout session' });
    return safeError(res, e, 'Download failed');
  }
}
