# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

The Expo app in `mobile/` is a native shell around the same web interface, so design follows the web rather than iOS or Android conventions. [Mobile](docs/development/mobile.md) owns the shell boundaries.

## Users

Warhammer 40,000 players, most often at the gaming table on a phone: mid-game, tracking turns, scoring and casualties between dice rolls, and checking a rule or a combat estimate while the opponent waits. The same players also build and tune lists, run simulations and read rules away from the table, and organizers run leagues for their group.

## Product Purpose

Praetorium is a free army builder, combat simulator, battle tracker and rules reference for Warhammer 40,000. It carries a game from list to final score: build and share a list, compare units, play 1v1, 2v1 or 2v2 games with friends, guests or a practice opponent, track setup, turns, scoring and casualties, and run leagues where everyone seals a list in secret. Success is a player reaching for it at the table instead of paper, spreadsheets or several separate apps.

## Positioning

- **Free and open source:** nothing is behind a paywall or subscription; the source is AGPL and open to inspection and contribution.
- **One place, list to score:** the builder, simulator, battle tracker, leagues and rules reference share the same rosters and data, so a list flows straight into a simulation, a battle or a league.
- **Social play:** friends, leagues with sealed lists, guest seats, spectating, public battles and a leaderboard are built around real games between real people.

## Operating Context

- Phones held at the table, often one-handed, glanced at between rolls, sometimes in poor light or with an unreliable connection; the app works offline once its data is downloaded.
- Desktop for list building, simulation and league organizing.
- Players talk on the [Praetorium Discord](https://discord.gg/RFUMZNFwMu); the app has no chat.
- [Product design](docs/product-design.md) owns scope and the privacy contract; the development guides own implementation.

## Capabilities and Constraints

- Rules data comes from verified community sources (BSData catalogues, Game Datacards rules and missions). The product publishes rule names, numbers, costs and computed results, never rules prose it wrote itself; rules text loads in the reader's browser only when they choose to load it.
- Calculations, legality and pricing come from that data. Missing or unsupported rules are reported to the player, never guessed or reconstructed from memory.
- Out of scope: matchmaking, chat, tournament pairings, brackets, schedules, locations, model positions and battle photos.
- An account is needed to play or keep a list, but not to watch a public battle, read the leaderboard or rules reference, or try the roster builder.
- The interface is dark only.

## Brand Commitments

- Name: Praetorium, at praetorium.gg, with the logo at `public/logo.svg`.
- Unofficial and not endorsed by Games Workshop; Warhammer 40,000 and related marks belong to Games Workshop, and attribution to community data sources stays visible.
- Copy speaks to a player: it names the game task, outcome and next action, and keeps implementation terms out ([Interface](docs/development/interface.md#voice-and-copy)).

## Evidence on Hand

- Real rosters, battles, leagues and the leaderboard on praetorium.gg, plus seeded preview data for local development (`scripts/seedPreview.ts`).
- No testimonials, customer quotes, usage figures or press are recorded in the repository; future work must not invent them.

## Product Principles

1. The table comes first: anything used during a game must work at a glance, one-handed, on a phone.
2. One connected flow: a list, a simulation, a battle and a league share the same data, and moving between them never means re-entering it.
3. Truth over convenience: show what the community data supports and say plainly what it does not.
4. Players own their data: battles and collections are public, and each roster's access is the player's choice.
5. Free for everyone: no feature is gated behind payment.
