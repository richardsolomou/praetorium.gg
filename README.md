<div align="center">

<img src="public/logo.svg" width="96" height="96" alt="Praetorium logo">

# Praetorium

Warhammer 40,000 army building and game tracking, from setup to final score.

[praetorium.gg](https://praetorium.gg/?utm_source=github&utm_medium=profile&utm_campaign=readme) · [Discord](https://discord.gg/RFUMZNFwMu)

[![Build](https://img.shields.io/github/actions/workflow/status/richardsolomou/praetorium.gg/ci.yml?branch=main)](https://github.com/richardsolomou/praetorium.gg/actions/workflows/ci.yml) [![License](https://img.shields.io/github/license/richardsolomou/praetorium.gg)](LICENSE)

</div>

## Product

Praetorium is a free, open source Warhammer 40,000 army builder and battle tracker. Build and share lists, browse the community catalogue, and compare units in the combat simulator. Play 1v1, 2v1, or 2v2 games with friends, or run a practice game. Track setup, turns, turn times, scoring, and casualties.

Anyone can watch battles and see the leaderboard. Groups keep a running leaderboard for people who play together, and tournaments have everyone seal a list in secret before playing from a shared results table, in open play or Swiss rounds.

## Scope

Praetorium does not provide matchmaking, chat, or rules written by this project. An account is required to start a battle or to keep a list, though not to play as an invited guest, watch a battle, read the leaderboard, or try the roster builder.

This repository contains source pins and authored correction patches in `catalogue/`, but no fetched upstream catalogues, copied rules prose, or generated snapshots. The service uses verified snapshots from the configured community sources.

## Use

[praetorium.gg](https://praetorium.gg/?utm_source=github&utm_medium=profile&utm_campaign=readme) is the supported service and the easiest way to use Praetorium. It keeps the community rules data current and saves your rosters and battles.

The public reference is available without an account: [faction datasheets](https://praetorium.gg/factions?utm_source=github&utm_medium=profile&utm_campaign=readme), [missions](https://praetorium.gg/missions?utm_source=github&utm_medium=profile&utm_campaign=readme), and [rules](https://praetorium.gg/rules?utm_source=github&utm_medium=profile&utm_campaign=readme). Each page reads the service's verified community data snapshot.

The [docs](https://praetorium.gg/docs?utm_source=github&utm_medium=profile&utm_campaign=readme) explain how to use each part of Praetorium.

The source is open so anyone can inspect the product and contribute to it. [Contributing](CONTRIBUTING.md) covers running a local development copy.

## Development

See [Contributing](CONTRIBUTING.md) to run the app and its checks, [Architecture](docs/development/architecture.md) for code placement, and [AGENTS.md](AGENTS.md) for coding-agent rules.

## Data and trademarks

Catalogue definitions come from [BSData](https://github.com/BSData/wh40k-11e). Rules and mission data come from [Game Datacards](https://github.com/game-datacards/datasources). See [`catalogue/sources.json`](catalogue/sources.json) for all sources.

Warhammer 40,000 and related marks belong to Games Workshop. Praetorium is unofficial and is not endorsed by Games Workshop.

Praetorium is licensed under the [GNU Affero General Public License v3.0](LICENSE).
