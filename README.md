<div align="center">

<img src="public/logo.svg" width="96" height="96" alt="Praetorium logo">

# Praetorium

Warhammer 40,000 army building and game tracking, from setup to final score.

[praetorium.gg](https://praetorium.gg)

[![Build](https://img.shields.io/github/actions/workflow/status/richardsolomou/praetorium.gg/ci.yml?branch=main)](https://github.com/richardsolomou/praetorium.gg/actions/workflows/ci.yml) [![License](https://img.shields.io/github/license/richardsolomou/praetorium.gg)](LICENSE)

</div>

## Product

Praetorium is a Warhammer 40,000 army builder and battle tracker. It supports 1v1, 2v1, and 2v2 games between friends, plus practice games for one player. Mission choice, setup, turns, command points, scoring, and casualties are all part of the tracked game. Public live and finished battles appear on the home page for anyone who wants to follow along.

Praetorium is free to use and open source.

Players can:

- Build, import, save, share, print, and export army lists.
- Browse factions, detachments, datasheets, loadouts, enhancements, and points.
- Set up missions, deployment, terrain, formations, stratagems, and mission cards.
- Play 1v1, 2v1, and 2v2 games with friends or practise on your own.
- Track rounds, phases, command points, victory points, models, wounds, and losses.
- Watch live or finished public battles without joining the game.
- Choose whether anyone, friends, or only the players at the table can watch your battles.
- Run public or private league events with registration, sealed rosters, and organizer-controlled reveal.
- Review and correct a finished battle without losing its history.

## Scope

Praetorium does not provide matchmaking, chat, rankings, standings, or tournament pairings, nor a rules encyclopedia. An account is required to play, though not to watch a public battle.

This repository contains no game data. Each instance downloads verified snapshots from the configured community sources.

## Use

[praetorium.gg](https://praetorium.gg) is the supported service and the easiest way to use Praetorium. It keeps the community rules data current and saves your rosters and battles.

Self-hosting is available for experienced operators. See [Self-hosting](docs/deployment.md).

## Development

Development requires Node 24.x, pnpm 11.15.0, and just 1.58.0.

```sh
just install
just catalogue-sync
just dev
```

`just check` is the local change gate. [CONTRIBUTING.md](CONTRIBUTING.md) covers setup and tests, while [AGENTS.md](AGENTS.md) records the architecture rules used by coding agents.

## Architecture

- Each battle is stored as an append-only command log. The current score, round, phase, and other state are derived from that history, and every command is validated before it is added.
- `src/core` contains the IO-free battle, catalogue, and roster domain.
- `src/db` contains the Postgres schema and Drizzle repository.
- `src/server` contains authentication, application services, catalogue loading, and server functions.
- `src/client` contains React components, hooks, and queries.
- `src/routes` contains thin TanStack Router route files.

## Data and trademarks

Catalogue definitions come from [BSData](https://github.com/BSData/wh40k-11e). Rules data comes from [40kdc-data](https://github.com/tabletop-developer-consortium/40kdc-data) under CC BY 4.0. See [catalogue/README.md](catalogue/README.md) for all sources and licenses.

Warhammer 40,000 and related marks belong to Games Workshop. Praetorium is unofficial and is not endorsed by Games Workshop.

Praetorium is licensed under the [GNU Affero General Public License v3.0](LICENSE).
