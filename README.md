# ReelOrder — Movie Timeline Hub

An interactive "timeline wiki" that maps branching movie timelines — sequels, reboots,
time-loops, and multiverse forks — as clean, cinematic branch diagrams.

The site is the self-contained **RealOrder** build: `index.html` is one file with all
franchises embedded (hero, search, franchise grid, per-franchise timeline with a
Rail ⇄ Fork-map toggle, branch filters, and character / item / theme panels).

## Franchises (live)

- **Terminator** — 6 films, 4 branches
- **X-Men** — 13 films, 3 branches (the 1973 Days-of-Future-Past split)
- **Dune** — 16,000-year chronology across 5 epochs
- **Tenet** — 1 film, 4 world-lines through one predestined loop
- **Back to the Future** — 3 films, 4 successive overwrites of one timeline
- **Planet of the Apes** — 9 films, 3 branches (the original loop, Caesar's new lane, and the Simian Flu reboot)
- **Predator** — 9 films, 5 branches (from Prey's 1719 first hunt to Badlands' 25th century)
- **Star Trek** — 13 shows & 14 films, 4 branches (Prime, Kelvin, the "moved" Discovery-era line, and the Mirror Universe)
- **Marvel Cinematic Universe** — 37 films, 5 branches (Sacred Timeline, time-heist splinters, TVA/unbound multiverse, incursions & neighbours, Earth-828)
- **Star Wars** — 12 films & 19 series, 7 canon eras (Dawn of the Jedi → New Jedi Order) plus the Legends continuity as a fork
- **Alien** — 7 films, 1 game & 1 series, 5 branches (Engineers & David, the Company's hunt from Nostromo to Romulus, Ripley's war, Resurrection, and Alien: Earth as a disputed 2120 fork)
- **Transformers** — 8 films, 4 branches (Bay-era deep lore, the 2007–2017 Bay continuity, the Bumblebee/Rise of the Beasts soft reboot, and Transformers One's animated reboot)

## Files

- `index.html` — the deployable RealOrder site (all data embedded). This is the homepage.
- `*-timeline-map.html` — standalone single-franchise map pages (optional, not linked from the hub).
- `realorder.html` — a copy of the RealOrder build.

## Editing / adding a franchise

Each franchise is one object in the `data` map inside the build. Adding a movie = adding
one object (id, title, accent, tagline, blurb, meta, framing, forkLabel, films, branches,
characters, items, themes). Node `type` ∈ event | turning-point | paradox | death |
resolution; tag `kind` maps to a fixed colour.

## Community features (Supabase-backed)

Implements the "Community Features" requirements:

- **The Queue** (nav → Queue): pending franchise maps with ▲/▼ voting. One active vote per
  visitor per project — same direction removes it, opposite switches it — and the list
  re-sorts live by score. Voting works signed-out (device key in localStorage) and follows
  your account after sign-in. Each card has an inline discussion thread.
- **Community tab** on every franchise page (⑃ Branch map / ◉ Community · n): comment feed
  with likes and a composer for signed-in users; sign-in prompt otherwise.
- **Suggest a franchise** at the end of the queue (sign-in required): duplicates are
  blocked with a toast; valid suggestions join the queue as `Suggested` with the
  submitter's upvote pre-applied (score 1).
- **Auth**: Supabase Auth. Email magic link works out of the box; Google / Apple / Facebook
  buttons call `signInWithOAuth` and light up once those providers are configured in the
  Supabase dashboard (Instagram shows a "coming soon" toast — Supabase has no Instagram
  provider). Commenting/suggesting are gated; browsing and voting are not.

## Poster store (Stripe + Supabase Storage)

Route `/posters` (grid) → `/posters/<id>` (mockup gallery + buy panel) → Stripe Checkout →
`/posters/thanks?session_id=…` (download page). Digital-only: the buyer gets a 15-minute signed
URL to the print-ready master; the Stripe session id is the receipt and can re-issue a link any time.

- **Catalog**: `public.posters` (public read, RLS). One row per poster: title, tagline, description,
  `price_cents` (default 1900 = AUD 19), `preview_path`, `mockup_paths[]`, `master_path`,
  `franchise_id` (links to the hub map), `accent`, `sort_order`, `active`.
- **Storage**: bucket `poster-previews` (public: `<slug>/preview.jpg`, `<slug>/mockup-N.jpg`) and
  bucket `poster-masters` (private: `<slug>/<slug>-24x36.jpg`, only ever served via signed URL).
- **Orders**: `public.poster_orders` (service-role only) written by the webhook and the download API.
- **API** (Vercel Node functions in `api/`, deps in `package.json`):
  - `POST /api/checkout {posterId}` → `{url}` (also `GET /api/checkout?poster=<id>` → 303 to Stripe)
  - `GET /api/download?session_id=cs_…` → verifies `payment_status=paid` with Stripe, records the
    order, returns a signed URL (`&redirect=1` to 302 straight to the file)
  - `POST /api/stripe-webhook` → `checkout.session.completed` / async payment / `charge.refunded`
- **Env vars (Vercel → Project → Settings → Environment Variables)**: `STRIPE_SECRET_KEY`,
  `STRIPE_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` (optional: `SUPABASE_URL`, `SITE_URL`).
- **Loading posters**: `SUPABASE_SERVICE_ROLE_KEY=… npm run posters:sync -- "/path/to/Movie Mock ups"`
  (needs `npm install` once; add `--dry` to preview, `--only aliens,rambo` to limit). It uploads the
  `*_24x36.jpg` master, makes a 1200px preview + 1600px mockups, and upserts the `posters` rows.
  Then set tagline / description / price per poster in the Supabase table editor.

Backend: Supabase project `reelorder` (`fqcdslarscuplbdimgzs`, ap-southeast-2). Tables:
`profiles`, `pending_projects`, `votes`, `comments`, `comment_likes`, all with RLS (public
read; comments and suggestions require an authenticated user writing as themselves; votes
and likes are open by design so signed-out visitors can vote). The publishable API key in
`index.html` is safe to ship.

Post-deploy configuration (Supabase dashboard → Authentication):
1. Set **Site URL** (and redirect allow-list) to the production URL so email magic links
   return to the site instead of localhost.
2. Enable Google / Apple / Facebook / X (Twitter) providers (each needs an OAuth app + secret).
   X uses the Supabase `twitter` provider — create an app at the X Developer Portal and paste
   its client ID/secret into Supabase → Authentication → Providers → Twitter.

## Deploy

Pure static HTML — no build step. Hosted on Vercel (`output directory: .`).

## Routing

The hub is a single-page app, but the address bar stays in step with it:

| URL | Screen |
| --- | --- |
| `/` | Hub |
| `/queue` | The Queue |
| `/contribute` | Contribute |
| `/map/<id>` | A franchise map (`/map/alien`, `/map/starwars`, …) |
| `/timeline` | Timeline view, no franchise selected |

`history.pushState` drives it, `popstate` handles back/forward, and `document.title`
follows the screen. `vercel.json` rewrites those paths to `/index.html` so deep links
survive a refresh — every other path still resolves to a real file first (the standalone
`*-timeline-map.html` exports, `privacy.html`, `terms.html`, `assets/*`).

Two things to keep in mind when editing `index.html`:

- **Asset URLs must be root-relative** (`/assets/…`). A relative `assets/…` breaks at
  `/map/alien`, where the browser resolves it to `/map/assets/…`.
- **OAuth returns to `/`.** `signInWithOAuth` stashes the current path in
  `sessionStorage.reelorder_route` and redirects to the origin, so only the bare site URL
  needs to be in Supabase's redirect allow-list; `initRouting()` restores the path on load.

## The Queue

Rows come from the `pending_projects` table. A row whose `id` matches a key in `data`
(i.e. the map is live) renders as **Mapped** with an "Open the map →" button and sorts
below the pending ones — voters can see their picks actually shipped. `status` accepts
`Mapped | Mapping now | In review | Queued | Suggested`. When a franchise goes live,
set its row to `Mapped` rather than deleting it, so its vote count survives.
