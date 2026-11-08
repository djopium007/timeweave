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
import vm from 'vm';
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

/* Same calculator the pages use. Kept out of the SPA bundle as a classic script. */
const bingeSandbox = { module: { exports: {} }, exports: {} };
bingeSandbox.globalThis = bingeSandbox;
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'assets', 'binge-time.js'), 'utf8'), bingeSandbox, { filename: 'binge-time.js' });
const bingeTime = bingeSandbox.module.exports;
let runtimes = null;
try {
  runtimes = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'runtimes.json'), 'utf8'));
} catch (e) {
  console.warn('build-seo: no assets/runtimes.json, binge totals omitted');
}
function bingeFor(id) {
  const f = data[id];
  if (!f || !bingeTime || !runtimes) return { hasBinge: false, line: '', note: '', basis: '' };
  const summary = bingeTime.summarize({
    id,
    title: f.title,
    hasWatchOrder: Object.prototype.hasOwnProperty.call(watchOrders, id),
    watchOrder: watchOrders[id] || null,
    runtimes,
  });
  if (summary.hasBinge && !/\babout\b/i.test(summary.line)) {
    throw new Error('build-seo: binge line for ' + id + ' is missing "about"');
  }
  if (summary.line && /[\u2014\u2013]/.test(summary.line + summary.note + summary.basis)) {
    throw new Error('build-seo: binge copy for ' + id + ' contains a dash the site does not use');
  }
  return summary;
}

/* ---------- watch orders live in their own file (too big to inline per route) ---------- */
let watchOrders = {};
try {
  watchOrders = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'watch-orders.json'), 'utf8'));
} catch (e) {
  console.warn('build-seo: no assets/watch-orders.json, skipping watch-order routes');
}
const WO_NOUN = { dune: ['read and watch', 'Read and Watch'] };
/* Search-phrase page names (Ahrefs US, keywords/ CSV). Keep in sync with WO_KW / MAP_KW in index.html. */
const WO_KW = { marvel: 'Marvel Movies in Order', matrix: 'Matrix Movies in Order', dune: 'Dune Books in Order (and Movies)', bourne: 'Jason Bourne Movies in Order', conjuring: 'The Conjuring Movies in Order', fast: 'Fast and Furious Movies in Order' };
const woName = (f) => WO_KW[f.id] || `${f.title} Movies in Order`;
const woPhrase = (f) => woName(f).replace(/(Movies|Books) in Order( \(and Movies\))?/, (m) => m.toLowerCase());
const MAP_KW = { marvel: 'MCU Timeline Explained', conjuring: 'The Conjuring Timeline Explained', fast: 'Fast and Furious Timeline Explained' };
const mapName = (f) => MAP_KW[f.id] || `${f.title} Timeline Explained`;
const stripTags = (t) => String(t || '').replace(/<[^>]+>/g, '');

/* ---------- the same copy the app generates client-side ---------- */
const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const DEFAULT_DESC =
  'Every movie franchise in order: release order, chronological order and the best watch order for a first-timer, plus every timeline mapped as a clean, interactive branch diagram. Search a film and follow the threads.';

const ogUrl = (name) => `${SITE}/assets/og/${name}.png`;

const routes = [
  { url: '/', file: 'index.html', inPlace: true,
    title: 'ReelOrder | Movies in Order & Timeline Maps', desc: DEFAULT_DESC, og: 'og-default', priority: '1.0' },
  { url: '/queue', file: 'queue.html',
    title: 'The Queue · ReelOrder',
    desc: 'Vote on which movie franchise gets its timeline mapped next, or suggest one. Live community rankings on ReelOrder.',
    og: 'og-queue', priority: '0.8' },
  { url: '/contribute', file: 'contribute.html',
    title: 'Contribute · ReelOrder',
    desc: 'Know a franchise inside out? Send us its branches, forks and turning points and we will build the timeline map.',
    og: 'og-contribute', priority: '0.6' },
  { url: '/contact', file: 'contact.html',
    title: 'Contact · ReelOrder',
    desc: 'Get in touch with ReelOrder: questions, corrections, and poster download support.',
    og: 'og-default', priority: '0.4' },
  { url: '/posters', file: 'posters.html',
    title: 'Timeline Posters · ReelOrder',
    desc: 'Print-ready movie collection posters as instant digital downloads: 24x36 plus A-series, 4:3, 5:7 crops and a phone wallpaper.',
    og: 'og-posters', priority: '0.9' },
  { url: '/timeline', file: 'timeline.html', noindex: true,
    title: 'All Timeline Maps · ReelOrder',
    desc: 'Every ReelOrder movie timeline map in one list: filter by franchise or film and jump straight to its branch map.',
    og: 'og-default' },
];

for (const id of Object.keys(watchOrders)) {
  const f = data[id];
  if (!f) { console.warn('build-seo: watch order for unknown franchise ' + id); continue; }
  const noun = WO_NOUN[id] || ['watch', 'Watch'];
  routes.push({
    url: `/watch-order/${id}`,
    file: path.join('watch-order', `${id}.html`),
    title: `${woName(f)} \u00b7 ReelOrder`,
    desc: `${woPhrase(f)}: release order, chronological order, and the best watch order for a first-timer, with a reason for every entry.`,
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
    title: `${mapName(f)} · ReelOrder`,
    desc: `${f.title} timeline explained: ${f.meta}. ${f.tagline}${watchOrders[id] ? ` Plus the ${woPhrase(f)}.` : ''}`,
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
    `A print-ready ${name} movie collection poster, instant digital download at 24x36, plus A-series, 4:3 and 5:7 crops and a matching phone wallpaper.`;
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
        { '@type': 'ListItem', position: 1, name: 'ReelOrder', item: SITE + '/' },
        { '@type': 'ListItem', position: 2, name: 'All franchises', item: SITE + '/all-franchises' },
        { '@type': 'ListItem', position: 3, name: `${f.title} Timeline`, item: `${SITE}/map/${f.id}` },
        { '@type': 'ListItem', position: 4, name: woName(f), item: url },
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
    if (r.watchOrder.faq && r.watchOrder.faq.length) {
      graph.push({
        '@type': 'FAQPage',
        '@id': url + '#faq',
        mainEntity: r.watchOrder.faq.map((q) => ({
          '@type': 'Question', name: q.q,
          acceptedAnswer: { '@type': 'Answer', text: q.a },
        })),
      });
    }
    return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph });
  }
  if (r.franchise) {
    const f = r.franchise;
    graph.push({
      '@type': 'BreadcrumbList',
      '@id': url + '#breadcrumb',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'ReelOrder', item: SITE + '/' },
        { '@type': 'ListItem', position: 2, name: 'All franchises', item: SITE + '/all-franchises' },
        { '@type': 'ListItem', position: 3, name: `${f.title} Timeline`, item: url },
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
    : 'ReelOrder: untangle every timeline';
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
        `<li><strong>${esc(it.title)}</strong>${it.year ? ` (${it.year})` : ''}${it.setLabel ? ` · ${esc(it.setLabel)}` : ''}` +
        `${it.why ? ': ' + esc(stripTags(it.why)) : ''} <em>[${esc(it.branch)}]</em></li>`).join('') + '</ol>';
    const firstGroups = (wo.orders.first.groups || [])
      .map((g) => `<h3>${esc(g.label)}</h3>` + listOf(g.items || [])).join('');
    const binge = bingeFor(f.id);
    const bingeHtml = binge.hasBinge
      ? `<p><strong>${esc(binge.line)}</strong> ${esc(binge.basis)}${binge.note ? ' ' + esc(binge.note) : ''}</p>`
      : '';
    return `<noscript><article style="max-width:760px;margin:40px auto;padding:0 20px;font-family:system-ui,sans-serif;color:#E9EDF3;background:#070809">
<h1>${esc(woName(f))}</h1>
<p><strong>Release order</strong> &middot; <strong>chronological order</strong> &middot; the best watch order if it is your first time ${esc(noun === 'watch' ? 'watching' : noun + 'ing')} it.</p>
${bingeHtml}
<p>${esc(stripTags(wo.intro))}</p>
${section(`The order to ${noun} ${f.title} for the first time`, `<p>${esc(stripTags(wo.orders.first.note))}</p>` + firstGroups)}
${section(`${f.title} in release order`, `<p>${esc(stripTags(wo.orders.release.note))}</p>` + listOf(wo.orders.release.items || []))}
${section(`${f.title} in chronological order`, `<p>${esc(stripTags(wo.orders.chrono.note))}</p>` + listOf(wo.orders.chrono.items || []))}
${(wo.faq && wo.faq.length) ? section('Common questions about the ' + woPhrase(f), wo.faq.map((q) => `<h3>${esc(q.q)}</h3><p>${esc(q.a)}</p>`).join('')) : ''}
<p><a href="${SITE}/map/${f.id}">The ${esc(f.title)} branch map</a> &middot; <a href="${SITE}/all-franchises">All movie franchises in order</a></p>
</article></noscript>`;
  }
  if (!r.franchise) return '';
  const f = r.franchise;
  const branches = (f.branches || [])
    .map((b) => `<li><strong>${esc(b.title)}</strong>${b.summary ? ': ' + esc(b.summary) : ''}</li>`)
    .join('');
  const films = (f.films || []).map((x) => `<li>${esc(x)}</li>`).join('');
  const binge = bingeFor(f.id);
  const bingeHtml = binge.hasBinge
    ? `<p><strong>${esc(binge.line)}</strong> ${esc(binge.basis)}${binge.note ? ' ' + esc(binge.note) : ''}</p>`
    : '';
  return `<noscript><article style="max-width:760px;margin:40px auto;padding:0 20px;font-family:system-ui,sans-serif;color:#E9EDF3;background:#070809">
<h1>${esc(mapName(f))}</h1>
<p>${esc(f.meta)}</p>
${bingeHtml}
<p>${esc(f.framing || f.blurb || f.tagline)}</p>
<h2>Branches</h2><ul>${branches}</ul>
${films ? `<h2>Films</h2><ul>${films}</ul>` : ''}
<p>${watchOrders[f.id] ? `<a href="${SITE}/watch-order/${f.id}">${esc(woName(f))}</a>: release order vs chronological order, plus the order to watch it for the first time. &middot; ` : ''}<a href="${SITE}/all-franchises">All movie franchises in order</a></p>
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

/* ---------- /all-franchises: the directory page every map and watch order hangs off ----------
   A plain static page (no SPA), so every link is a real <a href> a crawler follows on first
   fetch. Genre is assigned HERE, not in index.html: a new franchise with no genre still shows
   up (under "More franchises") but the build warns until it is given one. */
const GENRES = [
  { id: 'scifi', label: 'Sci-fi', heading: 'Sci-fi franchises',
    blurb: 'Time travel, galaxy-wide wars, simulated worlds and machines sent back to rewrite the future.',
    ids: ['starwars', 'startrek', 'dune', 'matrix', 'terminator', 'bttf', 'apes', 'transformers', 'tron', 'tenet'] },
  { id: 'superhero', label: 'Superhero', heading: 'Superhero franchises',
    blurb: 'Shared universes, multiverse resets and the timelines that tie dozens of films together.',
    ids: ['marvel', 'xmen'] },
  { id: 'horror', label: 'Horror', heading: 'Horror franchises',
    blurb: 'Haunted case files, prequels that come first, and things that hunt you in the dark.',
    ids: ['conjuring', 'alien', 'predator'] },
  { id: 'action', label: 'Action', heading: 'Action franchises',
    blurb: 'Assassins, spies, street racers and one soldier who never got to go home.',
    ids: ['johnwick', 'bourne', 'fast', 'rambo'] },
  { id: 'fantasy', label: 'Fantasy', heading: 'Fantasy franchises',
    blurb: 'Vampires, visions and stories told twice from the other side.',
    ids: ['twilight'] },
  { id: 'anime', label: 'Anime', heading: 'Anime franchises',
    blurb: 'Series, films and recaps where the watch order is half the battle.',
    ids: [], empty: 'The first anime map is being picked now.' },
];

function extractArray(src, marker) {
  const start = src.indexOf(marker);
  if (start < 0) return [];
  const open = src.indexOf('[', start);
  let depth = 0, i = open, quote = null, escp = false;
  for (; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (escp) { escp = false; continue; }
      if (c === '\\') { escp = true; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === '[') depth++;
    else if (c === ']') { depth--; if (depth === 0) { i++; break; } }
  }
  try { return eval('(' + src.slice(open, i) + ')'); } catch (e) { console.warn('build-seo: could not read ' + marker.trim()); return []; }
}

function directoryPage() {
  const sortKey = (f) => f.title.replace(/^The /, '').toLowerCase();
  const assigned = new Set(GENRES.flatMap((g) => g.ids));
  const loose = ids.filter((id) => !assigned.has(id));
  if (loose.length) console.warn('build-seo: no genre for ' + loose.join(', ') + ' (add it to GENRES in scripts/build-seo.mjs)');
  const groups = GENRES.map((g) => ({ ...g, list: g.ids.filter((id) => data[id]).map((id) => data[id]) }));
  if (loose.length) groups.push({ id: 'more', label: 'More', heading: 'More franchises', blurb: '', list: loose.map((id) => data[id]) });
  groups.forEach((g) => g.list.sort((a, b) => sortKey(a).localeCompare(sortKey(b))));
  const shown = groups.filter((g) => g.list.length || g.empty);
  const total = ids.length;
  const woCount = ids.filter((id) => watchOrders[id]).length;
  const genreNames = shown.filter((g) => g.list.length).map((g) => g.label.toLowerCase());
  const genreText = genreNames.length > 1 ? genreNames.slice(0, -1).join(', ') + ' and ' + genreNames.slice(-1) : genreNames.join('');
  const soon = extractArray(html, '\n  comingSoon = [').filter((c) => c && c.id && !data[c.id]);

  const url = SITE + '/all-franchises';
  const title = 'All Movie Franchises in Order · ReelOrder';
  const desc = `${total} movie franchises in order, grouped by genre: ${genreText}. Each one has its release order, chronological order and best first-time watch order, plus a timeline map of where the story splits.`;
  const primaryUrl = (f) => watchOrders[f.id] ? `/watch-order/${f.id}` : `/map/${f.id}`;

  const ld = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'CollectionPage', '@id': url + '#webpage', url, name: title, description: desc,
      isPartOf: { '@id': SITE + '/#website' }, breadcrumb: { '@id': url + '#breadcrumb' },
      primaryImageOfPage: { '@type': 'ImageObject', url: ogUrl('og-default') }, inLanguage: 'en',
      mainEntity: { '@id': url + '#franchises' } },
    { '@type': 'BreadcrumbList', '@id': url + '#breadcrumb', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'ReelOrder', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: 'All franchises', item: url } ] },
    { '@type': 'ItemList', '@id': url + '#franchises', name: 'Movie franchises in order',
      numberOfItems: total,
      itemListElement: shown.flatMap((g) => g.list).map((f, i) => ({
        '@type': 'ListItem', position: i + 1, name: watchOrders[f.id] ? woName(f) : mapName(f), url: SITE + primaryUrl(f) })) },
  ] };

  const card = (f) => `
      <li class="fr" style="--a:${esc(f.accent || '#FF2A1F')}">
        <div class="fr-top"><h3><a href="${primaryUrl(f)}">${esc(f.title)}</a></h3><span class="meta">${esc(f.meta || '')}</span></div>
        <p>${esc(stripTags(f.tagline || ''))}</p>
        <div class="links">${watchOrders[f.id] ? `<a class="wo" href="/watch-order/${f.id}">${esc(woName(f))}</a>` : ''}<a href="/map/${f.id}">${esc(mapName(f))}</a></div>
      </li>`;
  const section = (g) => `
  <section class="genre" id="${g.id}" aria-labelledby="h-${g.id}">
    <div class="g-head"><h2 id="h-${g.id}">${esc(g.heading)}</h2><span class="count">${g.list.length ? `${g.list.length} ${g.list.length === 1 ? 'franchise' : 'franchises'}` : 'coming soon'}</span></div>
    ${g.blurb ? `<p class="g-blurb">${esc(g.blurb)}</p>` : ''}
    ${g.list.length ? `<ul class="frs">${g.list.map(card).join('')}
    </ul>` : `<p class="empty">${esc(g.empty || '')} <a href="/queue">Vote in the Queue</a> to help pick it.</p>`}
  </section>`;

  const logo = '<svg width="28" height="28" viewBox="0 0 48 48" fill="none" aria-hidden="true"><g transform="translate(0 3.5)"><circle cx="12" cy="11" r="7" stroke="#E9EDF3" stroke-width="2.8"/><circle cx="12" cy="11" r="2" fill="#E9EDF3"/><circle cx="27" cy="11" r="5" stroke="#E9EDF3" stroke-width="2.8"/><circle cx="27" cy="11" r="1.8" fill="#E9EDF3"/><rect x="5" y="21" width="27" height="15" rx="4" stroke="#E9EDF3" stroke-width="2.8"/><path d="M34 26 L 46 21.5 M34 31 L 46 35.5" stroke="#FF2A1F" stroke-width="2.8" stroke-linecap="round"/><circle cx="12" cy="28.5" r="3" fill="#FF2A1F"/></g></svg>';
  const latin = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<!-- GENERATED by scripts/build-seo.mjs from index.html + assets/watch-orders.json. Do not hand-edit. -->
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">
<meta name="theme-color" content="#070809">
<meta property="og:type" content="website">
<meta property="og:site_name" content="ReelOrder">
<meta property="og:locale" content="en_AU">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${ogUrl('og-default')}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="ReelOrder: untangle every timeline">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${ogUrl('og-default')}">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<link rel="icon" type="image/svg+xml" href="/assets/brand/favicon.svg">
<link rel="icon" type="image/png" sizes="32x32" href="/assets/brand/favicon-32.png">
<link rel="apple-touch-icon" sizes="180x180" href="/assets/brand/apple-touch-icon-180.png">
<link rel="preload" href="/assets/asset-13.woff2" as="font" type="font/woff2" crossorigin>
<script defer src="/_vercel/insights/script.js"></script>
<script defer src="/_vercel/speed-insights/script.js"></script>
<style>
@font-face{font-family:'DM Sans';font-style:normal;font-weight:400 700;font-display:swap;src:url("/assets/asset-02.woff2") format('woff2');unicode-range:${latin}}
@font-face{font-family:'JetBrains Mono';font-style:normal;font-weight:400 700;font-display:swap;src:url("/assets/asset-08.woff2") format('woff2');unicode-range:${latin}}
@font-face{font-family:'Oswald';font-style:normal;font-weight:300 700;font-display:swap;src:url("/assets/asset-13.woff2") format('woff2');unicode-range:${latin}}
:root{--bg:#070809;--line:rgba(255,255,255,.09);--text:#E9EDF3;--muted:#A9B4C2;--dim:#6b7686;--red:#FF2A1F;--red2:#FF7A6E}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--text);font-family:'DM Sans',system-ui,sans-serif;line-height:1.55;-webkit-font-smoothing:antialiased}
a{color:inherit}
.wrap{max-width:1180px;margin:0 auto;padding:0 clamp(16px,4vw,48px)}
header.top{border-bottom:1px solid var(--line);background:rgba(7,8,9,.92);position:sticky;top:0;z-index:5;backdrop-filter:blur(10px)}
header.top .wrap{display:flex;align-items:center;justify-content:space-between;gap:12px 24px;flex-wrap:wrap;padding-top:14px;padding-bottom:14px}
.brand{display:flex;align-items:center;gap:10px;text-decoration:none}
.brand span{font-family:'Oswald',sans-serif;font-weight:600;font-size:20px;letter-spacing:.04em;text-transform:uppercase}
.brand b{color:#FF5747;font-weight:600}
nav.main{display:flex;flex-wrap:wrap;gap:4px 18px;font-size:14px}
nav.main a{color:var(--muted);text-decoration:none;padding:4px 0}
nav.main a:hover,nav.main a[aria-current]{color:#fff}
nav.main a[aria-current]{box-shadow:inset 0 -2px 0 var(--red)}
.hero{padding:clamp(36px,6vw,72px) 0 8px}
.crumbs{font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--dim);margin:0 0 18px}
.crumbs a{color:#9DB0C4;text-decoration:none}
.eyebrow{font-family:'JetBrains Mono',monospace;font-size:11.5px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--red2)}
h1{font-family:'Oswald',sans-serif;font-weight:600;font-size:clamp(34px,5.5vw,58px);line-height:1.02;letter-spacing:.01em;margin:10px 0 14px;text-transform:uppercase}
.lede{color:var(--muted);font-size:clamp(15.5px,1.6vw,17.5px);max-width:66ch;margin:0}
.jump{display:flex;flex-wrap:wrap;gap:8px;margin:26px 0 0;padding:0;list-style:none}
.jump a{display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border-radius:999px;border:1px solid var(--line);background:rgba(255,255,255,.03);font-size:13.5px;text-decoration:none;color:var(--text)}
.jump a:hover{border-color:rgba(255,255,255,.28)}
.jump b{font-family:'JetBrains Mono',monospace;font-size:11.5px;font-weight:600;color:var(--dim)}
.genre{padding-top:clamp(36px,5vw,56px);scroll-margin-top:70px}
.g-head{display:flex;align-items:baseline;justify-content:space-between;gap:16px;border-bottom:1px solid var(--line);padding-bottom:10px}
h2{font-family:'Oswald',sans-serif;font-weight:600;font-size:clamp(22px,3vw,30px);margin:0;letter-spacing:.02em;text-transform:uppercase}
.count{font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--dim);white-space:nowrap}
.g-blurb{color:var(--dim);font-size:14.5px;margin:10px 0 0}
.frs{list-style:none;margin:18px 0 0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}
.fr{position:relative;padding:18px 18px 16px 20px;border-radius:14px;border:1px solid var(--line);background:linear-gradient(180deg,rgba(18,21,27,.9),rgba(11,13,17,.9));overflow:hidden;display:flex;flex-direction:column;gap:8px}
.fr::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--a)}
.fr:hover{border-color:rgba(255,255,255,.2)}
.fr-top{display:flex;flex-direction:column;gap:2px}
h3{margin:0;font-family:'Oswald',sans-serif;font-weight:600;font-size:19px;letter-spacing:.02em;text-transform:uppercase}
h3 a{text-decoration:none}
h3 a:hover{color:var(--a)}
.meta{font-family:'JetBrains Mono',monospace;font-size:11.5px;color:var(--dim)}
.fr p{margin:0;color:var(--muted);font-size:14px;flex:1}
.links{display:flex;flex-wrap:wrap;gap:6px 16px;margin-top:4px;font-size:13.5px}
.links a{color:#9DB0C4;text-decoration:none;border-bottom:1px solid rgba(157,176,196,.3)}
.links a:hover{color:#fff;border-color:#fff}
.links a.wo{color:var(--text);border-color:var(--a)}
.empty{margin:16px 0 0;padding:16px 18px;border-radius:12px;border:1px dashed var(--line);color:var(--muted);font-size:14.5px}
.empty a,.soon a{color:var(--red2)}
.soon{margin-top:clamp(44px,6vw,72px);padding:22px;border-radius:16px;border:1px solid var(--line);background:rgba(255,255,255,.02)}
.soon h2{font-size:20px}
.soon p{color:var(--dim);font-size:14px;margin:8px 0 14px}
.soon ul{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:8px}
.soon li{font-size:13px;color:var(--muted);padding:5px 11px;border-radius:999px;border:1px solid var(--line)}
footer{margin-top:clamp(48px,7vw,88px);border-top:1px solid var(--line);padding:24px 0 40px;font-family:'JetBrains Mono',monospace;font-size:12px;color:#5e6878}
footer .wrap{display:flex;flex-wrap:wrap;gap:10px 24px;justify-content:space-between}
footer a{color:#5e6878;text-decoration:none}
footer a:hover{color:#A9B4C2}
@media (max-width:560px){.frs{grid-template-columns:1fr}.g-head{flex-wrap:wrap}header.top{position:static}.genre{scroll-margin-top:12px}}
</style>
</head><body>
<header class="top"><div class="wrap">
  <a class="brand" href="/" aria-label="ReelOrder home">${logo}<span>Reel<b>Order</b></span></a>
  <nav class="main" aria-label="Main"><a href="/">Hub</a><a href="/all-franchises" aria-current="page">All franchises</a><a href="/timeline">Timeline</a><a href="/queue">Queue</a><a href="/posters">Poster Shop</a><a href="/contact">Contact</a></nav>
</div></header>
<main class="wrap">
  <div class="hero">
    <p class="crumbs"><a href="/">ReelOrder</a> / All franchises</p>
    <div class="eyebrow">The directory</div>
    <h1>Every movie franchise in order</h1>
    <p class="lede">${total} franchises mapped so far. Pick one to get its release order, chronological order and the order to watch it for the first time${woCount < total ? ' (' + woCount + ' have a full watch order)' : ''}, or open its timeline map to see exactly where the story splits.</p>
    <ul class="jump" aria-label="Jump to a genre">${shown.map((g) => `<li><a href="#${g.id}">${esc(g.label)} <b>${g.list.length || 'soon'}</b></a></li>`).join('')}</ul>
  </div>
${shown.map(section).join('\n')}
${soon.length ? `
  <section class="soon" aria-labelledby="h-soon">
    <h2 id="h-soon">Being mapped next</h2>
    <p>${soon.length} more franchises are lined up. The Queue decides the order: <a href="/queue">vote for the one you want</a>.</p>
    <ul>${soon.map((c) => `<li>${esc(c.title)}</li>`).join('')}</ul>
  </section>` : ''}
</main>
<footer><div class="wrap">
  <span>&copy; 2026 ReelOrder &middot; A fan project &middot; <a href="/privacy">Privacy</a> &middot; <a href="/terms">Terms</a></span>
  <span>Film titles are property of their respective rights holders. Not affiliated with any studio.</span>
</div></footer>
<script>try{if(!localStorage.getItem('reelorder_notrack')){var b=JSON.stringify({p:'/all-franchises',r:document.referrer||''});navigator.sendBeacon?navigator.sendBeacon('/api/hit',new Blob([b],{type:'application/json'})):fetch('/api/hit',{method:'POST',headers:{'Content-Type':'application/json'},body:b,keepalive:true})}}catch(e){}</script>
</body></html>
`;
}
emit('all-franchises.html', directoryPage());

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
  { loc: '/all-franchises', priority: '0.9' },
  { loc: '/print-guide', priority: '0.3' },
  { loc: '/privacy', priority: '0.2' },
  { loc: '/terms', priority: '0.2' },
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
