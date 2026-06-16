# TimeWeave — Movie Timeline Hub

An interactive "timeline wiki" that maps branching movie timelines — sequels, reboots,
time-loops, and multiverse forks — as clean, cinematic branch diagrams.

**Live:** https://timeweave-three.vercel.app

## What's here

| File | Description |
|------|-------------|
| `index.html` | The hub — hero, search, featured maps, franchise grid, contribute CTA. Links to every map. |
| `terminator-timeline-map.html` | Terminator — 6 films, 4 branches. |
| `xmen-timeline-map.html` | X-Men — 13 films, 3 branches (the 1973 Days-of-Future-Past split). |
| `dune-timeline.html` | Dune — 16,000-year chronology across 5 epochs. |
| `tenet-timeline-map.html` | Tenet — 1 film, 4 world-lines through one predestined loop. |
| `timeweave.html` | The polished single-file "TimeWeave" build with all 4 franchises embedded. |

## How it works

Every map is generated from a single JSON dataset per franchise, so **adding a new
movie = adding one data file** — no layout changes. Branches carry a colour and a film
list; nodes use a type (`event` / `turning-point` / `paradox` / `death` / `resolution`)
and colour-coded tags. Characters, key items/tech, and recurring themes render in side
panels.

## Deploy

Pure static HTML — no build step. Hosted on Vercel; any static host works
(`output directory: .`).
