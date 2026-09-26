#!/usr/bin/env node
// One-off (2026-09-26): push the repaired John Wick v1 artwork to Supabase.
// The original v1 master in pCloud is corrupt below ~38%; the repaired master was rebuilt from the
// intact "_border" export (white margin repainted to the borderless #020202 margin - pixel-identical
// to the borderless file everywhere it is intact).
// Uploads to NEW object paths (-r2) because the old ones are cached for a year, then repoints the DB row.
//   cd site && SUPABASE_SERVICE_ROLE_KEY='...' node scripts/fix-john-wick-v1.mjs
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) { console.error("Set SUPABASE_SERVICE_ROLE_KEY='...' (quote it)"); process.exit(1); }
const db = createClient('https://fqcdslarscuplbdimgzs.supabase.co', KEY, { auth: { persistSession: false } });
const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'posters-upload', 'john-wick', 'v1');
const prev = fs.readFileSync(path.join(DIR, 'preview.jpg'));
const zip = fs.readFileSync(path.join(DIR, 'john-wick-v1-poster-pack.zip'));
const NEW_PREV = 'john-wick/v1/preview-r2.jpg', NEW_ZIP = 'john-wick/v1/john-wick-v1-poster-pack-r2.zip';
async function up(bucket, p, buf, type) {
  const { error } = await db.storage.from(bucket).upload(p, buf, { contentType: type, upsert: true, cacheControl: '31536000' });
  if (error) throw new Error(`${bucket}/${p}: ${error.message}`); console.log('  uploaded', bucket + '/' + p, (buf.length / 1048576).toFixed(1) + ' MB');
}
await up('poster-previews', NEW_PREV, prev, 'image/jpeg');
await up('poster-previews', 'john-wick/v1/preview.jpg', prev, 'image/jpeg');          // old path too, in case anything still points at it
await up('poster-masters', NEW_ZIP, zip, 'application/zip');
await up('poster-masters', 'john-wick/v1/john-wick-v1-poster-pack.zip', zip, 'application/zip');
const { data: row, error: e1 } = await db.from('posters').select('styles').eq('id', 'john-wick').single();
if (e1) throw e1;
const styles = row.styles.map(s => s.key === 'v1' ? { ...s, preview_path: NEW_PREV, master_path: NEW_ZIP } : s);
const { error: e2 } = await db.from('posters').update({ styles, preview_path: NEW_PREV, master_path: NEW_ZIP, updated_at: new Date().toISOString() }).eq('id', 'john-wick');
if (e2) throw e2;
console.log('Done - john-wick v1 now points at', NEW_PREV, '+', NEW_ZIP);
