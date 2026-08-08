<div align="center">

# Praetorium

**Build a Warhammer 40,000 army list, then track the game you play with it — both players on their own phone, in step, with no way for the two devices to disagree.**

[praetorium.gg](https://praetorium.gg)

[![Build](https://img.shields.io/github/actions/workflow/status/richardsolomou/praetorium.gg/ci.yml?branch=main)](https://github.com/richardsolomou/praetorium.gg/actions/workflows/ci.yml) [![License](https://img.shields.io/github/license/richardsolomou/praetorium.gg)](LICENSE)

</div>

## Who is it for? 👋

Two people at a table who currently keep score on paper, or in a builder that does not follow them into the game. Open a battle, send your opponent the link, and they take the second seat. No account needed.

## How it works ✨

1. **Build a list** from the community catalogues — faction, detachment, squad sizes, weapon loadouts, enhancements, against a game-size points ceiling. Or paste one, or import a `.ros`/`.rosz` from New Recruit or BattleScribe.
2. **Both players attach a list**, and the mission follows from the pair of them: eleventh edition takes it from the two force dispositions rather than asking.
3. **Set up in the order the game does** — battlefield, deployment, stratagems and mission cards, then who takes the first turn.
4. **Play.** Round, phase, command points, victory points and which units are still standing, on both screens at once.

Along the way:

- Stratagems arrive already chosen for your detachment, with the cost and usage limit the data states.
- Scoring offers the figure the card actually pays — `+3 ea`, not a blank stepper.
- Undo reaches exactly one command, the newest, and only for whoever issued it.
- Lists are saved and reused between battles, and export as `.ros` for a tournament organiser.

## Why it cannot go out of step 🔒

There is one authoritative history per battle: an append-only log of commands. Nothing derived is stored, so there is no second copy of the score to disagree with the first — both devices fold the same log and arrive at the same numbers.

Every command is conditional. A client sends the sequence number of the history it is showing, and the server appends only if nothing has happened since. Reading history, judging the command against the rules, and writing the result happen inside one transaction, so two players tapping at the same instant cannot both win: the second is told it is behind and refetches.

Ownership comes from the rules rather than from the interface. Only the player taking a turn can end a phase; only the player who spent a command point can spend it. All of that lives in one function that both the server and the interface consult, so the buttons you are offered and the commands the server will accept cannot drift apart.

Live updates carry nothing at all. The event stream says only "this battle changed"; the page then refetches through the normal read path, which is the only place that decides what a player may see.

## Points, honestly 🎯

The evaluator reads the community [BSData](https://github.com/BSData/wh40k-11e) catalogues: give it what a player picked and it returns the cost and what is illegal about it, including the per-copy and per-model pricing eleventh edition uses.

It is checked against Games Workshop's own numbers rather than against itself. `just points` builds real units at the model counts the Munitorum Field Manual prices and compares: **it agrees on 99.6% of 1,863 checks**. The seven remaining differences are four Deathwatch datasheets whose catalogue still carries older prices upstream. Anything it does not understand stays visible instead of becoming a guess — a confidently wrong points total is worse than an honest gap.

## Run it 🚀

```sh
cp .env.example .env
docker compose up -d
```

One container, one `/data` volume, one instance. It fetches its own community data in the background and serves battles while it does — there is nothing to run by hand, and **no game data is in this repository**. See [docs/deployment.md](docs/deployment.md) for what lands in the volume, what to back up, and why it stays at one replica.

An account is your player: your lists, the battles you have played and the ones still going follow you to whatever device you pick up, and nothing depends on a cookie surviving. Email and password works with no configuration and needs no inbox — there is no verification step to stall a first game. Google and Discord appear only when both halves of their credentials are set.

## Not here yet 🚧

No wound tracking within a unit — a unit is standing or lost. No automatic primary scoring from objectives held: the app offers the figure the card pays and you say which applied. Finding opponents, chat, and anything else social are deliberately out of scope.

## Development 🛠️

Node 24.x, pnpm 11.15.0 and just. `just install && just dev` is the whole setup; the rest is in [CONTRIBUTING.md](CONTRIBUTING.md), the design rules are in [CLAUDE.md](CLAUDE.md), and [SECURITY.md](SECURITY.md) covers vulnerability reports.

## Attribution

Praetorium is an unofficial product, and is not in any way affiliated with or endorsed by Games Workshop. Stratagem and mission data comes from [40kdc-data](https://github.com/tabletop-developer-consortium/40kdc-data) under CC BY 4.0; see [catalogue/README.md](catalogue/README.md) for every source and its licence.

## License

[GNU Affero General Public License v3.0](LICENSE)
