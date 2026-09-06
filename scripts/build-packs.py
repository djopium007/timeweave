#!/usr/bin/env python3
"""
Build the ReelOrder poster-store upload folder from Opi's pCloud source tree.

  python3 scripts/build-packs.py [--budget SECONDS] [--only slug,slug]

Reads
  <pCloud>/www.opij.io/Customer Files/Movie Canvas/<Franchise> x/...   (7200x10800 masters, v1..vN)
  <pCloud>/www.opij.io/Mock Ups - Movie /<Franchise> x/[vN/]MOCKUPS/    (6 lifestyle shots per style)
Writes (idempotent — skips anything already built)
  <Movie Timelines>/posters-upload/catalog.json
  <Movie Timelines>/posters-upload/<slug>/<style>/preview.jpg          1200px tall, public
  <Movie Timelines>/posters-upload/<slug>/<style>/mockup-N.jpg          1600px wide, public
  <Movie Timelines>/posters-upload/<slug>/<style>/<slug>-<style>-poster-pack.zip   private (sold file)
Then upload with:  SUPABASE_SERVICE_ROLE_KEY=... node scripts/sync-posters.mjs --prebuilt ../posters-upload
"""
import os, re, sys, json, time, io, zipfile
from PIL import Image
Image.MAX_IMAGE_PIXELS = None

HOME = os.path.expanduser('~')
def first_existing(*paths):
    for p in paths:
        if os.path.isdir(p): return p
    raise SystemExit('missing: ' + ' | '.join(paths))
PCLOUD = first_existing(os.path.join(HOME, 'mnt', 'pCloud Drive', 'www.opij.io'), os.path.join(HOME, 'pCloud Drive', 'www.opij.io'))
PROJECT = first_existing(os.path.join(HOME, 'mnt', 'Movie Timelines'), os.path.join(HOME, 'Documents', 'Claude', 'Projects', 'Movie Timelines'))
SRC = os.path.join(PCLOUD, 'Customer Files', 'Movie Canvas')
MOCK = os.path.join(PCLOUD, 'Mock Ups - Movie ')
OUT = os.path.join(PROJECT, 'posters-upload')
GUIDE = os.path.join(PROJECT, 'site', 'assets', 'ReelOrder-Printing-Guide.pdf')

args = sys.argv[1:]
BUDGET = time.time() + (float(args[args.index('--budget') + 1]) if '--budget' in args else 1e12)
ONLY = args[args.index('--only') + 1].split(',') if '--only' in args else None

TITLES = {  # folder stem -> (slug, title, franchise_id in the hub, accent)
  'Aliens - The Collection':            ('aliens',             'Aliens',              'alien',      '#2FD08A'),
  'Back To The Future Trilogy':         ('back-to-the-future', 'Back to the Future',  'bttf',       '#F5A623'),
  'Die Hard - The Collection_Poster':   ('die-hard',           'Die Hard',            None,         '#FFB000'),
  'Fast & Furious - Collection':        ('fast-furious',       'Fast & Furious',      None,         '#54DBFF'),
  'Indiana Jones - The Collection':     ('indiana-jones',      'Indiana Jones',       None,         '#D9A066'),
  'John Wick - The Collection':         ('john-wick',          'John Wick',           None,         '#B69CFF'),
  'Lethal Weapon':                      ('lethal-weapon',      'Lethal Weapon',       None,         '#FF6B35'),
  'Mission Impossible - The Collection':('mission-impossible', 'Mission: Impossible', None,         '#FF4D4D'),
  'Police Academy - The Collection':    ('police-academy',     'Police Academy',      None,         '#3B82F6'),
  'Rambo - The Collection':             ('rambo',              'Rambo',               None,         '#C0392B'),
  'Road House - The Collection_Poster': ('road-house',         'Road House',          None,         '#E67E22'),
  'Terminator - The Collection':        ('terminator',         'Terminator',          'terminator', '#FF2A1F'),
  'The Matrix - The Collection':        ('the-matrix',         'The Matrix',          None,         '#3DDC84'),
}

# print ratios (w:h) -> max px at 300 dpi
RATIOS = [
  ('1 - 24x36in (2x3)',  2, 3,      (7200, 10800), '24x36in'),
  ('2 - A-series (ISO)', 1, 1.4142, (7016, 9933),  'A1'),
  ('3 - 4x3 ratio',      3, 4,      (5400, 7200),  '18x24in'),
  ('4 - 5x7 ratio',      5, 7,      (5906, 8268),  '50x70cm'),
]
WALL = (1290, 2796)
MAX_MASTER_BYTES = 24 * 1048576   # keep every pack comfortably under Supabase's 50 MB per-object limit

def ver_of(path):
    m = re.search(r'_v(\d)', os.path.basename(path)) or re.search(r'/v(\d)/', path)
    return int(m.group(1)) if m else 1

def find_masters(stem):
    d = os.path.join(SRC, stem + ' x'); out = {}
    for dp, _, fn in os.walk(d):
        for f in fn:
            fl = f.lower(); p = os.path.join(dp, f)
            if not fl.endswith('.jpg') or 'border' in fl or '150x50' in p.lower(): continue
            if '24x36' not in f and '24x36' not in dp: continue
            out[ver_of(p)] = p
    return out

def find_mockups(stem, ver, nstyles):
    d = os.path.join(MOCK, stem + ' x'); found = []
    for allow_border in (False, True):          # prefer borderless shots; fall back to the border set
        for dp, _, fn in os.walk(d):
            if os.path.basename(dp).lower() not in ('mockups',): continue
            for f in sorted(fn):
                fl = f.lower(); p = os.path.join(dp, f)
                if not re.search(r'\.(jpe?g|png|webp)$', fl) or (('border' in fl) != allow_border): continue
                v = ver_of(p)
                if nstyles > 1 and v != ver: continue
                if nstyles == 1 and v != 1 and re.search(r'_v\d', fl): continue
                found.append(p)
        if found: break
    # numbered order "… - 1.jpg"; de-dupe same shot in two formats
    def key(p):
        m = re.search(r'(\d+)\.(jpe?g|png|webp)$', p.lower()); return int(m.group(1)) if m else 99
    seen, out = set(), []
    for p in sorted(found, key=key):
        k = key(p)
        if k in seen: continue
        seen.add(k); out.append(p)
    return out[:6]

def crop_ratio(im, rw, rh, maxpx):
    W, H = im.size; t = rw / rh
    cw, ch = W, round(W / t)
    if ch > H: ch, cw = H, round(H * t)
    l, tp = (W - cw) // 2, (H - ch) // 2
    c = im.crop((l, tp, l + cw, tp + ch))
    w = min(maxpx[0], cw); h = round(w / t)
    return c.resize((w, h), Image.LANCZOS)

def jpeg_bytes(im, q=92, subsampling=0):
    b = io.BytesIO(); im.save(b, 'JPEG', quality=q, subsampling=subsampling, optimize=True); return b.getvalue()

def build_style(slug, title, ver, master_path, mockups, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    tag = f'v{ver}'
    zip_path = os.path.join(out_dir, f'{slug}-{tag}-poster-pack.zip')
    prev_path = os.path.join(out_dir, 'preview.jpg')
    need_zip, need_prev = not os.path.exists(zip_path), not os.path.exists(prev_path)
    if need_zip or need_prev:
        im = Image.open(master_path).convert('RGB')
        if im.size != (7200, 10800): print(f'   !! {slug} {tag} is {im.size}, expected 7200x10800')
        if need_prev:
            p = im.copy(); p.thumbnail((1200, 1200)); p.save(prev_path, 'JPEG', quality=82, optimize=True)
        if need_zip:
            safe = re.sub(r'[\\/:*?"<>|]+', '', title); root = f'ReelOrder - {safe} - Timeline Poster ({tag})'
            tmp = zip_path + '.part'
            with zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
                for folder, rw, rh, maxpx, note in RATIOS:
                    if (rw, rh) == (2, 3):
                        data = open(master_path, 'rb').read()
                        # Supabase free tier caps a single upload at 50 MB; a q100 master alone can be 30-37 MB.
                        if len(data) > MAX_MASTER_BYTES: data = jpeg_bytes(im, 93, 0); print(f'   master re-encoded to {len(data)/1048576:.1f} MB (was over {MAX_MASTER_BYTES//1048576} MB)')
                    else:
                        data = jpeg_bytes(crop_ratio(im, rw, rh, maxpx))
                    z.writestr(f'{root}/{folder}/{safe} - {note} - 300dpi.jpg', data)
                    print(f'   pack {folder}: {len(data)/1048576:.1f} MB', flush=True)
                W, H = im.size; cw = round(H * WALL[0] / WALL[1]); l = (W - cw) // 2
                wp = im.crop((l, 0, l + cw, H)).resize(WALL, Image.LANCZOS)
                z.writestr(f'{root}/BONUS - Phone wallpaper/{safe} - phone wallpaper.jpg', jpeg_bytes(wp, 88, 2))
                if os.path.exists(GUIDE): z.write(GUIDE, f'{root}/READ ME FIRST - Printing Guide.pdf')
                else: print('   !! printing guide PDF missing')
                z.writestr(f'{root}/README.txt', f'Thanks for buying the {title} timeline poster ({tag}) from ReelOrder.\n\nOpen "READ ME FIRST - Printing Guide.pdf" to pick the right file for your frame.\nLost this pack? Your Stripe receipt email has a link that always issues a fresh download.\n\nreelorder.com/posters\n')
            os.replace(tmp, zip_path)
        im.close()
    # mockups
    mock_files = []
    for i, mp in enumerate(mockups, 1):
        dst = os.path.join(out_dir, f'mockup-{i}.jpg'); mock_files.append(os.path.basename(dst))
        if os.path.exists(dst): continue
        m = Image.open(mp).convert('RGB')
        if m.size[0] > 1600: m = m.resize((1600, round(m.size[1] * 1600 / m.size[0])), Image.LANCZOS)
        m.save(dst, 'JPEG', quality=82, optimize=True)
    return dict(key=tag, label=f'Style {ver}', preview='preview.jpg', mockups=mock_files,
                pack=os.path.basename(zip_path), pack_bytes=os.path.getsize(zip_path))

def main():
    os.makedirs(OUT, exist_ok=True)
    cat_path = os.path.join(OUT, 'catalog.json')
    catalog = json.load(open(cat_path)) if os.path.exists(cat_path) else {}
    pending = 0; order = 0
    for stem, (slug, title, fid, accent) in TITLES.items():
        order += 10
        if ONLY and slug not in ONLY: continue
        masters = find_masters(stem)
        if not masters: print(f'!! no masters for {stem}'); continue
        entry = catalog.setdefault(slug, dict(id=slug, title=title, franchise_id=fid, accent=accent, sort_order=order, styles=[]))
        entry.update(title=title, franchise_id=fid, accent=accent)
        done_keys = {s['key'] for s in entry['styles'] if s.get('mockups')}   # styles with no mockups get another look
        entry['styles'] = [s for s in entry['styles'] if s['key'] in done_keys]
        for ver in sorted(masters):
            if f'v{ver}' in done_keys: continue
            if time.time() > BUDGET: pending += 1; continue
            print(f'▸ {title} v{ver}', flush=True)
            mocks = find_mockups(stem, ver, len(masters))
            if len(mocks) < 6: print(f'   note: {len(mocks)} mockups found')
            style = build_style(slug, title, ver, masters[ver], mocks, os.path.join(OUT, slug, f'v{ver}'))
            entry['styles'].append(style); entry['styles'].sort(key=lambda s: s['key'])
            json.dump(catalog, open(cat_path, 'w'), indent=1)
    json.dump(catalog, open(cat_path, 'w'), indent=1)
    built = sum(len(e['styles']) for e in catalog.values())
    print(f'\nstyles built: {built}   pending: {pending}   → {cat_path}')
    if pending: print('Re-run to continue.')

if __name__ == '__main__': main()
