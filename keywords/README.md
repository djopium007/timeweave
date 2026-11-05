# keywords/

Dated keyword exports used to rank the franchise queue. One CSV per pull, never edited in place.

Columns: keyword, volume (US monthly), kd (Ahrefs Keyword Difficulty 0-100), traffic_potential,
parent_topic, seed (the matching-terms seed it came from), country, source, source_date.

Blank cells = the source did not give that metric. Sources:
- ahrefs-session1-blue-card: figures recorded in Blue task cards from the first Ahrefs session (Oct 2026).
- ahrefs-free-generator: ahrefs.com/keyword-generator (free, top ~100 phrase matches, KD only on some rows).
- ahrefs-ke: Keywords Explorer matching-terms export (full columns) - needs an active plan.

## queue-ranking-<date>.csv

Franchise-level roll-up of the same date's keyword CSV. opportunity_score = volume / (KD + 5);
rows with no KD assume 15 (the horror cluster was recorded as "KD 1-17") and say so in kd_assumed.
Mapped franchises sort to the bottom. Re-run when a fuller export lands.
