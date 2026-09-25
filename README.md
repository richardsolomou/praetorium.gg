<div align="center">

<img src="public/logo.svg" width="96" height="96" alt="Praetorium logo">

# Praetorium

Warhammer 40,000 army building and game tracking, from setup to final score.

[praetorium.gg](https://praetorium.gg)

[![Build](https://img.shields.io/github/actions/workflow/status/richardsolomou/praetorium.gg/ci.yml?branch=main)](https://github.com/richardsolomou/praetorium.gg/actions/workflows/ci.yml) [![License](https://img.shields.io/github/license/richardsolomou/praetorium.gg)](LICENSE)

</div>

## Product

Praetorium is a free, open source Warhammer 40,000 army builder and battle tracker. Build and share lists, browse the community catalogue, and compare units in the combat simulator. Play 1v1, 2v1, or 2v2 games with friends, or run a practice game. Track setup, turns, scoring, and casualties.

Anyone can watch public battles and see the leaderboard. Players can control who sees their battles and run league events with sealed rosters.

## Scope

Praetorium does not provide matchmaking, chat, tournament pairings, or a rules encyclopedia. An account is required to play or to keep a list, though not to watch a public battle, read the leaderboard, or try the roster builder.

This repository contains no game data. Each instance downloads verified snapshots from the configured community sources.

## Use

[praetorium.gg](https://praetorium.gg) is the supported service and the easiest way to use Praetorium. It keeps the community rules data current and saves your rosters and battles.

Self-hosting is available for experienced operators. See [Self-hosting](docs/deployment.md).

## Development

See [Contributing](CONTRIBUTING.md) to run the app and its checks, [Architecture](docs/development/architecture.md) for code placement, and [AGENTS.md](AGENTS.md) for coding-agent rules.

## Data and trademarks

Catalogue definitions come from [BSData](https://github.com/BSData/wh40k-11e). Rules data comes from [40kdc-data](https://github.com/tabletop-developer-consortium/40kdc-data) under CC BY 4.0. See [catalogue/README.md](catalogue/README.md) for all sources and licenses.

Warhammer 40,000 and related marks belong to Games Workshop. Praetorium is unofficial and is not endorsed by Games Workshop.

Praetorium is licensed under the [GNU Affero General Public License v3.0](LICENSE).
