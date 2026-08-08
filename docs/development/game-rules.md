# Stratagems, missions, and scoring

Praetorium reads structured stratagem and mission data from [40kdc-data](https://github.com/tabletop-developer-consortium/40kdc-data) under CC BY 4.0. Descriptions come from Wahapedia's data export. The attribution assembled in `src/server/rules.ts` must appear wherever the app shows this data.

## Rules data

- Players choose stratagems, missions, secondaries, and loadouts from fetched data. Do not replace a missing data field with free text.
- An unknown stratagem timing maps to `unlimited`. Do not invent a usage limit.
- A pasted roster has no structured faction or detachment. It cannot provide catalogue-backed stratagems or mission cards.
- `set-prep` stores stratagems and secondaries in one command. Splitting the action would make the second command stale.

## Scoring

- Use each card's award values for scoring controls. Use `FALLBACK_AWARDS` only when the source has no award data.
- Show mission scoring caps as guidance. Do not reject a score that exceeds them.
- Derive the mission from both rosters' force dispositions in `PraetoriumService.screen`. Do not store a separate mission value.

## Deployment patterns

Deployment-zone points are relative to each zone's position. Apply the zone offset before drawing each point. Measure the drawing area from the pattern instead of assuming a board size.
