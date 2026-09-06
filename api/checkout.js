// POST /api/checkout  { posterId }   -> { url }
// GET  /api/checkout?poster=<id>     -> 303 redirect straight to Stripe Checkout
import { stripe, db, previewUrl, siteOrigin, json, readJsonBody } from './_lib.js';

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
      .select('id,title,tagline,size_label,file_label,price_cents,currency,preview_path,active,master_path,styles')
      .eq('id', posterId)
      .single();
    if (error || !poster || !poster.active) return json(res, 404, { error: 'Poster not found' });
    // Resolve the style: explicit key, else the first style, else the row's own default paths.
    const styles = Array.isArray(poster.styles) ? poster.styles : [];
    let style = null;
    if (styleKey) {
      style = styles.find(x => x.key === String(styleKey).toLowerCase()) || null;
      if (!style) return json(res, 400, { error: 'Unknown style for this poster' });
    } else if (styles.length) style = styles[0];
    const masterPath = style ? style.master_path : poster.master_path;
    if (!masterPath) return json(res, 409, { error: 'This poster is not available for download yet' });
    const styleLabel = style && styles.length > 1 ? ` · ${style.label}` : '';

    const origin = siteOrigin(req);
    const img = previewUrl(style ? style.preview_path : poster.preview_path);
    const session = await stripe().checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        quantity: 1,
        price_data: {
          currency: poster.currency || 'usd',
          unit_amount: poster.price_cents,
          product_data: {
            name: `${poster.title} — Timeline Poster · DIGITAL FILE, nothing shipped${styleLabel}`,
            description: `Digital download only — no physical poster is posted. ${poster.size_label} · ${poster.file_label}`,
            images: img ? [img] : [],
            metadata: { poster_id: poster.id, style_key: style ? style.key : '' },
          },
        },
      }],
      metadata: { poster_id: poster.id, style_key: style ? style.key : '' },
      payment_intent_data: { metadata: { poster_id: poster.id, style_key: style ? style.key : '' } },
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      customer_creation: 'if_required',
      invoice_creation: { enabled: true },
      success_url: `${origin}/posters/thanks?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/posters/${poster.id}${style ? '?style=' + style.key : ''}`,
      custom_text: {
        submit: { message: 'Digital download — your print-ready file is unlocked instantly after payment.' },
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
    console.error('checkout error', e);
    return json(res, 500, { error: e.message || 'Checkout failed' });
  }
}
