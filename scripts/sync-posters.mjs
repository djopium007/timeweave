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
//   1. builds the buyer's ZIP pack: 2:3 master + A-series, 3:4 and 5:7 crops (300 dpi), bonus phone
//      wallpaper, and assets/ReelOrder-Printing-Guide.pdf  -> poster-masters/<slug>/<slug>-poster-pack.zip (private)
//   2. makes a 1200px preview + 1600px mockups -> poster-previews/<slug>/...   (public)
//   3. upserts a row in public.posters (keeps existing price/tagline/description/sort_order if already set)
//   --no-zip  uploads just the 24x36 master instead of the pack (fast path)
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import archiver from 'archiver';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fqcdslarscuplbdimgzs.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) { console.error('Set SUPABASE_SERVICE_ROLE_KEY (Supabase dashboard → Project Settings → API).'); process.exit(1); }

const args = process.argv.slice(2);
const root = args.find(a => !a.startsWith('--'));
if (!root || !fs.existsSync(root)) { console.error('Usage: node scripts/sync-posters.mjs "/path/to/Movie Mock ups" [--only a,b] [--dry] [--no-zip] [--out ./packs]'); process.exit(1); }
const DRY = args.includes('--dry');
const NO_ZIP = args.includes('--no-zip');
const OUT_DIR = args.includes('--out') ? args[args.indexOf('--out') + 1] : null; // also save each pack zip locally
const HERE = path.dirname(fileURLToPath(import.meta.url));
const GUIDE_PDF = path.join(HERE, '..', 'assets', 'ReelOrder-Printing-Guide.pdf');
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


// ---- pack builder -------------------------------------------------------------------------
// Each ratio is a centre crop of the 2:3 master (top/bottom trimmed), resampled to the largest
// common print size at 300 dpi. Ratios are width:height.
const RATIOS = [
  { folder: '1 - 24x36in (2x3)',  w: 2,   h: 3,     px: [7200, 10800], note: '24x36in' },
  { folder: '2 - A-series (ISO)', w: 1,   h: 1.4142, px: [7016, 9933],  note: 'A1' },
  { folder: '3 - 4x3 ratio',      w: 3,   h: 4,     px: [5400, 7200],  note: '18x24in' },
  { folder: '4 - 5x7 ratio',      w: 5,   h: 7,     px: [5906, 8268],  note: '50x70cm' },
];
const WALLPAPER = { folder: 'BONUS - Phone wallpaper', px: [1290, 2796], note: 'phone' };

async function cropTo(masterBuf, meta, ratioW, ratioH, outW, outH) {
  // centre-crop master to ratio, then resize (never enlarge beyond master)
  const target = ratioW / ratioH;
  let cw = meta.width, ch = Math.round(meta.width / target);
  if (ch > meta.height) { ch = meta.height; cw = Math.round(meta.height * target); }
  const left = Math.round((meta.width - cw) / 2), top = Math.round((meta.height - ch) / 2);
  const w = Math.min(outW, cw), h = Math.round(w / target);
  return sharp(masterBuf).extract({ left, top, width: cw, height: ch }).resize({ width: w, height: h, fit: 'fill' })
    .jpeg({ quality: 92, chromaSubsampling: '4:4:4', mozjpeg: true }).toBuffer();
}

async function buildPack(slug, title, masterBuf, masterMeta) {
  const safe = title.replace(/[\\/:*?"<>|]+/g, '');
  const rootDir = `ReelOrder - ${safe} - Timeline Poster`;
  const archive = archiver('zip', { zlib: { level: 6 } });
  const chunks = [];
  archive.on('data', c => chunks.push(c));
  const done = new Promise((res, rej) => { archive.on('end', res); archive.on('error', rej); });

  for (const r of RATIOS) {
    const buf = (r.w === 2 && r.h === 3) ? masterBuf : await cropTo(masterBuf, masterMeta, r.w, r.h, r.px[0], r.px[1]);
    archive.append(buf, { name: `${rootDir}/${r.folder}/${safe} - ${r.note} - 300dpi.jpg` });
    console.log(`   pack: ${r.folder}  (${(buf.length / 1048576).toFixed(1)} MB)`);
  }
  // wallpaper: 9:19.5 crop, biased toward the top third of the poster where the title sits
  {
    const target = WALLPAPER.px[0] / WALLPAPER.px[1];
    const ch = masterMeta.height, cw = Math.round(ch * target);
    const left = Math.round((masterMeta.width - cw) / 2);
    const buf = await sharp(masterBuf).extract({ left, top: 0, width: cw, height: ch })
      .resize({ width: WALLPAPER.px[0], height: WALLPAPER.px[1], fit: 'cover' }).jpeg({ quality: 88 }).toBuffer();
    archive.append(buf, { name: `${rootDir}/${WALLPAPER.folder}/${safe} - phone wallpaper.jpg` });
  }
  if (fs.existsSync(GUIDE_PDF)) archive.file(GUIDE_PDF, { name: `${rootDir}/READ ME FIRST - Printing Guide.pdf` });
  else console.warn('   !! assets/ReelOrder-Printing-Guide.pdf not found — pack has no guide');
  archive.append(`Thanks for buying the ${title} timeline poster from ReelOrder.\n\nOpen "READ ME FIRST - Printing Guide.pdf" to pick the right file for your frame.\nLost this pack? Your Stripe receipt email has a link that always issues a fresh download.\n\nreelorder.com/posters\n`, { name: `${rootDir}/README.txt` });
  await archive.finalize();
  await done;
  return Buffer.concat(chunks);
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
  console.log(`   master: ${masterFile} ${masterMeta.width}×${masterMeta.height}`);
  if (masterMeta.width < 7000) console.warn(`   !! master is under 7200px wide — 24x36 @300dpi wants 7200×10800`);
  let masterPath, fileLabel;
  if (NO_ZIP) {
    masterPath = `${slug}/${slug}-24x36${ext}`;
    fileLabel = 'Hi-res JPG · 24×36 in · 300 dpi · print-ready';
    await upload('poster-masters', masterPath, masterBuf, ext === '.png' ? 'image/png' : 'image/jpeg');
  } else {
    const zipBuf = await buildPack(slug, title, masterBuf, masterMeta);
    masterPath = `${slug}/${slug}-poster-pack.zip`;
    fileLabel = 'ZIP pack · 24×36 master + A-series, 4:3 & 5:7 crops · 300 dpi · bonus phone wallpaper';
    console.log(`   pack total: ${(zipBuf.length / 1048576).toFixed(1)} MB`);
    if (OUT_DIR) { fs.mkdirSync(OUT_DIR, { recursive: true }); fs.writeFileSync(path.join(OUT_DIR, `${slug}-poster-pack.zip`), zipBuf); }
    await upload('poster-masters', masterPath, zipBuf, 'application/zip');
  }

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
    preview_path: previewPath, mockup_paths: mockupPaths, master_path: masterPath, file_label: fileLabel,
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
console.log('\nNext: set tagline / description / price_cents per poster in Supabase → Table editor → posters (default: AUD 17.95).');
