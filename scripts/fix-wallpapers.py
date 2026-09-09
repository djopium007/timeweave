#!/usr/bin/env python3
"""
Rewrite the BONUS phone wallpaper inside packs that were already built.

The original build centre-cropped the 2:3 poster into the 1290x2796 phone frame, which
threw away ~31% of the width - the title and cast text were sliced off. This regenerates
the wallpaper with posterlib.wallpaper() (whole poster, letterboxed on black, accent frame)
and rewrites each zip in place. The master is read back out of the pack, so pCloud is not
needed. Idempotent: a style is marked wallpaper: "fit-v2" in catalog.json once done.

  python3 scripts/fix-wallpapers.py [--budget SECONDS] [--only slug,slug] [--dry]

After a full pass, re-upload:
  SUPABASE_SERVICE_ROLE_KEY=... node scripts/sync-posters.mjs --prebuilt ../posters-upload
"""
import os, sys, io, json, time, zipfile
from PIL import Image
from posterlib import wallpaper
Image.MAX_IMAGE_PIXELS = None

HOME = os.path.expanduser('~')
def first_existing(*paths):
    for p in paths:
        if os.path.isdir(p): return p
    raise SystemExit('missing: ' + ' | '.join(paths))
PROJECT = first_existing(os.path.join(HOME, 'mnt', 'Movie Timelines'),
                         os.path.join(HOME, 'Documents', 'Claude', 'Projects', 'Movie Timelines'))
OUT = os.path.join(PROJECT, 'posters-upload')
CAT = os.path.join(OUT, 'catalog.json')

args = sys.argv[1:]
BUDGET = time.time() + (float(args[args.index('--budget') + 1]) if '--budget' in args else 1e12)
ONLY = args[args.index('--only') + 1].split(',') if '--only' in args else None
DRY = '--dry' in args

def fix_zip(path, accent):
    with zipfile.ZipFile(path) as z:
        names = z.namelist()
        master = next(n for n in names if '24x36in - 300dpi.jpg' in n)
        wall = next(n for n in names if 'phone wallpaper.jpg' in n)
        im = Image.open(io.BytesIO(z.read(master))).convert('RGB')
        buf = io.BytesIO(); wallpaper(im, accent).save(buf, 'JPEG', quality=88, subsampling=2, optimize=True)
        im.close(); new_wall = buf.getvalue()
        if DRY: return None, len(new_wall)
        tmp = path + '.part'
        with zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as out:
            for info in z.infolist():
                out.writestr(info, new_wall if info.filename == wall else z.read(info))
    os.replace(tmp, path)
    return os.path.getsize(path), len(new_wall)

def main():
    catalog = json.load(open(CAT))
    done = pending = 0
    for slug, entry in catalog.items():
        if ONLY and slug not in ONLY: continue
        accent = entry.get('accent') or '#FFFFFF'
        for st in entry.get('styles', []):
            if st.get('wallpaper') == 'fit-v2': continue
            zp = os.path.join(OUT, slug, st['key'], st['pack'])
            if not os.path.exists(zp): print(f'!! missing {zp}'); continue
            if time.time() > BUDGET: pending += 1; continue
            t = time.time(); size, wb = fix_zip(zp, accent)
            print(f'{slug} {st["key"]}: wallpaper {wb/1024:.0f} KB, pack {(size or 0)/1048576:.1f} MB, {time.time()-t:.0f}s', flush=True)
            if not DRY:
                st['wallpaper'] = 'fit-v2'; st['pack_bytes'] = size
                json.dump(catalog, open(CAT, 'w'), indent=1)
            done += 1
    print(f'\nfixed: {done}   pending: {pending}')
    if pending: print('Re-run to continue.')

if __name__ == '__main__': main()
