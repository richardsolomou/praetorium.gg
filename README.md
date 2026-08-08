<div align="center">

# Praetorium

**Build a Warhammer 40,000 army list, then track the game live from both players' phones.**

[praetorium.gg](https://praetorium.gg)

[![Build](https://img.shields.io/github/actions/workflow/status/richardsolomou/praetorium.gg/ci.yml?branch=main)](https://github.com/richardsolomou/praetorium.gg/actions/workflows/ci.yml) [![License](https://img.shields.io/github/license/richardsolomou/praetorium.gg)](LICENSE)

</div>

## Who is it for? 👋

Praetorium is for two players who want one shared battle record instead of paper scores or separate trackers. Open a battle, send the link, and your opponent signs in to take the second seat.

## How it works ✨

1. **Build or import a list** with its faction, detachments, units, loadouts, enhancements, and points limit. Imports support `.ros` and `.rosz` files from New Recruit and BattleScribe.
2. **Attach both lists.** Praetorium derives the mission from their force dispositions.
3. **Complete battle setup** by choosing the battlefield, deployment, stratagems, mission cards, and first player.
4. **Play the game** while both screens show the same round, phase, command points, victory points, and unit state.

Along the way:

- Detachment stratagems include their command-point cost and usage limit.
- Scoring controls use the values defined by each mission card.
- A player can undo their latest command.
- Saved lists can be reused, shared, and exported as `.ros` files.

## Shared battle state 🔒

Each battle has one append-only command log. The app derives scores, rounds, phases, and unit state from that log instead of storing a second copy.

Each command includes the sequence number that the client last read. The server validates and appends the command in one transaction. If another command arrived first, the client refreshes before it tries again.

The domain rules control which commands each player can send. The server and interface use the same validation function, so visible controls match server enforcement.

Live updates contain only a change notification. The page then uses the normal read path to fetch the current player view.

## Points and legality 🎯

The evaluator reads the community [BSData](https://github.com/BSData/wh40k-11e) catalogues. It calculates points and reports roster violations, including per-copy and per-model costs.

`just points` compares generated rosters with the Munitorum Field Manual. It currently agrees on **99.6% of 1,863 checks**. The remaining differences come from four Deathwatch datasheets with older upstream catalogue prices. Unsupported catalogue rules are reported instead of guessed.

## Run it 🚀

```sh
cp .env.example .env
docker compose up -d
```

The container uses one `/data` volume and runs as one instance. It fetches community data in the background and can serve battles during the first sync. **This repository contains no game data.** See [the deployment guide](docs/deployment.md) for storage, backups, and reverse proxy setup.

An account stores your lists and battle history. Email and password works without extra configuration or email verification. Google and Discord appear when their credentials are configured.

## Scope 🚧

Praetorium tracks whether a unit is active or destroyed, but not wounds on individual models. Players choose which mission score applies; the app does not infer objective control. Matchmaking, chat, and other social features are outside the product scope.

## Development 🛠️

Development requires Node 24.x, pnpm 11.15.0, and just. Run `just install && just dev`. See [CONTRIBUTING.md](CONTRIBUTING.md) for checks, [AGENTS.md](AGENTS.md) for architecture rules, and [SECURITY.md](SECURITY.md) for vulnerability reports.

## Attribution

Praetorium is an unofficial product, and is not in any way affiliated with or endorsed by Games Workshop. Stratagem and mission data comes from [40kdc-data](https://github.com/tabletop-developer-consortium/40kdc-data) under CC BY 4.0; see [catalogue/README.md](catalogue/README.md) for every source and its licence.

## License

[GNU Affero General Public License v3.0](LICENSE)
