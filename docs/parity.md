# BattleBase parity

Where this is up to, and what is left. Read [CLAUDE.md](../CLAUDE.md) first, and [docs/development/](development/) for the rules behind this work, and several of them exist because of mistakes made in this work.

## What we are doing and why

We play with BattleBase at the table. The goal is that switching to Praetorium costs nobody anything they had already learned, so we are matching it deliberately — its information architecture, its density, its vocabulary — and only then changing things to differentiate.

One decision worth not re-litigating: **BattleBase's web app is the layout we follow, on dark surfaces.** There are two BattleBases and they look nothing alike — the web app is light, dense, three-column; the phone app is dark, single-column, with a guided "NOW &lt;step&gt;" tracker and a persistent bottom scoreboard. Richard picked the web app's layout with the phone app's dark palette. Do not swap one for the other without asking.

Superficial things — exact typeface, pixel-matching — are explicitly not the point. Anything that makes the switch easier is.

## Looking at BattleBase

Their site is a React Native Web app: every element is an unlabelled `div`, text is uppercased in CSS, and semantic selectors mostly do not exist. Screenshots are worth more than DOM spelunking.

To drive it, launch a throwaway-profile Chrome with remote debugging and attach Playwright over CDP:

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9222 --user-data-dir=/tmp/bb-profile \
  --no-first-run --no-default-browser-check https://www.battlebase.app/ &
```

Then `chromium.connectOverCDP('http://127.0.0.1:9222')`. Remember `browser.close()` or the script never exits.

**It hands a fresh visitor an `AUTH_TOKEN` and drops you into a real account** (`tronictronic`) with real rosters and battles. Treat it as strictly read-only: navigate and screenshot, never create, edit or delete anything in there.

The pages worth looking at, and what each one is:

| Page                 | What it shows                                                                                                                                        |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/rosters`           | The roster list, and the entry point to the builder: `Create editable roster`, `Paste GW app roster`, `Paste other app roster`, a battle-size filter |
| `/rosters/<id>/edit` | The builder. Three columns: picker, roster, loadout                                                                                                  |
| `/battles`           | Battle list, tabbed `PUBLIC` / `MINE` / `FRIENDS`                                                                                                    |
| `/battles/<id>`      | A finished battle, three columns                                                                                                                     |
| `/factions`          | Books, with a favourites section                                                                                                                     |

Their nav also carries Rankings, Events, Leagues and Locations, none of which Praetorium has anything to say about. Do not build pages for them because the nav has them.

The **phone app is a different codebase** with a dark theme, a bottom tab bar and a guided tracker. Its App Store listing is a read-only source for screenshots of it: `apps.apple.com/us/app/battlebase/id1609745397`, with the images on `is1-ssl.mzstatic.com` — pull the `PurpleSource` `srcset` entries and append `/900x0w.png`.

Reference captures taken during this work lived in a session scratchpad and are gone. They are deliberately **not** committed: they are their interface, and several contain a real person's private rosters and battle history. Re-capture what you need.

## What we learned about the catalogue data

The expensive part of this work was not the code — four things are not where you would expect them, and all four live in [docs/development/catalogue-data.md](development/catalogue-data.md): which units a character may join (an ability's prose), a datasheet's roster cap (its category), what a `collective` count means (the whole unit, not one model), and that a model entry can itself be collective.

One evaluator notice remains, reported by `pnpm catalogue:points`: `scope primary-catalogue` where a standalone probe has no catalogue to compare against.

## What we learned about their interface

Values worth not re-deriving. Ours are dark equivalents, in `src/styles.css`.

| Theirs                  | Value                                                               |
| ----------------------- | ------------------------------------------------------------------- |
| Accent (links, buttons) | `#2196f3`                                                           |
| Player sides            | `#ff0000` and `#4444ff`                                             |
| Achieved                | `#00aa00`                                                           |
| Discarded / warning     | `#ffa400`                                                           |
| Surfaces                | `#ffffff` cards on `#eeeeee` panels                                 |
| Borders                 | `#bbbbbb`, `#cccccc`                                                |
| Radii                   | 3px buttons, 4px cards                                              |
| Typeface                | ITC Conduit W02, Medium and Bold, self-hosted from `/static/media/` |

Their **loadout pane** — the third column, which is richer than ours: unit name, points chip, a red `DELETE`, a settings gear; links to `View datasheet`, `Mathhammer`, `Buy on Amazon`; a supporter-only unit notes box; a `− n +` stepper for the **model count**; then `WARGEAR OPTIONS`, each weapon with its full stat line and its own `− n +`, and the datasheet's own sentence about what may be swapped for what.

Their **unit card kebab**: `Duplicate unit`, `Add to favourites`, `Mathhammer with this unit` (supporter), `Delete`. No model count in there.

Their **picker**: a search field, then `POINTS FIT` / `UNIT LIMIT` / `OWNED` chips, then a note — "Epic Heroes and units with toughness 10 or higher are hidden" — which is the mission pack's restrictions, not the book's. Rows read `NAME`, `n/m in roster`, a points chip, and `ADD`.

Their **phone tracker**, for whenever the tracker gets attention: a scrolling content area over a fixed bottom bar that carries both players' VP and CP, their names in side colours with faction beneath, a five-segment round bar each, `BATTLE ROUND n` in the centre, and `INFO` / `EVENTS` tabs. Below that, `NOW` and the current step — "SCORING SELECTED SECRET MISSIONS" — with the scorable cards and explicit `SCORE 0` / `SCORE 20` buttons, then `UNDO`, a primary action that states why it is disabled ("PLEASE ENTER MISSION SCORES"), and a camera. The whole thing is a guided step machine, which is a real difference from Praetorium's phase model and a decision to make rather than copy.

## What parity means here

The target is the useful union of the two products inside Praetorium's boundary:

- New Recruit's catalogue-backed roster construction, validation and interchange.
- BattleBase's dense roster presentation and at-table battle management.
- Praetorium's two-player, guest-first, conflict-safe live state remains the foundation rather than something to copy from either product.

It does not include BattleBase's rankings, events, leagues, locations, friends or public-battle discovery. It does not include a rules encyclopedia, automatic mission adjudication, model positions or damage allocation. Those are explicit product exclusions, not parity bugs.

## Current functional coverage

| Area                       | State                     | What exists                                                                                                                                                                                                                              |
| -------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Guest and account identity | Done                      | A durable guest can open and join a battle; an optional email, Google or Discord account claims that guest and keeps its lists.                                                                                                          |
| Live battle state          | Done                      | Two seats, transactional command submission, stale-client rejection, server-side legality, append-only undo, presence and cross-browser live updates.                                                                                    |
| Core turn tracker          | Done                      | Five rounds, six phases, first-player order, command-point income, primary and secondary VP, named stratagem use and battle ending.                                                                                                      |
| Catalogue acquisition      | Done                      | The instance fetches pinned BSData and 40kdc-data revisions in the background and swaps staged data atomically. No game data is committed.                                                                                               |
| Roster construction        | Done for scoped workflows | Faction, game size, ordered multi-detachment purchases within the 11th-edition DP budget, top-level datasheets, squad size, choices, split collective wargear, enhancements, attachments and points limits.                              |
| Roster validation          | Done with disclosed gaps  | Constraints, modifiers, conditions, force scope, ordering, category keywords, attachment associations and catalogue-sensitive costs. The Munitorum ratchet is 99.6% of 1,863 checks. Unknown semantics are reported rather than guessed. |
| Roster library             | Done for scoped workflows | The standalone destination builds, imports, names, saves, loads, renames, copies, deletes and shares read-only lists. Shared views re-price stored picks without exposing owner identity.                                                |
| Interchange                | Done for scoped workflows | `.ros`/`.rosz` import and export preserve detachments, model counts, choices, enhancements, split wargear, attachments, multiple forces and allied catalogue identity. Unplaceable entries are reported.                                 |
| Collection                 | Done for scoped workflows | Per-datasheet owned membership is editable from the picker and roster cards and drives the picker filter. Quantities remain deliberately outside the product boundary.                                                                   |
| Mission setup              | Done for current data     | Force dispositions derive the mission; deployment zones and objectives are drawn from data; fixed/tactical secondaries, primary cards and detachment/core stratagems are picked rather than typed.                                       |
| At-table army state        | Done for product boundary | Units start in reserve, can deploy, lose models, be destroyed and return through undo. Unit damage, position, transport and objective control remain explicit exclusions.                                                                |
| Guided scoring             | Done                      | Card payouts and known phase/round/turn triggers enable contextual scoring; cards can be achieved or discarded, replacements drawn, and secret missions withheld until reveal, all through the log.                                      |
| Battle review              | Done                      | The battle library and chronological report preserve per-round card scoring, CP trends, turn duration, stratagem usage, unit outcomes and undone history correctly from the log.                                                         |

## Current design coverage

| Surface                | State                            | Assessment                                                                                                                                                                                                        |
| ---------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Visual system          | Done                             | Near-black surfaces, compact radii, tracked uppercase headings, tabular numbers, bordered points chips, red/blue ownership tints and an openly licensed condensed typeface.                                       |
| Builder desktop layout | Done                             | Three panes for picker, roster and loadout; category shelves, counts and a persistent points total follow BattleBase's information architecture.                                                                  |
| Builder mobile layout  | Done                             | One roster plus one movable picker/loadout pane avoids duplicate controls and keeps squad size on the card. It follows Praetorium's chosen responsive interpretation rather than BattleBase's separate phone app. |
| Builder detail         | Done for fetched data            | The loadout pane shows model stats, weapon profiles, ability pills, choice controls and a full datasheet link; roster cards expose enhancements, Warlord, duplication, collection and attachment actions.         |
| Application shell      | Done for the scoped destinations | Persistent navigation exposes first-class battle history, roster building and faction browsing. Social and competitive BattleBase destinations remain out of scope.                                               |
| Setup flow             | Done                             | The order follows the game, all game facts are picked from fetched data, and roster, deployment, mission preparation and first-player choice remain explicit mutations.                                           |
| Battle tracker         | Done                             | Desktop uses player/shared/player columns, shared controls, five-turn ledgers, CP gained/used/remaining, VP and CP charts, turn timing, card state, army status and deployment detail folded from the log.        |
| Phone tracker          | Done                             | The shared action leads a single-column surface above a fixed two-player VP/CP scoreboard and round segments, with `INFO`/`EVENTS`, contextual scoring, undo and one phase-advance action.                        |

Deployed at `praetorium.gg`, auto-deploying from `main`. See [deployment.md](deployment.md).

## What we learned about our own side

- **Pricing a page of picker rows costs 14ms** for 60 rows through `buildUnit` plus `evaluate`. Pricing a whole book would not be cheap, which is why only the page that is shown gets priced.
- **`hiddenByRules` is the pattern for asking the evaluator a question about a candidate** that is not in a roster yet: it builds a synthetic root, places the rest of the list, then puts the candidate beside it. `rosterLimit` is written the same way. Copy that shape rather than inventing another.
- **`unitsIn` returns at most 60 rows**, so the filters narrow what is shown rather than the whole book. A datasheet outside the first 60 for a query is not filtered out, it was never fetched.
- **The catalogue is ~90MB of heap held in the process** and loaded on first use. `catalogue-data/` is gitignored; run `pnpm catalogue:sync` before anything that needs real data, including the e2e suite.
- Every price cross-checked against BattleBase agreed exactly — Immortals 70, Overlord 90, Chronomancer 70, Catacomb Command Barge 120, Lokhust Lord 70, Skorpekh Lord 90, Lychguard 80. If a number disagrees with theirs, suspect ours.

## Scoped milestone evidence

The scoped BattleBase and New Recruit milestone is implemented. The browser suite proves the complete path rather than isolated screens:

- A guest enters through Battles, Rosters or Factions without first creating unrelated state.
- A catalogue roster can be built, validated, saved, copied, renamed, shared, printed and attached to a battle.
- Browser file round trips preserve detachment, model count, nested choices, split wargear, Warlord state, attachments, multiple forces and allied catalogue identity. The multi-force corpus is generated during the test and commits no game data.
- Two phone-sized browser contexts complete every phase of all five rounds while staying synchronized. The finished view retains round five and exposes per-round cards and scores, CP history, stratagem usage, turn timing, unit outcomes and the event report from the command log.
- Secret missions remain redacted from the opponent's panel and report until reveal. Tactical cards can be achieved, discarded and replaced.
- Keyboard entry, reduced motion, unique control ids, desktop layout, phone layout and print media have browser coverage and inspected captures.

A `primary-catalogue` condition evaluated without a primary catalogue continues to fail closed and report that its comparison context is absent. Attachment associations are validated against the roster picks that carry their targets. `pnpm catalogue:points` currently agrees with 99.6% of 1,863 Munitorum checks. Its seven remaining differences are Deathwatch Terminators, Fortis Kill Teams, Indomitor Kill Teams and Spectrus Kill Teams: the definitions catalogue carries older prices for those four datasheets, and its current upstream revision has the same values. Skipped rows are classified separately: 394 source-absent Legends tiers, one active generic row whose catalogue requires a faction variant, and three composition-specific tiers the harness cannot construct without guessing.

Mission-pack picker restrictions and prose replacement sentences are shown only when a fetched source supplies them. The pinned sources do not currently provide a structured mission-pack restriction set or a general replacement-sentence field, so Praetorium does not hard-code or reconstruct either from memory. This is the same honesty rule as evaluator `unhandled`: absence stays visible rather than becoming invented game data.

## Definition of parity

The scoped parity milestone is reached when a player can arrive at the home page, find or create a roster without opening a battle, import a representative New Recruit roster without losing supported choices, build and validate the same roster manually, start or resume a battle, and complete all five rounds from either phone while both devices show the same BattleBase-shaped ledger. A finished battle must remain browsable with its per-round scoring, cards, CP, stratagems, unit outcomes and event history derived from the log.

It is not reached by matching colours or adding nav labels while those workflows remain hidden, lossy or split across incompatible state models.

## Traps

Every one of these cost time already.

- **Text is uppercased in CSS**, so the DOM holds `Overlord` while the page shows `OVERLORD`. Find a unit card by `data-unit`, never by visible text.
- **A pane is one instance that CSS moves** (`builder/Pane.tsx`). Rendering a sidebar and a sheet with the same contents put two of every control in the page, both real to a screen reader.
- **The points ratchet is enforced in CI** at 97.0%, currently 99.6% of 1,863. Run `pnpm catalogue:points` after anything touching `defaultSelection`, `buildUnit`, `refit` or the evaluator, and read the mismatch list rather than the percentage alone. The remaining seven differences are classified upstream catalogue values, not permission for a new mismatch.
- **The evaluator's errors are not in the ratchet.** A change can keep points identical and make every squad in the game report a spurious violation, which is exactly what implementing collective counts did before `violations` learned to scale a per-model limit. Build a real squad and read its errors.
- **`spreads` must reach the server.** They travel on the pick beside `models` and `choices`, through pricing, saving and export; three call sites omitted them and the interface silently did nothing.
