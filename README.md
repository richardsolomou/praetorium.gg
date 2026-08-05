# Praetorium

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

One container, one `/data` volume, one instance. The instance fetches its own community data on boot — nothing to run by hand — and serves battles while it does.

```sh
cp .env.example .env
docker compose up -d
```

See [docs/deployment.md](docs/deployment.md) for what lands in the volume, what to back up, and why it stays at one replica.

## Reading army lists

There is an evaluator over the community [BSData](https://github.com/BSData/wh40k-11e) catalogues in `src/core/evaluate.ts`: give it what a player picked and it returns the points and what is illegal about it. It understands the parts of the format that legality and cost depend on — constraints, modifiers, conditions, repeats, and the per-copy and per-model pricing 11th edition uses.

It is checked against Games Workshop's own numbers rather than against itself. `pnpm catalogue:points` builds real units at the model counts the Munitorum Field Manual prices and compares: **it agrees on 99.6% of 1,565 checks**. The seven remaining differences are four Deathwatch datasheets whose definitions catalogue still carries older prices, including at its current upstream revision. There are also two catalogue features the evaluator reports without acting on. Everything it does not understand stays visible instead of becoming a guess, because a confidently wrong points total is worse than an honest gap.

See [catalogue/README.md](catalogue/README.md) for where the data comes from and why none of it is in this repository.

## Accounts

Playing needs no account: a signed cookie is a real, durable identity and the command log points at it. An account exists so that identity survives a new device or a cleared cookie — signing up _claims_ the guest you are already using, so the lists and battles from before come with it.

Email and password works with no configuration. Google and Discord appear only when both halves of their credentials are set.

## Bringing lists in and out

A `.ros` or `.rosz` from New Recruit or BattleScribe imports straight into the builder, and any list exports as `.ros` — the format tournament organisers read. This works because both sides read the same community catalogues, so an entry id in their file is the same id here. Anything that cannot be placed is named rather than dropped quietly.

## Not here yet

Lists are built from the catalogue with a detachment, squad sizes, weapon loadouts, enhancements and a game-size points ceiling. An enhancement is offered only where the data allows it — the right detachment, and a character of the right faction — and it is priced the way Games Workshop prices it. Lists can be saved and reused between battles. An instance with no catalogue synced simply offers pasting instead and says nothing about it.

## Stratagems and missions

The BSData catalogues carry neither, so these come from [40kdc-data](https://github.com/tabletop-developer-consortium/40kdc-data), whose dataset is CC BY 4.0. That licence is why it can be used at all, and attribution is one of its conditions rather than a courtesy — it appears wherever the data does.

Pick a detachment and its stratagems arrive already chosen, with the cost and the usage limit the dataset states. The core stratagems are offered alongside them, and the primary mission and secondaries are picked from the deck. During the game a stratagem's cost comes off its owner's pool, a once-per-phase one greys out until the phase turns over, and each secondary is scored on its own rather than into one pile.

Nothing is typed that can be picked. Scoring offers the figure the card actually pays — `+3 ea` for Behind Enemy Lines rather than a blank stepper — and a list names itself after its faction and detachment. The only free text is your own name. Stratagems and mission cards need a list built from the catalogue: knowing your stratagems means knowing your detachment, so a pasted list gets neither.

An unrecognised usage limit becomes "any number of times" rather than a guess: inventing a restriction would stop a player using something they are entitled to. The 11th edition entries are currently flagged provisional by the dataset, which is shown on screen. The conventional scoring ceilings are displayed beside the totals and never enforced.

## The battle

Setup runs in the order the game does: army, game size, detachment, list, battlefield, deployment, stratagems and mission cards, then who takes the first turn.

The mission is not chosen — eleventh edition takes it from the two armies' force dispositions, and the dataset states which mission each pairing plays, along with its caps of 15 victory points a round and 45 a game. The deployment is drawn from the pattern's own polygons, objectives included, rather than named for you to look up.

Everything starts off the table. Units are deployed at praetorium or held in reserve to arrive later, and during the game each one is on the table, in reserve, or lost. Scoring is offered only when a card allows it: a payout that applies in your command phase from round two is disabled until then, and says so.

## Accounts

Playing needs no account: a signed cookie is a real, durable identity and the command log points at it. An account exists so that identity survives a new device or a cleared cookie — signing up _claims_ the guest you are already using, so the lists and battles from before come with it.

Email and password works with no configuration. Google and Discord appear only when both halves of their credentials are set.

## Bringing lists in and out

A `.ros` or `.rosz` from New Recruit or BattleScribe imports straight into the builder, and any list exports as `.ros` — the format tournament organisers read. This works because both sides read the same community catalogues, so an entry id in their file is the same id here. Anything that cannot be placed is named rather than dropped quietly.

## Not here yet

No wound tracking within a unit — a unit is standing or lost. No automatic primary scoring from objectives held: the app offers the figure the card pays, and you say which payout applied. Finding opponents nearby, chat and anything else social is deliberately out of scope. Victory points during a game are entered by the players; units are tracked only as standing or lost.
