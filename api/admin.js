// POST /api/admin  { action, ...params }   Authorization: Bearer <supabase access token>
// Every call verifies the caller's Supabase JWT and requires a row in public.admins.
// Actions:
//   me                                    -> { admin:true, userId }
//   inbox.list   { status?, limit? }      -> { items }   (contributions + contact messages)
//   inbox.status { id, status }           -> { ok }      status: pending|reviewing|accepted|rejected
//   inbox.delete { id }                   -> { ok }
//   comments.list { q?, hidden?, limit? } -> { items }   (all timelines, newest first, with author + banned flag)
//   comments.hide / comments.unhide / comments.delete { id }
//   users.ban { userId, reason? } / users.unban { userId }
//   orders.list { limit? }                -> { items }
import { db, json, readJsonBody } from './_lib.js';

const STATUSES = ['pending', 'reviewing', 'accepted', 'rejected'];
const lim = (v, d = 100, max = 500) => Math.min(max, Math.max(1, parseInt(v, 10) || d));
const uuid = (v) => /^[0-9a-f-]{36}$/i.test(String(v || '')) ? String(v) : null;

async function requireAdmin(req) {
  const auth = String(req.headers.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return { error: 'Sign in required', status: 401 };
  const { data, error } = await db().auth.getUser(token);
  if (error || !data || !data.user) return { error: 'Session expired — sign in again', status: 401 };
  const { data: row } = await db().from('admins').select('user_id').eq('user_id', data.user.id).maybeSingle();
  if (!row) return { error: 'Not an admin', status: 403 };
  return { user: data.user };
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return json(res, 405, { error: 'Method not allowed' }); }
    const who = await requireAdmin(req);
    if (who.error) return json(res, who.status, { error: who.error, admin: false });
    const body = await readJsonBody(req);
    const action = String(body.action || '');
    const sb = db();

    switch (action) {
      case 'me':
        return json(res, 200, { admin: true, userId: who.user.id, email: who.user.email || null });

      // ---------------- inbox ----------------
      case 'inbox.list': {
        let q = sb.from('contributions').select('id,type,title,handle,email,note,topic,status,notified_at,notify_error,created_at')
          .order('created_at', { ascending: false }).limit(lim(body.limit, 200));
        if (body.status && STATUSES.includes(body.status)) q = q.eq('status', body.status);
        const { data, error } = await q; if (error) throw error;
        return json(res, 200, { items: data || [] });
      }
      case 'inbox.status': {
        const id = uuid(body.id); if (!id || !STATUSES.includes(body.status)) return json(res, 400, { error: 'Bad id/status' });
        const { error } = await sb.from('contributions').update({ status: body.status }).eq('id', id); if (error) throw error;
        return json(res, 200, { ok: true });
      }
      case 'inbox.delete': {
        const id = uuid(body.id); if (!id) return json(res, 400, { error: 'Bad id' });
        const { error } = await sb.from('contributions').delete().eq('id', id); if (error) throw error;
        return json(res, 200, { ok: true });
      }

      // ---------------- comments ----------------
      case 'comments.list': {
        let q = sb.from('comments').select('id,context_key,user_id,name,handle,body,hidden,hidden_at,created_at')
          .order('created_at', { ascending: false }).limit(lim(body.limit, 150));
        if (body.hidden === true) q = q.eq('hidden', true);
        if (body.hidden === false) q = q.eq('hidden', false);
        const text = String(body.q || '').trim();
        if (text) q = q.or(`body.ilike.%${text.replace(/[%,()]/g, ' ')}%,name.ilike.%${text.replace(/[%,()]/g, ' ')}%,handle.ilike.%${text.replace(/[%,()]/g, ' ')}%`);
        const { data, error } = await q; if (error) throw error;
        const ids = [...new Set((data || []).map(c => c.user_id).filter(Boolean))];
        const banned = new Set();
        if (ids.length) { const { data: b } = await sb.from('banned_users').select('user_id').in('user_id', ids); (b || []).forEach(x => banned.add(x.user_id)); }
        return json(res, 200, { items: (data || []).map(c => ({ ...c, banned: banned.has(c.user_id) })) });
      }
      case 'comments.hide':
      case 'comments.unhide': {
        const id = body.id; if (id == null) return json(res, 400, { error: 'Bad id' });
        const hidden = action === 'comments.hide';
        const { error } = await sb.from('comments').update({ hidden, hidden_at: hidden ? new Date().toISOString() : null }).eq('id', id); if (error) throw error;
        return json(res, 200, { ok: true, hidden });
      }
      case 'comments.delete': {
        const id = body.id; if (id == null) return json(res, 400, { error: 'Bad id' });
        await sb.from('comment_likes').delete().eq('comment_id', id);
        const { error } = await sb.from('comments').delete().eq('id', id); if (error) throw error;
        return json(res, 200, { ok: true });
      }

      // ---------------- users ----------------
      case 'users.ban': {
        const userId = uuid(body.userId); if (!userId) return json(res, 400, { error: 'Bad userId' });
        if (userId === who.user.id) return json(res, 400, { error: 'You cannot ban yourself' });
        const { error } = await sb.from('banned_users').upsert({ user_id: userId, reason: String(body.reason || '').slice(0, 300) || null }); if (error) throw error;
        if (body.hideAll) await sb.from('comments').update({ hidden: true, hidden_at: new Date().toISOString() }).eq('user_id', userId).eq('hidden', false);
        return json(res, 200, { ok: true });
      }
      case 'users.unban': {
        const userId = uuid(body.userId); if (!userId) return json(res, 400, { error: 'Bad userId' });
        const { error } = await sb.from('banned_users').delete().eq('user_id', userId); if (error) throw error;
        return json(res, 200, { ok: true });
      }

      // ---------------- orders ----------------
      case 'orders.list': {
        const { data, error } = await sb.from('poster_orders')
          .select('id,stripe_session_id,stripe_payment_intent,email,poster_id,style_key,amount_cents,currency,status,download_count,last_download_at,email_sent_at,email_error,created_at')
          .order('created_at', { ascending: false }).limit(lim(body.limit, 200)); if (error) throw error;
        const { data: posters } = await sb.from('posters').select('id,title');
        const titles = Object.fromEntries((posters || []).map(p => [p.id, p.title]));
        return json(res, 200, { items: (data || []).map(o => ({ ...o, poster_title: titles[o.poster_id] || o.poster_id })) });
      }

      default:
        return json(res, 400, { error: `Unknown action: ${action}` });
    }
  } catch (e) {
    console.error('admin error', e);
    return json(res, 500, { error: e.message || 'Admin request failed' });
  }
}
