# Muster

Two people play a game of Warhammer 40,000 and both watch the same screen — round, phase, command points, victory points — on their own phone, in step, with no way for the two devices to disagree.

Open a battle, send your opponent the link, and they take the second seat. No account needed.

## Why it cannot go out of step

There is one authoritative history per battle: an append-only log of commands. Nothing derived is stored, so there is no second copy of the score to disagree with the first — both devices fold the same log and arrive at the same numbers.

Every command is conditional. A client sends the sequence number of the history it is currently showing, and the server appends only if nothing has happened since. Reading history, judging the command against the rules, and writing the result all happen inside one transaction, so two players tapping at the same instant cannot both win: the second one is told it is behind and refetches.

Ownership comes from the rules rather than from the UI. Only the player taking a turn can end a phase, only the player who spent a command point can spend it, and undo reaches exactly one command — the newest one, and only for whoever issued it. All of that lives in one function that both the server and the interface consult, so the buttons you are offered and the commands the server will accept can never drift apart.

Live updates carry nothing. The event stream says only "this battle changed"; the page then refetches through the normal read path, which is the only place that decides what a player may see.

## Running it

```sh
pnpm install
mkdir -p data-dev
pnpm catalogue:sync                      # optional: enables list building
CATALOGUE_DIR=./catalogue-data DATA_DIR=./data-dev pnpm dev
```

Then `pnpm check` before pushing, and `pnpm test:e2e` to drive two real browsers against a production build.

## Deploying

One container, one `/data` volume, one instance. Live updates fan out inside the process, so a second replica would serve battles that never hear about each other's commands — scaling out means moving the fan-out to the database first.

```sh
cp .env.example .env
docker compose up -d
```

`/data` holds the SQLite database and the generated `auth.secret` that signs guest cookies. Back them up together.

## Reading army lists

There is an evaluator over the community [BSData](https://github.com/BSData/wh40k-11e) catalogues in `src/core/evaluate.ts`: give it what a player picked and it returns the points and what is illegal about it. It understands the parts of the format that legality and cost depend on — constraints, modifiers, conditions, repeats, and the per-copy and per-model pricing 11th edition uses.

It is checked against Games Workshop's own numbers rather than against itself. `pnpm catalogue:points` builds real units at the model counts the Munitorum Field Manual prices and compares: **it agrees on 97.4% of 1,548 checks**. Everything it does not understand it reports instead of guessing, because a confidently wrong points total is worse than an honest gap.

See [catalogue/README.md](catalogue/README.md) for where the data comes from and why none of it is in this repository.

## Not here yet

Lists are built from the catalogue with a detachment, squad sizes, weapon loadouts and a game-size points ceiling.

Enhancements are the known gap. The machinery is there — options are read from the datasheet, and campaign-only content is correctly hidden — but a detachment's own enhancements do not yet surface, so a list cannot take one. Nothing about missions or stratagems is here either. An instance with no catalogue synced simply offers pasting instead and says nothing about it.

No mission or stratagem logic, no enhancements, no deployment tracking, no saved lists to reuse between battles. Victory points during a game are entered by the players; units are tracked only as standing or lost.
