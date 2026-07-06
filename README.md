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

Backend: Supabase project `reelorder` (`fqcdslarscuplbdimgzs`, ap-southeast-2). Tables:
`profiles`, `pending_projects`, `votes`, `comments`, `comment_likes`, all with RLS (public
read; comments and suggestions require an authenticated user writing as themselves; votes
and likes are open by design so signed-out visitors can vote). The publishable API key in
`index.html` is safe to ship.

Post-deploy configuration (Supabase dashboard → Authentication):
1. Set **Site URL** (and redirect allow-list) to the production URL so email magic links
   return to the site instead of localhost.
2. Enable Google / Apple / Facebook providers (each needs an OAuth app + secret).

## Deploy

Pure static HTML — no build step. Hosted on Vercel (`output directory: .`).
