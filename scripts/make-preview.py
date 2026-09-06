#!/usr/bin/env python3
"""Build a self-contained HTML preview of the poster store from ../posters-upload (images inlined as data URIs)."""
import os, json, io, base64, html
from PIL import Image
HOME = os.path.expanduser('~')
PROJECT = next(p for p in [os.path.join(HOME,'mnt','Movie Timelines'), os.path.join(HOME,'Documents','Claude','Projects','Movie Timelines')] if os.path.isdir(p))
UP = os.path.join(PROJECT, 'posters-upload'); OUT = os.path.join(PROJECT, 'posters-work', 'store-preview.html')
cat = json.load(open(os.path.join(UP, 'catalog.json')))

def b64(path, maxw=None, maxh=None, q=72):
    im = Image.open(path).convert('RGB')
    if maxw and im.size[0] > maxw: im = im.resize((maxw, round(im.size[1]*maxw/im.size[0])), Image.LANCZOS)
    if maxh and im.size[1] > maxh: im = im.resize((round(im.size[0]*maxh/im.size[1]), maxh), Image.LANCZOS)
    b = io.BytesIO(); im.save(b, 'JPEG', quality=q, optimize=True, progressive=True)
    return 'data:image/jpeg;base64,' + base64.b64encode(b.getvalue()).decode()

data = []
for slug, e in sorted(cat.items(), key=lambda kv: kv[1]['sort_order']):
    styles = []
    for i, st in enumerate(e['styles']):
        d = os.path.join(UP, slug, st['key'])
        styles.append(dict(key=st['key'], label=st['label'], preview=b64(os.path.join(d, st['preview']), maxh=720),
                           mockups=[b64(os.path.join(d, m), maxw=720) for m in st['mockups']] if i == 0 else None,
                           pack_mb=round(st['pack_bytes']/1048576)))
    data.append(dict(id=slug, title=e['title'], accent=e['accent'], map=e.get('franchise_id'), styles=styles))
    print(slug, len(styles), flush=True)

page = r'''<title>ReelOrder Posters</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600&family=DM+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;600&display=swap">
<style>
:root{--bg:#0a0c10;--panel:#12151b;--panel2:#0b0d11;--line:rgba(255,255,255,.09);--text:#E9EDF3;--muted:#A9B4C2;--dim:#6b7686;--accent:#FF2A1F;--accent2:#FF7A6E;--warn:#F5A623}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font-family:'DM Sans',system-ui,sans-serif;line-height:1.55}
button{font:inherit}
.bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px;padding:9px clamp(16px,4vw,48px);background:rgba(245,166,35,.1);border-bottom:1px solid rgba(245,166,35,.35);font-family:'JetBrains Mono',monospace;font-size:12px;color:#F5D7A6}
.bar b{color:var(--warn);font-weight:600}
header{position:sticky;top:0;z-index:5;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px clamp(16px,4vw,48px);background:rgba(6,7,10,.78);backdrop-filter:blur(14px);border-bottom:1px solid var(--line)}
.brand{display:flex;align-items:center;gap:10px;cursor:pointer}
.brand span{font-family:'Oswald',sans-serif;font-weight:600;font-size:20px;letter-spacing:.04em;text-transform:uppercase}
.brand b{color:#FF5747;font-weight:600}
nav{display:flex;gap:4px}
nav span{padding:8px 14px;border-radius:9px;font-weight:600;font-size:14px;color:#9DB0C4}
nav span.on{background:rgba(255,255,255,.08);color:#fff}
main{max-width:1240px;margin:0 auto;padding:clamp(20px,4vw,40px) clamp(16px,4vw,48px) 90px}
.eyebrow{font-family:'JetBrains Mono',monospace;font-size:11.5px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--accent2)}
h1{font-family:'Oswald',sans-serif;font-weight:600;font-size:clamp(32px,5vw,48px);line-height:1.02;margin:8px 0 10px;letter-spacing:.01em;text-wrap:balance}
.lede{color:var(--muted);font-size:16px;max-width:60ch;margin:0}
.strip{display:flex;flex-wrap:wrap;gap:8px 20px;margin-top:20px;padding:12px 16px;border-radius:12px;border:1px solid var(--line);background:rgba(255,255,255,.025);font-family:'JetBrains Mono',monospace;font-size:12px;color:#8b97a6}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:20px;margin-top:30px}
.card{cursor:pointer;border-radius:16px;overflow:hidden;border:1px solid var(--line);background:linear-gradient(180deg,rgba(18,21,27,.85),rgba(11,13,17,.85));transition:transform .2s,border-color .2s;text-align:left;padding:0;color:inherit}
.card:hover,.card:focus-visible{transform:translateY(-4px);border-color:rgba(255,255,255,.25);outline:none}
.card .img{position:relative;aspect-ratio:2/3;background:var(--panel2);overflow:hidden}
.card img{width:100%;height:100%;object-fit:cover;display:block}
.card .acc{position:absolute;left:0;right:0;bottom:0;height:3px}
.badge{position:absolute;top:10px;right:10px;padding:4px 9px;border-radius:999px;background:rgba(6,7,10,.75);border:1px solid rgba(255,255,255,.14);font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:600}
.card .body{padding:13px 15px 15px;display:flex;flex-direction:column;gap:5px}
.t{font-family:'Oswald',sans-serif;font-weight:600;font-size:18px;text-transform:uppercase;line-height:1.1}
.mono{font-family:'JetBrains Mono',monospace;font-size:11.5px;color:#7a8696}
.row{display:flex;justify-content:space-between;align-items:center;margin-top:5px}
.price{font-family:'Oswald',sans-serif;font-weight:600;font-size:18px}
.view{font-family:'JetBrains Mono',monospace;font-size:11.5px;font-weight:600;color:var(--accent2)}
.back{display:inline-flex;gap:8px;padding:8px 14px;border-radius:9px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.03);color:#9DB0C4;font-size:13.5px;cursor:pointer;margin-bottom:24px}
.detail{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(300px,.9fr);gap:clamp(20px,4vw,44px);align-items:start}
@media (max-width:820px){.detail{grid-template-columns:1fr}.panel{position:static}}
.hero{border-radius:18px;overflow:hidden;border:1px solid var(--line);background:var(--panel2)}
.hero img{width:100%;max-height:78vh;object-fit:contain;display:block;background:var(--panel2)}
.thumbs{display:flex;gap:10px;overflow-x:auto;padding:12px 0 6px}
.thumbs button,.styles button{flex:none;padding:0;border-radius:10px;overflow:hidden;border:2px solid rgba(255,255,255,.12);opacity:.7;background:var(--panel2);cursor:pointer;transition:all .15s}
.thumbs button{width:84px;height:84px}.styles button{width:56px;height:80px;border-radius:8px}
.thumbs button img,.styles button img{width:100%;height:100%;object-fit:cover;display:block}
.thumbs button.on,.styles button.on{opacity:1}
.panel{position:sticky;top:84px;display:flex;flex-direction:column;gap:16px;padding:24px;border-radius:18px;border:1px solid rgba(255,255,255,.1);background:linear-gradient(180deg,rgba(18,21,27,.85),rgba(11,13,17,.85))}
.panel h2{font-family:'Oswald',sans-serif;font-weight:600;font-size:clamp(28px,4vw,38px);line-height:1.02;margin:6px 0 6px;text-transform:uppercase}
.panel p{margin:0;color:var(--muted);font-size:15px}
.spec{display:flex;flex-direction:column;gap:8px;border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:13px 0;font-size:13.5px}
.spec div{display:flex;justify-content:space-between;gap:12px}.spec span:first-child{color:#7a8696}.spec span:last-child{text-align:right}
.styles{display:flex;flex-wrap:wrap;gap:8px}
.lbl{display:flex;justify-content:space-between;font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#7a8696}
.lbl span:last-child{letter-spacing:0;text-transform:none;color:#9DB0C4;font-size:11.5px}
.big{display:flex;align-items:baseline;gap:10px}.big b{font-family:'Oswald',sans-serif;font-weight:600;font-size:34px;line-height:1}
.buy{padding:15px 22px;border-radius:12px;border:none;color:#0a0c10;font-family:'Oswald',sans-serif;font-weight:600;font-size:15px;letter-spacing:.05em;text-transform:uppercase;width:100%;cursor:not-allowed;opacity:.55}
.note{font-family:'JetBrains Mono',monospace;font-size:11.5px;color:var(--dim);line-height:1.6}
.hidden{display:none}
.pill{display:inline-flex;align-items:center;gap:6px;padding:5px 11px;border-radius:999px;border:1px solid rgba(84,219,255,.45);background:rgba(84,219,255,.1);color:#9FE8FF;font-family:'JetBrains Mono',monospace;font-size:11.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase}
.digital{position:absolute;top:10px;left:10px;padding:4px 9px;border-radius:999px;background:rgba(84,219,255,.16);border:1px solid rgba(84,219,255,.5);color:#BFF0FF;font-family:'JetBrains Mono',monospace;font-size:10.5px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;backdrop-filter:blur(6px)}
.callout{display:flex;gap:12px;padding:13px 15px;border-radius:12px;border:1px solid rgba(84,219,255,.35);background:rgba(84,219,255,.07);font-size:13.5px;color:#CFEFFA;line-height:1.55}
.callout b{color:#9FE8FF}
.callout svg{flex:none;margin-top:2px}
footer{border-top:1px solid var(--line);padding:22px clamp(16px,4vw,48px);font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--dim);display:flex;flex-wrap:wrap;gap:8px 24px;justify-content:space-between}
</style>
<div class="bar"><b>PREVIEW BUILD</b><span>Not live · catalog not yet published · checkout disabled · rows will be uploaded inactive</span><span>13 franchises · 31 styles · USD 12.95</span></div>
<header><div class="brand" onclick="go('grid')"><svg width="28" height="28" viewBox="0 0 48 48" fill="none" aria-hidden="true"><g transform="translate(0 3.5)"><circle cx="12" cy="11" r="7" stroke="#E9EDF3" stroke-width="2.8"/><circle cx="12" cy="11" r="2" fill="#E9EDF3"/><circle cx="27" cy="11" r="5" stroke="#E9EDF3" stroke-width="2.8"/><circle cx="27" cy="11" r="1.8" fill="#E9EDF3"/><rect x="5" y="21" width="27" height="15" rx="4" stroke="#E9EDF3" stroke-width="2.8"/><path d="M34 26 L 46 21.5 M34 31 L 46 35.5" stroke="#FF2A1F" stroke-width="2.8" stroke-linecap="round"/><circle cx="12" cy="28.5" r="3" fill="#FF2A1F"/></g></svg><span>Reel<b>Order</b></span></div>
<nav><span>Hub</span><span>Timeline</span><span>Queue</span><span class="on">Posters</span></nav></header>
<main>
<section id="grid">
  <div class="eyebrow">Digital downloads</div><h1>Timeline Posters <span class="pill" style="vertical-align:middle;margin-left:10px">Digital file · nothing is shipped</span></h1>
  <p class="lede">Every film in a franchise, in the order it actually happens — designed as a 24 × 36 in wall poster. You're buying the <b style="color:#E9EDF3">print-ready digital file</b>, not a printed poster: download it the moment payment clears, then print it at home, at Officeworks, or through any online print lab.</p>
  <div class="strip"><span style="color:#9FE8FF">◆ Digital file only — no physical product, nothing is posted</span><span>◆ 24 × 36 in + A-series, 4:3, 5:7 · 300 dpi</span><span>◆ Bonus phone wallpaper</span><span>◆ Instant after payment</span><span>◆ Secure checkout by Stripe</span></div>
  <div class="grid" id="cards"></div>
</section>
<section id="detail" class="hidden">
  <button class="back" onclick="go('grid')">← All posters</button>
  <div class="detail">
    <div><div class="hero"><img id="hero" alt=""></div><div class="thumbs" id="thumbs"></div></div>
    <aside class="panel">
      <div><div class="eyebrow" id="eb">Digital download · no physical product</div><h2 id="dt"></h2><p id="tag"></p></div>
      <div id="stylesWrap"><div class="lbl"><span>Choose a style</span><span id="stl"></span></div><div class="styles" id="styles" style="margin-top:8px"></div></div>
      <div class="spec"><div><span>Size</span><span>24 × 36 in (61 × 91 cm)</span></div><div><span>File</span><span id="fl">ZIP pack · 300 dpi · 4 ratios · wallpaper</span></div><div><span>Delivery</span><span>Instant ZIP download after payment — <b>nothing is shipped</b></span></div><div><span>Licence</span><span>Personal use · print as many copies as you like</span></div></div>
      <div class="big"><b>$12.95</b><span class="mono">USD</span></div>
      <button class="buy" id="buy" disabled>Buy &amp; download the file — preview only</button>
      <div class="callout"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9FE8FF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg><div><b>This is a digital file, not a printed poster.</b> No physical item will be posted to you. You download a ZIP and print it yourself — at home, a print shop or an online lab.</div></div>
      <div class="note">Secure checkout by Stripe · Cards, Apple Pay &amp; Google Pay · Your download link also lands in your receipt email.</div>
      <div class="note" id="mapnote"></div>
    </aside>
  </div>
</section>
</main>
<footer><span>reelorder.com/posters · preview</span><span>Generated from posters-upload/catalog.json</span></footer>
<script>
const DATA = __DATA__;
const cards = document.getElementById('cards');
DATA.forEach((p,i)=>{
  const b=document.createElement('button'); b.className='card'; b.onclick=()=>open(i);
  b.innerHTML=`<div class="img"><img src="${p.styles[0].preview}" alt="${p.title} poster" loading="lazy"><div class="acc" style="background:${p.accent}"></div><span class="digital">Digital download</span>${p.styles.length>1?`<span class="badge">${p.styles.length} styles</span>`:''}</div><div class="body"><div class="t">${p.title}</div><div class="mono">Digital file · 24 × 36 in · 300 dpi</div><div class="row"><span class="price">$12.95</span><span class="view">View →</span></div></div>`;
  cards.appendChild(b);
});
let cur=0, sk=0, gi=0;
function go(s){document.getElementById('grid').classList.toggle('hidden',s!=='grid');document.getElementById('detail').classList.toggle('hidden',s!=='detail');window.scrollTo(0,0);}
function open(i){cur=i;sk=0;gi=0;render();go('detail');}
function render(){
  const p=DATA[cur], st=p.styles[sk], gal=[st.preview].concat(p.styles[0].mockups||[]);
  gi=Math.min(gi,gal.length-1);
  document.getElementById('hero').src=gal[gi]; document.getElementById('hero').alt=p.title+' poster';
  document.getElementById('dt').textContent=p.title; document.getElementById('eb').style.color=p.accent;
  document.getElementById('tag').textContent=`Every ${p.title} film, in the order it actually happens.`;
  document.getElementById('fl').textContent=`ZIP pack · ${st.pack_mb} MB · 300 dpi · 4 ratios · wallpaper`;
  document.getElementById('buy').style.background=p.accent;
  document.getElementById('mapnote').textContent=p.map?`Links to the interactive ${p.title} timeline map on the hub.`:'';
  const th=document.getElementById('thumbs'); th.innerHTML='';
  gal.forEach((g,j)=>{const b=document.createElement('button'); b.className=j===gi?'on':''; b.style.borderColor=j===gi?p.accent:''; b.innerHTML=`<img src="${g}" alt="">`; b.onclick=()=>{gi=j;render();}; th.appendChild(b);});
  const sw=document.getElementById('stylesWrap'); sw.style.display=p.styles.length>1?'':'none';
  document.getElementById('stl').textContent=st.label;
  const ss=document.getElementById('styles'); ss.innerHTML='';
  p.styles.forEach((s,j)=>{const b=document.createElement('button'); b.className=j===sk?'on':''; b.style.borderColor=j===sk?p.accent:''; b.title=s.label; b.innerHTML=`<img src="${s.preview}" alt="${s.label}">`; b.onclick=()=>{sk=j;gi=0;render();}; ss.appendChild(b);});
}
</script>'''
page = page.replace('__DATA__', json.dumps(data, separators=(',',':')))
os.makedirs(os.path.dirname(OUT), exist_ok=True); open(OUT, 'w', encoding='utf-8').write(page)
print('wrote', OUT, round(os.path.getsize(OUT)/1048576, 1), 'MB')
