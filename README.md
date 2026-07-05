# ReelOrder — Movie Timeline Hub

An interactive "timeline wiki" that maps branching movie timelines — sequels, reboots,
time-loops, and multiverse forks — as clean, cinematic branch diagrams.

The site is the self-contained **ReelOrder** build: `index.html` is one file with all
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

## Files

- `index.html` — the deployable ReelOrder site (all data embedded). This is the homepage.
- `*-timeline-map.html` — standalone single-franchise map pages (optional, not linked from the hub).
- `reelorder.html` — a copy of the ReelOrder build.

## Editing / adding a franchise

Each franchise is one object in the `data` map inside the build. Adding a movie = adding
one object (id, title, accent, tagline, blurb, meta, framing, forkLabel, films, branches,
characters, items, themes). Node `type` ∈ event | turning-point | paradox | death |
resolution; tag `kind` maps to a fixed colour.

## Deploy

Pure static HTML — no build step. Hosted on Vercel (`output directory: .`).
