#!/usr/bin/env node
/**
 * ReelOrder SEO build.
 *
 * index.html is a single-page app: every route is rewritten to it, so every route
 * used to ship the same <title>, description and share image. Crawlers and the
 * Facebook / X / Discord / Slack unfurlers read the *static* head, so none of them
 * ever saw per-franchise copy.
 *
 * This script stamps a per-route copy of index.html for each real route (head only —
 * the app itself is untouched) and writes sitemap.xml + robots.txt.
 *
 *   node scripts/build-seo.mjs          # write files
 *   node scripts/build-seo.mjs --check  # verify they are current, write nothing
 *
 * Run it from site/. ship.sh runs it before every commit, so the copies can never
 * drift from index.html.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://reelorder.com';
const CHECK = process.argv.includes('--check');
const SRC = path.join(ROOT, 'index.html');
const CACHE = path.join(ROOT, 'scripts', 'posters-cache.json');

const html = fs.readFileSync(SRC, 'utf8');

/* ---------- pull the franchise data straight out of the app ---------- */
function extractData(src) {
  const start = src.indexOf('\n  data = {');
  if (start < 0) throw new Error('build-seo: data block not found in index.html');
  const open = src.indexOf('{', start);
  let depth = 0, i = open, quote = null, esc = false;
  for (; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  // eslint-disable-next-line no-eval
  return eval('(' + src.slice(open, i) + ')');
}
const data = extractData(html);
const ids = Object.keys(data);

/* ---------- watch orders live in their own file (too big to inline per route) ---------- */
let watchOrders = {};
try {
  watchOrders = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'watch-orders.json'), 'utf8'));
} catch (e) {
  console.warn('build-seo: no assets/watch-orders.json, skipping watch-order routes');
}
const WO_NOUN = { dune: ['read and watch', 'Read and Watch'] };
const stripTags = (t) => String(t || '').replace(/<[^>]+>/g, '');

/* ---------- the same copy the app generates client-side ---------- */
const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const DEFAULT_DESC =
  'Sequels, reboots, time-loops and multiverse forks — every movie timeline mapped as clean, ' +
  'interactive branch diagrams. Search a film and follow the threads.';

const ogUrl = (name) => `${SITE}/assets/og/${name}.png`;

const routes = [
  { url: '/', file: 'index.html', inPlace: true,
    title: 'ReelOrder — Movie Timeline Maps', desc: DEFAULT_DESC, og: 'og-default', priority: '1.0' },
  { url: '/queue', file: 'queue.html',
    title: 'The Queue · ReelOrder',
    desc: 'Vote on which movie franchise gets its timeline mapped next — or suggest one. Live community rankings on ReelOrder.',
    og: 'og-queue', priority: '0.8' },
  { url: '/contribute', file: 'contribute.html',
    title: 'Contribute · ReelOrder',
    desc: 'Know a franchise inside out? Send us its branches, forks and turning points and we will build the timeline map.',
    og: 'og-contribute', priority: '0.6' },
  { url: '/contact', file: 'contact.html',
    title: 'Contact · ReelOrder',
    desc: 'Get in touch with ReelOrder — questions, corrections, and poster download support.',
    og: 'og-default', priority: '0.4' },
  { url: '/posters', file: 'posters.html',
    title: 'Timeline Posters · ReelOrder',
    desc: 'Print-ready movie collection posters as instant digital downloads — 24x36 plus A-series, 4:3, 5:7 crops and a phone wallpaper.',
    og: 'og-posters', priority: '0.9' },
  { url: '/timeline', file: 'timeline.html', noindex: true,
    title: 'ReelOrder — Movie Timeline Maps', desc: DEFAULT_DESC, og: 'og-default' },
];

for (const id of Object.keys(watchOrders)) {
  const f = data[id];
  if (!f) { console.warn('build-seo: watch order for unknown franchise ' + id); continue; }
  const noun = WO_NOUN[id] || ['watch', 'Watch'];
  routes.push({
    url: `/watch-order/${id}`,
    file: path.join('watch-order', `${id}.html`),
    title: `What Order to ${noun[1]} ${f.title} \u00b7 ReelOrder`,
    desc: `What order to ${noun[0]} ${f.title} \u2014 release order, chronological order, and the order we would give a first-timer, with a reason for every entry.`,
    og: fs.existsSync(path.join(ROOT, 'assets', 'og', `og-wo-${id}.png`)) ? `og-wo-${id}` : (fs.existsSync(path.join(ROOT, 'assets', 'og', `og-${id}.png`)) ? `og-${id}` : 'og-default'),
    priority: '0.9',
    franchise: f,
    watchOrder: watchOrders[id],
  });
}

for (const id of ids) {
  const f = data[id];
  routes.push({
    url: `/map/${id}`,
    file: path.join('map', `${id}.html`),
    title: `${f.title} Timeline Explained · ReelOrder`,
    desc: `${f.title} timeline explained — ${f.meta}. ${f.tagline}`,
    og: fs.existsSync(path.join(ROOT, 'assets', 'og', `og-${id}.png`)) ? `og-${id}` : 'og-default',
    priority: '0.9',
    franchise: f,
  });
}

/* ---------- poster detail pages ----------
   These sit in the sitemap, so they cannot keep serving index.html's head:
   its canonical points at the homepage, which reads as 13 duplicates of "/". */
const { base: sbBase, rows: posterRows } = await fetchPosters();
const posterRoutes = posterRows.map((p) => {
  const name = p.title || p.id;
  const desc = p.tagline || p.description ||
    `A print-ready ${name} movie collection poster \u2014 instant digital download at 24x36, plus A-series, 4:3 and 5:7 crops and a matching phone wallpaper.`;
  return {
    url: `/posters/${p.id}`,
    file: path.join('posters', `${p.id}.html`),
    title: `${name} Poster \u00b7 ReelOrder`,
    desc,
    og: 'og-posters',
    ogOverride: (sbBase && p.preview_path)
      ? `${sbBase}/storage/v1/object/public/poster-previews/${p.preview_path}`
      : null,
    priority: '0.7',
    poster: p,
  };
});
routes.push(...posterRoutes);

/* ---------- structured data ---------- */
function jsonLd(r) {
  const url = SITE + r.url;
  const graph = [{
    '@type': 'WebPage',
    '@id': url + '#webpage',
    url,
    name: r.title,
    description: r.desc,
    isPartOf: { '@id': SITE + '/#website' },
    primaryImageOfPage: { '@type': 'ImageObject', url: ogUrl(r.og) },
    inLanguage: 'en',
  }];
  if (r.url === '/') {
    graph.push({
      '@type': 'WebSite',
      '@id': SITE + '/#website',
      url: SITE + '/',
      name: 'ReelOrder',
      description: DEFAULT_DESC,
      inLanguage: 'en',
      publisher: { '@id': SITE + '/#org' },
      potentialAction: {
        '@type': 'SearchAction',
        target: { '@type': 'EntryPoint', urlTemplate: SITE + '/?q={search_term_string}' },
        'query-input': 'required name=search_term_string',
      },
    });
    graph.push({
      '@type': 'Organization',
      '@id': SITE + '/#org',
      name: 'ReelOrder',
      url: SITE + '/',
      logo: { '@type': 'ImageObject', url: SITE + '/assets/brand/icon-512.png', width: 512, height: 512 },
    });
  }
  if (r.poster) {
    graph.push({
      '@type': 'Product',
      '@id': url + '#product',
      name: `${r.poster.title || r.poster.id} Poster`,
      description: r.desc,
      image: r.ogOverride || ogUrl(r.og),
      brand: { '@type': 'Brand', name: 'ReelOrder' },
      offers: {
        '@type': 'Offer', url, price: '12.95', priceCurrency: 'USD',
        availability: 'https://schema.org/InStock',
        itemCondition: 'https://schema.org/NewCondition',
      },
    });
    return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph });
  }
  if (r.watchOrder) {
    const f = r.franchise;
    const noun = (WO_NOUN[f.id] || ['watch'])[0];
    const first = r.watchOrder.orders.first;
    const items = (first.groups || []).reduce((a, g) => a.concat(g.items || []), []);
    graph.push({
      '@type': 'BreadcrumbList',
      '@id': url + '#breadcrumb',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Timeline maps', item: SITE + '/' },
        { '@type': 'ListItem', position: 2, name: `${f.title} Timeline`, item: `${SITE}/map/${f.id}` },
        { '@type': 'ListItem', position: 3, name: `${f.title} watch order`, item: url },
      ],
    });
    graph[0].breadcrumb = { '@id': url + '#breadcrumb' };
    graph.push({
      '@type': 'ItemList',
      '@id': url + '#firsttime',
      name: `The order to ${noun} ${f.title} for the first time`,
      description: stripTags(first.note),
      numberOfItems: items.length,
      itemListOrder: 'https://schema.org/ItemListOrderAscending',
      itemListElement: items.map((it, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: it.year ? `${it.title} (${it.year})` : it.title,
        description: stripTags(it.why) || undefined,
      })),
    });
    return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph });
  }
  if (r.franchise) {
    const f = r.franchise;
    graph.push({
      '@type': 'BreadcrumbList',
      '@id': url + '#breadcrumb',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Timeline maps', item: SITE + '/' },
        { '@type': 'ListItem', position: 2, name: `${f.title} Timeline`, item: url },
      ],
    });
    graph[0].breadcrumb = { '@id': url + '#breadcrumb' };
    graph.push({
      '@type': 'ItemList',
      '@id': url + '#branches',
      name: `${f.title} timeline branches`,
      description: f.framing || f.blurb || f.tagline,
      numberOfItems: (f.branches || []).length,
      itemListElement: (f.branches || []).map((b, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: b.title,
        description: b.summary || undefined,
      })),
    });
  }
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph });
}

/* ---------- the head block ---------- */
function metaBlock(r) {
  const url = SITE + (r.url === '/' ? '/' : r.url);
  const img = r.ogOverride || ogUrl(r.og);
  const alt = r.poster ? `${r.poster.title || r.poster.id} poster from ReelOrder`
    : r.franchise ? `${r.franchise.title} timeline map on ReelOrder`
    : 'ReelOrder — untangle every timeline';
  return [
    '<!--RO:META-->',
    `<title>${esc(r.title)}</title>`,
    `<meta name="description" content="${esc(r.desc)}">`,
    `<link rel="canonical" href="${url}">`,
    r.noindex
      ? '<meta name="robots" content="noindex,follow">'
      : '<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">',
    '<meta name="theme-color" content="#070809">',
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="ReelOrder">',
    '<meta property="og:locale" content="en_AU">',
    `<meta property="og:title" content="${esc(r.title)}">`,
    `<meta property="og:description" content="${esc(r.desc)}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:image" content="${img}">`,
    ...(r.ogOverride ? [] : ['<meta property="og:image:width" content="1200">',
                             '<meta property="og:image:height" content="630">']),
    `<meta property="og:image:alt" content="${esc(alt)}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${esc(r.title)}">`,
    `<meta name="twitter:description" content="${esc(r.desc)}">`,
    `<meta name="twitter:image" content="${img}">`,
    `<script type="application/ld+json">${jsonLd(r)}</script>`,
    '<!--/RO:META-->',
  ].join('\n');
}

/* ---------- crawler-visible fallback copy (invisible when JS runs) ---------- */
function noscriptBlock(r) {
  if (r.watchOrder) {
    const f = r.franchise;
    const wo = r.watchOrder;
    const noun = (WO_NOUN[f.id] || ['watch'])[0];
    const section = (heading, blocks) =>
      `<h2>${esc(heading)}</h2>` + blocks;
    const listOf = (items) =>
      '<ol>' + items.map((it) =>
        `<li><strong>${esc(it.title)}</strong>${it.year ? ` (${it.year})` : ''}${it.setLabel ? ` — ${esc(it.setLabel)}` : ''}` +
        `${it.why ? ' — ' + esc(stripTags(it.why)) : ''} <em>[${esc(it.branch)}]</em></li>`).join('') + '</ol>';
    const firstGroups = (wo.orders.first.groups || [])
      .map((g) => `<h3>${esc(g.label)}</h3>` + listOf(g.items || [])).join('');
    return `<noscript><article style="max-width:760px;margin:40px auto;padding:0 20px;font-family:system-ui,sans-serif;color:#E9EDF3;background:#070809">
<h1>What order to ${esc(noun)} ${esc(f.title)}</h1>
<p>${esc(stripTags(wo.intro))}</p>
${section('If you are watching it for the first time', `<p>${esc(stripTags(wo.orders.first.note))}</p>` + firstGroups)}
${section('Release order', `<p>${esc(stripTags(wo.orders.release.note))}</p>` + listOf(wo.orders.release.items || []))}
${section('Chronological order', `<p>${esc(stripTags(wo.orders.chrono.note))}</p>` + listOf(wo.orders.chrono.items || []))}
<p><a href="${SITE}/map/${f.id}">The ${esc(f.title)} branch map</a> &middot; <a href="${SITE}/">All ReelOrder timeline maps</a></p>
</article></noscript>`;
  }
  if (!r.franchise) return '';
  const f = r.franchise;
  const branches = (f.branches || [])
    .map((b) => `<li><strong>${esc(b.title)}</strong>${b.summary ? ' — ' + esc(b.summary) : ''}</li>`)
    .join('');
  const films = (f.films || []).map((x) => `<li>${esc(x)}</li>`).join('');
  return `<noscript><article style="max-width:760px;margin:40px auto;padding:0 20px;font-family:system-ui,sans-serif;color:#E9EDF3;background:#070809">
<h1>${esc(f.title)} timeline explained</h1>
<p>${esc(f.meta)}</p>
<p>${esc(f.framing || f.blurb || f.tagline)}</p>
<h2>Branches</h2><ul>${branches}</ul>
${films ? `<h2>Films</h2><ul>${films}</ul>` : ''}
<p><a href="${SITE}/">All ReelOrder timeline maps</a></p>
</article></noscript>`;
}

/* ---------- render ---------- */
const META_RE = /<!--RO:META-->[\s\S]*?<!--\/RO:META-->/;
if (!META_RE.test(html)) throw new Error('build-seo: RO:META markers missing from index.html');

const written = [];
const stale = [];

function emit(relPath, content) {
  const abs = path.join(ROOT, relPath);
  const current = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
  if (current === content) return;
  if (CHECK) { stale.push(relPath); return; }
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
  written.push(relPath);
}

let hubPage = html;
for (const r of routes) {
  let page = html.replace(META_RE, () => metaBlock(r));
  if (r.inPlace) {
    // the hub's own head is the source of truth; just keep it in sync
    hubPage = page;
    emit(r.file, page);
    continue;
  }
  const ns = noscriptBlock(r);
  if (ns) page = page.replace('<body>', '<body>\n' + ns);
  emit(r.file, page);
}

// realorder.html is a byte-identical mirror of the hub
emit('realorder.html', hubPage);

/* ---------- sitemap + robots ---------- */
async function fetchPosters() {
  const m = html.match(/https:\/\/([a-z0-9]+)\.supabase\.co/);
  const keyMatch = html.match(/(sb_publishable_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/);
  if (!m || !keyMatch) return { base: null, rows: [] };
  try {
    const res = await fetch(
      `${m[0]}/rest/v1/posters?select=id,title,tagline,description,preview_path&active=eq.true`,
      { headers: { apikey: keyMatch[1], Authorization: `Bearer ${keyMatch[1]}` } }
    );
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const rows = await res.json();
    if (!CHECK) { try { fs.writeFileSync(CACHE, JSON.stringify(rows, null, 1) + '\n'); } catch (e) {} }
    return { base: m[0], rows };
  } catch (e) {
    // No egress (Cowork sandbox, offline) - fall back to the last good copy so
    // the build stays deterministic instead of silently dropping 13 pages.
    try {
      const cached = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
      console.warn('build-seo: live poster fetch failed (' + e.message + ') - using ' + path.basename(CACHE));
      return { base: m[0], rows: cached };
    } catch (e2) {
      console.warn('build-seo: no poster data (' + e.message + ') and no cache - poster pages skipped');
      return { base: null, rows: [] };
    }
  }
}

const today = new Date().toISOString().slice(0, 10);
const sitemapUrls = [
  ...routes.filter((r) => !r.noindex).map((r) => ({ loc: r.url, priority: r.priority || '0.5' })),
  { loc: '/print-guide.html', priority: '0.3' },
  { loc: '/privacy.html', priority: '0.2' },
  { loc: '/terms.html', priority: '0.2' },
];

emit('sitemap.xml',
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  sitemapUrls.map((u) =>
    `  <url><loc>${SITE}${u.loc}</loc><lastmod>${today}</lastmod><priority>${u.priority}</priority></url>`
  ).join('\n') +
  '\n</urlset>\n');

emit('robots.txt',
  `# ReelOrder\nUser-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nDisallow: /posters/thanks\n\nSitemap: ${SITE}/sitemap.xml\n`);

if (CHECK) {
  if (stale.length) {
    console.error('build-seo --check: out of date ->\n  ' + stale.join('\n  '));
    process.exit(1);
  }
  console.log('build-seo --check: all generated files are current');
} else {
  console.log(`build-seo: ${routes.length} routes (${posterRoutes.length} posters), ${written.length} file(s) updated`);
  written.forEach((f) => console.log('  ' + f));
}
