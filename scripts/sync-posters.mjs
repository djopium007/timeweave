#!/usr/bin/env node
// Sync poster source folders -> Supabase Storage + `posters` table.
//
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/sync-posters.mjs "/path/to/Movie Mock ups" [--only aliens,rambo] [--dry]
//
// Expected layout (one folder per poster, as exported from your design tool):
//   <Title> - The Collection x/
//     MOCKUPS/                       -> lifestyle mockups (jpg/png)
//     <Title> - The Collection_24x36.jpg          -> MASTER (private bucket, sold file)
//     <Title> - The Collection_24x36_border.jpg   -> ignored (variant not sold)
//     Wall Art - ....jpg                          -> ignored
//     ... 150x50/                                 -> ignored
//
// What it does per folder:
//   1. uploads the master to  poster-masters/<slug>/<slug>-24x36.jpg   (private)
//   2. makes a 1200px preview + 1600px mockups -> poster-previews/<slug>/...   (public)
//   3. upserts a row in public.posters (keeps existing price/tagline/description if already set)
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fqcdslarscuplbdimgzs.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) { console.error('Set SUPABASE_SERVICE_ROLE_KEY (Supabase dashboard → Project Settings → API).'); process.exit(1); }

const args = process.argv.slice(2);
const root = args.find(a => !a.startsWith('--'));
if (!root || !fs.existsSync(root)) { console.error('Usage: node scripts/sync-posters.mjs "/path/to/Movie Mock ups" [--only a,b] [--dry]'); process.exit(1); }
const DRY = args.includes('--dry');
const onlyArg = args[args.indexOf('--only') + 1];
const ONLY = args.includes('--only') && onlyArg ? onlyArg.split(',').map(s => s.trim()) : null;

const db = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } });

// Map poster slug -> hub franchise id (so the poster page can link to the timeline map)
const FRANCHISE_LINK = {
  'aliens': 'alien', 'alien': 'alien',
  'terminator': 'terminator',
  'back-to-the-future': 'bttf',
};
const ACCENTS = {
  'aliens': '#2FD08A', 'terminator': '#FF2A1F', 'back-to-the-future': '#F5A623', 'the-matrix': '#3DDC84',
  'john-wick': '#B69CFF', 'die-hard': '#FFB000', 'indiana-jones': '#D9A066', 'mission-impossible': '#FF4D4D',
  'fast-furious': '#54DBFF', 'rambo': '#C0392B', 'road-house': '#E67E22', 'police-academy': '#3B82F6',
};

function cleanTitle(folder) {
  return folder
    .replace(/\s+x$/i, '')
    .replace(/_Poster$/i, '')
    .replace(/\s*-\s*(The\s+)?Collection$/i, '')
    .replace(/\s+Trilogy$/i, '')
    .trim();
}
function slugify(s) {
  return s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/^the-matrix$/, 'the-matrix');
}
function pickMaster(files) {
  const jpgs = files.filter(f => /\.(jpe?g|png|tiff?)$/i.test(f));
  const plain = jpgs.filter(f => /_24x36\.(jpe?g|png|tiff?)$/i.test(f) && !/border/i.test(f) && !/^Wall Art/i.test(f));
  if (plain.length) return plain[0];
  const any24 = jpgs.filter(f => /24x36/i.test(f) && !/border/i.test(f));
  return any24[0] || null;
}

async function upload(bucket, objPath, buffer, contentType) {
  if (DRY) { console.log(`   [dry] upload ${bucket}/${objPath} (${(buffer.length / 1024).toFixed(0)} KB)`); return; }
  const { error } = await db.storage.from(bucket).upload(objPath, buffer, { contentType, upsert: true, cacheControl: '31536000' });
  if (error) throw new Error(`${bucket}/${objPath}: ${error.message}`);
}

const folders = fs.readdirSync(root, { withFileTypes: true }).filter(d => d.isDirectory() && !d.name.startsWith('.')).map(d => d.name);
let order = 10;
const report = [];
for (const folder of folders) {
  const title = cleanTitle(folder);
  const slug = slugify(title);
  order += 10;
  if (ONLY && !ONLY.includes(slug)) continue;
  const dir = path.join(root, folder);
  const files = fs.readdirSync(dir).filter(f => !f.startsWith('.'));
  const masterFile = pickMaster(files);
  if (!masterFile) { console.warn(`!! ${folder}: no *_24x36 master found — skipped`); continue; }
  console.log(`\n▸ ${title}  (${slug})`);

  // 1. master
  const masterBuf = fs.readFileSync(path.join(dir, masterFile));
  const masterMeta = await sharp(masterBuf).metadata();
  const ext = path.extname(masterFile).toLowerCase().replace('jpeg', 'jpg');
  const masterPath = `${slug}/${slug}-24x36${ext}`;
  console.log(`   master: ${masterFile} ${masterMeta.width}×${masterMeta.height}`);
  await upload('poster-masters', masterPath, masterBuf, ext === '.png' ? 'image/png' : 'image/jpeg');

  // 2. preview (web-size, not print-usable)
  const previewBuf = await sharp(masterBuf).resize({ height: 1200, withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
  const previewPath = `${slug}/preview.jpg`;
  await upload('poster-previews', previewPath, previewBuf, 'image/jpeg');

  // 3. mockups
  const mockDir = files.find(f => /^mock ?ups?$/i.test(f));
  const mockupPaths = [];
  if (mockDir) {
    const mocks = fs.readdirSync(path.join(dir, mockDir)).filter(f => /\.(jpe?g|png|webp)$/i.test(f) && !f.startsWith('.')).sort();
    // de-dupe when both .jpg and .png of the same shot exist
    const seen = new Set();
    for (const m of mocks) {
      const base = m.replace(/\.(jpe?g|png|webp)$/i, '');
      if (seen.has(base)) continue; seen.add(base);
      const n = mockupPaths.length + 1;
      const buf = await sharp(path.join(dir, mockDir, m)).resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
      const p = `${slug}/mockup-${n}.jpg`;
      await upload('poster-previews', p, buf, 'image/jpeg');
      mockupPaths.push(p);
    }
    console.log(`   mockups: ${mockupPaths.length}`);
  }

  // 4. row
  const row = {
    id: slug, title, accent: ACCENTS[slug] || '#FF2A1F',
    franchise_id: FRANCHISE_LINK[slug] || null,
    preview_path: previewPath, mockup_paths: mockupPaths, master_path: masterPath,
    sort_order: order, active: true, updated_at: new Date().toISOString(),
  };
  if (!DRY) {
    const { data: existing } = await db.from('posters').select('id,price_cents,tagline,description,sort_order').eq('id', slug).maybeSingle();
    if (existing) { row.sort_order = existing.sort_order; } // don't reshuffle a curated order
    const { error } = await db.from('posters').upsert(row, { onConflict: 'id' });
    if (error) throw new Error(`posters upsert ${slug}: ${error.message}`);
  }
  report.push({ slug, title, master: `${masterMeta.width}×${masterMeta.height}`, mockups: mockupPaths.length });
}

console.log('\nDone.');
console.table(report);
console.log('\nNext: set tagline / description / price_cents per poster in Supabase → Table editor → posters (defaults: AUD 19.00).');
