---
'praetorium': patch
---

Keep the faction list working when a stale rules object is missing a map. The list builder reads several rules maps to name factions and detachments, and a rules snapshot loaded before one of those maps existed made the reader throw and return an empty list. Each map read now falls back to its plain value rather than failing.
