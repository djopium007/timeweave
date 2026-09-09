import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');

const DIR = path.dirname(new URL(import.meta.url).pathname);
const OUT = path.join(DIR, 'out');
fs.mkdirSync(OUT, { recursive: true });

const b64 = (f) => fs.readFileSync(path.join(DIR, f)).toString('base64');
const FONT_DM = b64('dmsans.woff2');
const FONT_JB = b64('jetbrains.woff2');
const FONT_OS = b64('oswald.woff2');
const MARK = fs.readFileSync(path.join(DIR, 'mark.svg'), 'utf8');

const franchises = JSON.parse(fs.readFileSync(path.join(DIR, 'franchises.json'), 'utf8'));
let watchOrders = {};
try { watchOrders = JSON.parse(fs.readFileSync(path.join(DIR, 'watch-orders.json'), 'utf8')); } catch (e) {}
const WO_NOUN = { dune: 'Read & watch order' };

const BG = '#070809';
const INK = '#E9EDF3';
const MUTED = '#9DB0C4';
const BRAND = '#FF2A1F';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// abstract fork/rail motif — generic geometry, no franchise IP
function motif(accent) {
  return `
  <svg class="motif" viewBox="0 0 520 520" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="g" x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur stdDeviation="9" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <linearGradient id="fade" gradientUnits="userSpaceOnUse" x1="40" y1="0" x2="470" y2="0">
        <stop offset="0" stop-color="${accent}" stop-opacity="0.15"/>
        <stop offset="1" stop-color="${accent}" stop-opacity="0.9"/>
      </linearGradient>
    </defs>
    <g stroke="url(#fade)" stroke-width="3" stroke-linecap="round" filter="url(#g)">
      <path d="M40 260 H200"/>
      <path d="M200 260 C 268 260, 268 120, 336 120 H452"/>
      <path d="M200 260 C 268 260, 268 260, 336 260 H430"/>
      <path d="M200 260 C 268 260, 268 400, 336 400 H470"/>
      <path d="M336 400 C 396 400, 396 470, 452 470"/>
    </g>
    <g fill="${accent}" filter="url(#g)">
      <circle cx="200" cy="260" r="11"/>
      <circle cx="452" cy="120" r="7"/>
      <circle cx="430" cy="260" r="7"/>
      <circle cx="470" cy="400" r="7"/>
      <circle cx="452" cy="470" r="7"/>
    </g>
    <g fill="${accent}" opacity="0.35">
      <circle cx="336" cy="120" r="4"/>
      <circle cx="336" cy="260" r="4"/>
      <circle cx="336" cy="400" r="4"/>
    </g>
  </svg>`;
}

function shell(accent, inner) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  @font-face{font-family:'Oswald';src:url(data:font/woff2;base64,${FONT_OS}) format('woff2');font-weight:200 700;font-display:block}
  @font-face{font-family:'DM Sans';src:url(data:font/woff2;base64,${FONT_DM}) format('woff2');font-weight:100 900;font-display:block}
  @font-face{font-family:'JetBrains Mono';src:url(data:font/woff2;base64,${FONT_JB}) format('woff2');font-weight:100 900;font-display:block}
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:1200px;height:630px}
  body{background:${BG};color:${INK};font-family:'DM Sans',system-ui,sans-serif;overflow:hidden;position:relative}
  .glow{position:absolute;inset:0;background:
    radial-gradient(900px 620px at 88% 18%, ${accent}2E 0%, transparent 62%),
    radial-gradient(700px 520px at 6% 96%, ${accent}14 0%, transparent 60%);}
  .grid{position:absolute;inset:0;opacity:.055;
    background-image:linear-gradient(${INK} 1px,transparent 1px),linear-gradient(90deg,${INK} 1px,transparent 1px);
    background-size:64px 64px;
    -webkit-mask-image:radial-gradient(1000px 600px at 50% 40%,#000 0%,transparent 78%)}
  .edge{position:absolute;left:0;top:0;bottom:0;width:10px;background:${accent}}
  .wrap{position:relative;height:100%;padding:66px 70px 60px 82px;display:flex;flex-direction:column;justify-content:space-between}
  .motif{position:absolute;right:-26px;top:50%;transform:translateY(-50%);width:520px;height:520px;opacity:.92}
  .eyebrow{font-family:'JetBrains Mono',monospace;font-size:21px;letter-spacing:.22em;text-transform:uppercase;color:${accent};font-weight:600}
  .mark{display:flex;align-items:center;gap:14px}
  .mark svg{width:44px;height:44px}
  .word{font-family:'Oswald',sans-serif;font-weight:700;font-size:35px;letter-spacing:.055em}
  .word span{color:${BRAND}}
  .foot{display:flex;align-items:center;justify-content:space-between;position:relative;z-index:2}
  .url{font-family:'JetBrains Mono',monospace;font-size:21px;color:${MUTED};letter-spacing:.06em}
  .body{position:relative;z-index:2;max-width:730px;flex:1 1 auto;min-height:0;overflow:hidden;display:flex;flex-direction:column;justify-content:center}
  .foot{flex:0 0 auto;padding-top:26px}
  </style></head><body>
  <div class="glow"></div><div class="grid"></div><div class="edge"></div>
  ${motif(accent)}
  <div class="wrap">${inner}</div>
  </body></html>`;
}

const wordmark = `<div class="mark">${MARK}<div class="word">REEL<span>ORDER</span></div></div>`;

function franchiseCard(f) {
  const t = f.title.toUpperCase();
  const size = t.length > 26 ? 84 : t.length > 18 ? 96 : t.length > 12 ? 110 : 124;
  const branches = (f.branches || []).slice(0, 3);
  const extra = (f.branches || []).length - branches.length;
  const chips = branches
    .map((b) => `<div class="chip">${esc(b)}</div>`)
    .join('') + (extra > 0 ? `<div class="chip more">+${extra} more</div>` : '');
  return shell(
    f.accent,
    `<div class="body">
      <div class="eyebrow">Timeline Map</div>
      <h1 style="font-family:'Oswald',sans-serif;font-weight:700;font-size:${size}px;line-height:1.02;margin:20px 0 0;letter-spacing:.005em">${esc(t)}</h1>
      <div style="font-family:'JetBrains Mono',monospace;font-size:23px;color:${MUTED};margin-top:20px;letter-spacing:.02em">${esc(f.meta)}</div>
      <div style="display:flex;flex-wrap:wrap;gap:11px;margin-top:28px;max-width:640px">${chips}</div>
    </div>
    <div class="foot">${wordmark}<div class="url">reelorder.com</div></div>
    <style>.chip{font-size:19px;color:${INK}CC;border:1px solid ${f.accent}55;background:${f.accent}12;
      border-radius:999px;padding:8px 17px;white-space:nowrap}
      .chip.more{color:${MUTED};border-color:#ffffff22;background:transparent}</style>`
  );
}

function homeCard() {
  return shell(
    BRAND,
    `<div class="body">
      <div class="eyebrow">Community Timeline Wiki</div>
      <h1 style="font-family:'Oswald',sans-serif;font-weight:700;font-size:112px;line-height:1;margin:22px 0 0">
        UNTANGLE<br>EVERY TIMELINE<span style="color:${BRAND}">.</span></h1>
      <div style="font-size:27px;color:${MUTED};margin-top:26px;max-width:640px;line-height:1.4">
        Sequels, reboots, time-loops and multiverse forks — mapped as clean, interactive branch diagrams.</div>
    </div>
    <div class="foot">${wordmark}<div class="url">reelorder.com</div></div>`
  );
}

function simpleCard(eyebrow, title, sub, accent) {
  const t = title.toUpperCase();
  const size = t.length > 22 ? 82 : t.length > 14 ? 100 : 116;
  return shell(
    accent,
    `<div class="body">
      <div class="eyebrow">${esc(eyebrow)}</div>
      <h1 style="font-family:'Oswald',sans-serif;font-weight:700;font-size:${size}px;line-height:1.02;margin:22px 0 0">${esc(t)}</h1>
      <div style="font-size:26px;color:${MUTED};margin-top:24px;max-width:620px;line-height:1.4">${esc(sub)}</div>
    </div>
    <div class="foot">${wordmark}<div class="url">reelorder.com</div></div>`
  );
}

function watchOrderCard(f, wo) {
  const t = f.title.toUpperCase();
  const size = t.length > 26 ? 84 : t.length > 18 ? 96 : t.length > 12 ? 110 : 124;
  const first = (wo.orders.first.groups || []).reduce((a, g) => a.concat(g.items || []), []);
  const picks = first.slice(0, 3).map((it, i) =>
    `<div class="step"><span class="n">${i + 1}</span>${esc(it.title)}</div>`).join('');
  return shell(
    f.accent,
    `<div class="body">
      <div class="eyebrow">${esc(WO_NOUN[f.id] || 'Watch order')}</div>
      <h1 style="font-family:'Oswald',sans-serif;font-weight:700;font-size:${size}px;line-height:1.02;margin:20px 0 0;letter-spacing:.005em">${esc(t)}</h1>
      <div style="font-family:'JetBrains Mono',monospace;font-size:23px;color:${MUTED};margin-top:20px;letter-spacing:.02em">Release &nbsp;·&nbsp; Chronological &nbsp;·&nbsp; First-time</div>
      <div style="display:flex;flex-direction:column;gap:10px;margin-top:26px;max-width:640px">${picks}</div>
    </div>
    <div class="foot">${wordmark}<div class="url">reelorder.com</div></div>
    <style>.step{display:flex;align-items:center;gap:14px;font-size:21px;color:${INK}D9;white-space:nowrap}
      .step .n{flex:0 0 auto;width:30px;height:30px;border-radius:50%;display:grid;place-items:center;
        font-family:'JetBrains Mono',monospace;font-size:15px;font-weight:700;color:${f.accent};
        border:1.5px solid ${f.accent}66;background:${f.accent}14}</style>`
  );
}

const jobs = [
  ['og-default', homeCard()],
  ['og-queue', simpleCard('The Queue', 'Vote on what gets mapped next', 'Every franchise waiting for a timeline map — upvote yours, or suggest one.', '#54DBFF')],
  ['og-posters', simpleCard('Print Shop', 'Movie collection posters', 'Instant digital downloads, print-ready to 24×36 — plus A-series, 4:3, 5:7 and a phone wallpaper.', '#F5A623')],
  ['og-contribute', simpleCard('Contribute', 'Help map a timeline', 'Know a franchise inside out? Send us the branches and we will build the map.', '#3DDC84')],
  ...franchises.map((f) => [`og-${f.id}`, franchiseCard(f)]),
  ...franchises.filter((f) => watchOrders[f.id]).map((f) => [`og-wo-${f.id}`, watchOrderCard(f, watchOrders[f.id])]),
];

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
for (const [name, html] of jobs) {
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => {
    const body = document.querySelector('.body');
    const h1 = document.querySelector('h1');
    if (!body || !h1) return;
    let size = parseFloat(getComputedStyle(h1).fontSize);
    let guard = 0;
    while (body.scrollHeight > body.clientHeight + 1 && size > 42 && guard++ < 90) {
      size -= 2;
      h1.style.fontSize = size + 'px';
    }
  });
  await page.screenshot({ path: path.join(OUT, `${name}.png`), type: 'png' });
  console.log('rendered', name);
}
await browser.close();
console.log('done', jobs.length);
