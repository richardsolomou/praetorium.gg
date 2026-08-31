<div align="center">

<img src="public/logo.svg" width="96" height="96" alt="Praetorium logo">

# Praetorium

Build a Warhammer 40,000 army list. Track the battle live from each player's phone.

[praetorium.gg](https://praetorium.gg)

[![Build](https://img.shields.io/github/actions/workflow/status/richardsolomou/praetorium.gg/ci.yml?branch=main)](https://github.com/richardsolomou/praetorium.gg/actions/workflows/ci.yml) [![License](https://img.shields.io/github/license/richardsolomou/praetorium.gg)](LICENSE)

</div>

## Product

Praetorium is free and open source. It supports games between up to four friends: 1v1, 2v1, or 2v2 Doubles. Every instance also seats practice opponents, so you can play a full battle through on your own. The home page shows the battles being played right now, so there is something to watch before there is something to play.

Players can:

- Build, import, save, share, print, and export army lists.
- Run public or private league events with approved entry, sealed roster submission, organizer-controlled reveal, and reusable event history.
- Follow live or finished battles with their frozen rosters and battle history, without taking a seat.
- Choose who can watch their battles: anyone, their friends, or only the players at the table.
- See who is winning overall or with a given faction, and a home page of the battles being played now.
- Use faction, detachment, unit, loadout, enhancement, and points data from community catalogues.
- Configure missions, deployment, terrain, formations, stratagems, and mission cards.
- Track rounds, phases, command points, victory points, and each unit's models, wounds and losses.
- Review and correct a finished battle without deleting its history.

The app stores one append-only command log for each battle. It derives the current state from that log. The server validates every command before it appends it.

## Scope

Praetorium does not provide matchmaking, chat, tournament pairings, or a rules encyclopedia. An account is required to play, though not to watch a public battle or read the leaderboard.

This repository contains no game data. Each instance downloads verified snapshots from the configured community sources.

## Use

[praetorium.gg](https://praetorium.gg) is the supported service. It includes catalogue updates and persistent storage.

Self-hosting is available for experienced operators. See [Self-hosting](docs/deployment.md).

## Development

Development requires Node 24.x, pnpm 11.15.0, and just 1.58.0.

```sh
just install
just catalogue-sync
just dev
```

Run `just check` before you submit a change. Read [CONTRIBUTING.md](CONTRIBUTING.md) for setup and test details. Read [AGENTS.md](AGENTS.md) for architecture rules.

## Architecture

- `src/core` contains the IO-free battle, catalogue, and roster domain.
- `src/db` contains the Postgres schema and Drizzle repository.
- `src/server` contains authentication, application services, catalogue loading, and server functions.
- `src/client` contains React components, hooks, and queries.
- `src/routes` contains thin TanStack Router route files.

## Data and trademarks

Catalogue definitions come from [BSData](https://github.com/BSData/wh40k-11e). Rules data comes from [40kdc-data](https://github.com/tabletop-developer-consortium/40kdc-data) under CC BY 4.0. See [catalogue/README.md](catalogue/README.md) for all sources and licenses.

Warhammer 40,000 and related marks belong to Games Workshop. Praetorium is unofficial and is not endorsed by Games Workshop.

Praetorium is licensed under the [GNU Affero General Public License v3.0](LICENSE).
