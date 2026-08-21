<div align="center">

# Praetorium

**Build a Warhammer 40,000 army list, then track the game live from every player's phone.**

[praetorium.gg](https://praetorium.gg)

[![Build](https://img.shields.io/github/actions/workflow/status/richardsolomou/praetorium.gg/ci.yml?branch=main)](https://github.com/richardsolomou/praetorium.gg/actions/workflows/ci.yml) [![License](https://img.shields.io/github/license/richardsolomou/praetorium.gg)](LICENSE)

</div>

## Who is it for? 👋

Praetorium is for friends who want one shared battle record instead of paper scores or separate trackers. Connect with another account before starting a private battle, then play 1v1 or put two allied 1,000-point armies against one 2,000-point army in a 2v1 battle.

## How it works ✨

1. **Build or import a list** with its faction, detachments, units, loadouts, enhancements, and points limit. Imports support BattleBase and New Recruit text plus `.ros` and `.rosz` files.
2. **Open a shared, 2v1, or solo practice battle** with its size, mission pack, and saved setup draft.
3. **Attach the lists.** Praetorium derives the mission from their force dispositions and offers matching deployment and terrain data.
4. **Complete battle setup** by choosing formations, deployment, stratagems, mission cards, attacker, and first player.
5. **Play the game** while every screen shows the same round, phase, command points, victory points, and unit state.

Along the way:

- Detachment stratagems include their command-point cost and usage limit.
- Scoring controls use the values defined by each mission card.
- Every seated player can record actions for either side and undo the latest command.
- Finished battles can record a concession, be corrected, or be reopened without rewriting history.
- Saved lists can be reused, copied, printed, and exported as Games Workshop-style text. They stay private unless their owner creates an unlisted sharing link.

## Shared battle state 🔒

Each battle has one append-only command log. The app derives scores, rounds, phases, and unit state from that log instead of storing a second copy.

Each command includes the sequence number that the client last read. The server validates and appends the command in one transaction. If another command arrived first, the client refreshes before it tries again.

The domain rules control which commands each player can send. The server and interface use the same validation function, so visible controls match server enforcement.

Live updates contain only a change notification. The page then uses the normal read path to fetch the current player view.

## Points and legality 🎯

The evaluator reads the community [BSData](https://github.com/BSData/wh40k-11e) catalogues. It calculates points and reports roster violations, including per-copy and per-model costs.

`just points` compares generated rosters with an independent reference dataset. Unsupported catalogue rules are reported instead of guessed.

## Use Praetorium 🚀

The hosted service at [praetorium.gg](https://praetorium.gg) is the primary way to use Praetorium. It includes updates, persistent storage, and the community catalogue sync.

An account stores your lists and battle history. Email and password authentication works without extra configuration or email verification. Google and Discord appear when their credentials are configured.

Praetorium is open source under the AGPL. Experienced operators can run a private instance; see the [self-hosting notes](docs/deployment.md) for its storage and network requirements. **This repository contains no game data.**

## Scope 🚧

Praetorium tracks whether a unit is active or destroyed, but not wounds on individual models. Players choose which mission score applies; the app does not infer objective control. Matchmaking, chat, and other social features are outside the product scope.

## Development 🛠️

Development requires Node 24.x, pnpm 11.15.0, and just 1.58.0. Run `just install && just dev`. See [CONTRIBUTING.md](CONTRIBUTING.md) for checks, [AGENTS.md](AGENTS.md) for architecture rules, and [SECURITY.md](SECURITY.md) for vulnerability reports.

`src/core` holds the domain and stays free of IO: `battle.ts` plays the game, `battleView.ts` decides what each player may see, and `roster.ts` builds a unit from the catalogue. `src/server` loads the community data and exposes it, `src/client` draws it, and `src/routes` stays thin.

## Attribution

Warhammer 40,000 and related marks belong to Games Workshop. Praetorium is unofficial and is not endorsed by Games Workshop. Stratagem and mission data comes from [40kdc-data](https://github.com/tabletop-developer-consortium/40kdc-data) under CC BY 4.0. See [catalogue/README.md](catalogue/README.md) for data sources and licenses.

## License

[GNU Affero General Public License v3.0](LICENSE)
