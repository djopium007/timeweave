// POST /api/checkout  { posterId }   -> { url }
// GET  /api/checkout?poster=<id>     -> 303 redirect straight to Stripe Checkout
import { stripe, db, previewUrl, siteOrigin, json, readJsonBody } from './_lib.js';

export default async function handler(req, res) {
  try {
    let posterId;
    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      posterId = body.posterId || body.poster;
    } else if (req.method === 'GET') {
      posterId = (req.query && (req.query.poster || req.query.posterId)) || new URL(req.url, 'http://x').searchParams.get('poster');
    } else {
      res.setHeader('Allow', 'GET, POST');
      return json(res, 405, { error: 'Method not allowed' });
    }
    posterId = String(posterId || '').trim().toLowerCase();
    if (!/^[a-z0-9-]{1,64}$/.test(posterId)) return json(res, 400, { error: 'Missing or invalid posterId' });

    const { data: poster, error } = await db()
      .from('posters')
      .select('id,title,tagline,size_label,file_label,price_cents,currency,preview_path,active,master_path')
      .eq('id', posterId)
      .single();
    if (error || !poster || !poster.active) return json(res, 404, { error: 'Poster not found' });
    if (!poster.master_path) return json(res, 409, { error: 'This poster is not available for download yet' });

    const origin = siteOrigin(req);
    const img = previewUrl(poster.preview_path);
    const session = await stripe().checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        quantity: 1,
        price_data: {
          currency: poster.currency || 'aud',
          unit_amount: poster.price_cents,
          product_data: {
            name: `${poster.title} — Timeline Poster (digital)`,
            description: `${poster.size_label} · ${poster.file_label}`,
            images: img ? [img] : [],
            metadata: { poster_id: poster.id },
          },
        },
      }],
      metadata: { poster_id: poster.id },
      payment_intent_data: { metadata: { poster_id: poster.id } },
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      customer_creation: 'if_required',
      invoice_creation: { enabled: true },
      success_url: `${origin}/posters/thanks?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/posters/${poster.id}`,
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
