# keywords/

Dated keyword exports used to rank the franchise queue. One CSV per pull, never edited in place.

Columns: keyword, volume (US monthly), kd (Ahrefs Keyword Difficulty 0-100), traffic_potential,
parent_topic, seed (the matching-terms seed it came from), country, source, source_date.

Blank cells = the source did not give that metric. Sources:
- ahrefs-session1-blue-card: figures recorded in Blue task cards from the first Ahrefs session (Oct 2026).
- ahrefs-free-generator: ahrefs.com/keyword-generator (free, top ~100 phrase matches, KD only on some rows).
- ahrefs-ke-matching-terms-phrase: Keywords Explorer matching-terms via the API connector (phrase mode, US, volume >= 200, top 100 per seed; ~32 units/row).
- ahrefs-ke-overview: Keywords Explorer overview for hand-picked '<franchise> timeline' / 'chronological order' variants (~32 units/row).

2026-11-06 pull: 250 rows, ~11,300 units of the 200,000/month Lite allowance. The bare 'timeline' seed is useless (sports fixtures dominate), so timeline variants are pulled per franchise via overview instead.

## 2026-11-06 pull (ahrefs-ke, full columns)

243 rows from Keywords Explorer matching-terms, US, phrase mode, volume >= 200, top 100 per seed:
'movies in order' (100), 'watch order' (100), 'timeline' (43, filtered to film/TV franchises - the raw pull
was polluted with sports fixtures). Cost: ~9,600 units (32 units/row). Not in this pull: 'chronological order'
seed (returned nothing in terms mode) - use the 'timeline' rows as the proxy.

Anime DR test (2026-11-06) PASSED: suggestionlabs.com (DR 4) ranks #8 for 'demon slayer watch order' with ~265
visits/mo; scrmbl.com (DR 32) #5 for 'evangelion watch order' with ~945. Anime rows are therefore ranked as
'Anime (DR test passed)' rather than gated.

## queue-ranking-<date>.csv

Franchise-level roll-up of the same date's keyword CSV. From 2026-11-06: head_keyword = highest-volume keyword in the cluster, cluster_volume = sum of all variants, opportunity_score = cluster_volume / (head KD + 5);
rows with no KD assume 15 (the horror cluster was recorded as "KD 1-17") and say so in kd_assumed.
Mapped franchises sort to the bottom. Re-run when a fuller export lands.

From 2026-11-06 the roll-up groups every keyword in the CSV by franchise (regex map in the build script),
sums volume across variants ('movies in order' + 'watch order' + 'timeline'), and uses the KD of the
franchise's highest-volume keyword. Extra columns: top_keyword, top_keyword_volume. Status buckets:
Unmapped > In ToDo folder > Anime (DR test passed) > TV / non-film (out of scope) > Mapped (live).
