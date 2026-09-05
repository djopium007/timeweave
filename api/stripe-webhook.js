// POST /api/stripe-webhook — Stripe -> order records in Supabase.
// Configure in Stripe Dashboard: endpoint https://reelorder.com/api/stripe-webhook,
// events: checkout.session.completed, checkout.session.async_payment_succeeded, charge.refunded
import { stripe, db, json, readRawBody, recordOrder } from './_lib.js';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return json(res, 405, { error: 'Method not allowed' }); }
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return json(res, 500, { error: 'STRIPE_WEBHOOK_SECRET is not set' });

  let event;
  try {
    const raw = await readRawBody(req);
    event = stripe().webhooks.constructEvent(raw, req.headers['stripe-signature'], secret);
  } catch (e) {
    console.error('webhook signature failed', e.message);
    return json(res, 400, { error: `Webhook signature verification failed: ${e.message}` });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object;
        if (session.payment_status === 'paid') await recordOrder(session);
        break;
      }
      case 'checkout.session.async_payment_failed': {
        const session = event.data.object;
        await db().from('poster_orders').update({ status: 'failed' }).eq('stripe_session_id', session.id);
        break;
      }
      case 'charge.refunded': {
        const charge = event.data.object;
        if (charge.payment_intent) {
          await db().from('poster_orders').update({ status: 'refunded' }).eq('stripe_payment_intent', charge.payment_intent);
        }
        break;
      }
      default:
        break;
    }
    return json(res, 200, { received: true });
  } catch (e) {
    console.error('webhook handler error', e);
    return json(res, 500, { error: e.message });
  }
}
