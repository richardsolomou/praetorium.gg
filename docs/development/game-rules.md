# Stratagems, missions, and scoring

Praetorium reads structured stratagem and mission data from [40kdc-data](https://github.com/tabletop-developer-consortium/40kdc-data) under CC BY 4.0. Descriptions come from Wahapedia's data export. The attribution assembled in `src/server/rules.ts` must appear wherever the app shows this data.

## Rules data

- Players choose stratagems, missions, secondaries, and loadouts from fetched data. Do not replace a missing data field with free text.
- An unknown stratagem timing maps to `unlimited`. Do not invent a usage limit.
- Phase and player-turn restrictions are enforced only when the synced source supplies them. Missing timing remains unrestricted.
- A pasted roster has no structured faction or detachment. It cannot provide catalogue-backed stratagems or mission cards.
- `set-prep` stores stratagems and secondaries in one command. Splitting the action would make the second command stale.
- Tactical setup stores the configured deck with the initially drawn cards. Remaining cards are derived from that deck and its history; a replacement cannot name a card outside an authoritative deck.
- King of the Colosseum lasts three rounds and requires tactical secondaries. Its 2.0 battlefield and twists remain absent until an upstream source supplies the current structured data; do not expose the older 9-inch deployment as the prototype's 8-inch deployment.

## Scoring

- Use each card's award values for scoring controls. Use `FALLBACK_AWARDS` only when the source has no award data.
- Show mission scoring caps as guidance. Do not reject a score that exceeds them.
- Prompt before passing a turn with an unresolved active card, but leave the final decision to the player because the source cannot infer objective control.
- Derive the mission from both rosters' force dispositions and the configured mission pack in `PraetoriumService.screen`. Old logs without a pack retain the unqualified matchup fallback; a selected modern pack must never fall through to another pack.
- Validate mission, deployment, and terrain references together inside the repository submission transaction before beginning play. Twists remain absent when the source has no structured twist data.

## Deployment patterns

Deployment-zone points are relative to each zone's position. Apply the zone offset before drawing each point. Measure the drawing area from the pattern instead of assuming a board size.
