// POST /api/checkout  { posterId, style? }        -> { url }
// GET  /api/checkout?poster=<id>&style=<vN|bundle> -> 303 redirect straight to Stripe Checkout
// style = 'bundle' buys every style of the poster: price_cents + bundle_step_cents × (styles − 1).
// Prices are passed inline (price_data), so nothing needs to be pre-created in the Stripe dashboard.
import { stripe, db, previewUrl, siteOrigin, json, readJsonBody, resolveStyle, safeError } from './_lib.js';

export default async function handler(req, res) {
  try {
    let posterId, styleKey;
    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      posterId = body.posterId || body.poster; styleKey = body.style;
    } else if (req.method === 'GET') {
      const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
      posterId = q.poster || q.posterId; styleKey = q.style;
    } else {
      res.setHeader('Allow', 'GET, POST');
      return json(res, 405, { error: 'Method not allowed' });
    }
    posterId = String(posterId || '').trim().toLowerCase();
    if (!/^[a-z0-9-]{1,64}$/.test(posterId)) return json(res, 400, { error: 'Missing or invalid posterId' });

    const { data: poster, error } = await db()
      .from('posters')
      .select('id,title,tagline,size_label,file_label,price_cents,currency,preview_path,active,master_path,styles,bundle_step_cents,bundle_enabled')
      .eq('id', posterId)
      .single();
    if (error || !poster || !poster.active) return json(res, 404, { error: 'Poster not found' });
    // Resolve the style: explicit key, 'bundle' for all styles, else the first style, else the row's own default paths.
    const r = resolveStyle(poster, styleKey);
    if (!r.ok) return json(res, r.status, { error: r.error });
    const { style, isBundle, styles } = r;
    const styleLabel = r.label ? ` · ${r.label}` : '';
    const meta = { poster_id: poster.id, style_key: r.key };

    const origin = siteOrigin(req);
    const img = previewUrl(style ? style.preview_path : (styles[0] && styles[0].preview_path) || poster.preview_path);
    const description = isBundle
      ? `Digital download only — no physical poster is posted. ${styles.length} poster packs (${styles.map(s => s.label).join(', ')}) · ${poster.size_label} · ${poster.file_label}`
      : `Digital download only — no physical poster is posted. ${poster.size_label} · ${poster.file_label}`;
    const session = await stripe().checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        quantity: 1,
        price_data: {
          currency: poster.currency || 'usd',
          unit_amount: r.priceCents,
          product_data: {
            name: `${poster.title} — Timeline Poster · DIGITAL FILE, nothing shipped${styleLabel}`,
            description,
            images: img ? [img] : [],
            metadata: meta,
          },
        },
      }],
      metadata: meta,
      payment_intent_data: { metadata: meta },
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      customer_creation: 'if_required',
      invoice_creation: { enabled: true },
      success_url: `${origin}/posters/thanks?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/posters/${poster.id}${r.key ? '?style=' + r.key : ''}`,
      custom_text: {
        submit: { message: isBundle ? `Digital download — all ${styles.length} print-ready files are unlocked instantly after payment.` : 'Digital download — your print-ready file is unlocked instantly after payment.' },
      },
    });

    if (req.method === 'GET') {
      res.statusCode = 303;
      res.setHeader('Location', session.url);
      res.setHeader('Cache-Control', 'no-store');
      return res.end();
    }
    return json(res, 200, { url: session.url, id: session.id });
  } catch (e) {
    return safeError(res, e, 'Checkout failed');
  }
}
