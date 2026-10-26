# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

- The Expo app in `mobile/` wraps the same web interface; design follows the web, not iOS or Android conventions.

## Users

- Warhammer 40,000 players, most often mid-game on a phone, tracking turns, scoring and casualties or checking a rule between rolls.
- Away from the table: list building, simulation, rules reading; organizers run clubs and tournaments.

## Product Purpose

- Free army builder, combat simulator, battle tracker and rules reference that carries a game from list to final score, with 1v1, 2v1 and 2v2 games against friends, guests or a practice opponent, round-robin club seasons, and tournaments with secretly sealed lists.

## Positioning

- Free and AGPL open source; nothing behind payment.
- One place: builder, simulator, battles, clubs, tournaments and reference share the same rosters and data.
- Social play: friends, clubs, tournaments, guest seats, spectating, public battles, leaderboard.

## Operating Context

- Phones, often one-handed, poor light or connection; works offline once data is downloaded. Desktop for building, simulation and organizing.
- No in-app chat; players use the [Praetorium Discord](https://discord.gg/RFUMZNFwMu).
- [Product design](docs/product-design.md) owns scope and the privacy contract.

## Capabilities and Constraints

- Publish rule names, numbers, costs and computed results from verified community sources (BSData, Game Datacards), never authored rules prose; rules text loads in the reader's browser only on request.
- Report missing or unsupported rules; never guess them.
- Tournaments pair Swiss rounds and clubs run round-robin seasons with round deadlines; out of scope: matchmaking, chat, brackets, game appointments, locations, model positions, battle photos.
- No account needed to watch public battles, read the leaderboard or reference, or try the builder.
- Dark only.

## Brand Commitments

- Praetorium at praetorium.gg; logo `public/logo.svg`.
- Unofficial and not endorsed by Games Workshop, whose marks are theirs; community data attribution stays visible.
- Copy speaks to a player: game task, outcome, next action; no implementation terms ([Interface](docs/development/interface.md#voice-and-copy)).

## Evidence on Hand

- Real data on praetorium.gg; seeded local data from `scripts/seedPreview.ts`.
- No testimonials, quotes, usage figures or press exist; never invent them.

## Product Principles

1. The table comes first: in-game screens work at a glance, one-handed, on a phone.
2. One connected flow: never re-enter data between list, simulation, battle and tournament.
3. Truth over convenience: say plainly what the data does not support.
4. Players own their data: battles and collections are public; each roster's access is the player's choice.
5. No feature is gated behind payment.
