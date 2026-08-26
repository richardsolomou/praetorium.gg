# praetorium

## 0.38.2

### Patch Changes

- efb4270: Choose the defender after the setup roll-off.

## 0.38.1

### Patch Changes

- 1659ac8: List Deep Strike units before other Strategic Reserves choices during battle setup.

## 0.38.0

### Minor Changes

- d8d61e7: Follow league-event battles live or review them later with their frozen rosters.

## 0.37.1

### Patch Changes

- dc4b0c2: Show the live side preview when starting a 2v1 battle from a league event.
- dc4b0c2: Name every table shape the same way when starting a battle and when setting up a league event.

## 0.37.0

### Minor Changes

- ff153a0: Add fixed-team Doubles events and four-player battles.

## 0.36.0

### Minor Changes

- 8dd543f: Add event-specific roster sizes and 2v1 roster assignments.

## 0.35.1

### Patch Changes

- ad53f2d: Show complete roster details, reference links, and accurate equipped wargear across roster views and exports.

## 0.35.0

### Minor Changes

- 9fd6333: Let organizers edit, manage, and delete their leagues.

## 0.34.15

### Patch Changes

- 0ffff03: Show each champion wargear option only once in the loadout.

## 0.34.14

### Patch Changes

- 319b35d: Fix profile picture upload on iOS. Safari cannot encode WebP, so the resize step returned an oversized PNG on every pass and always failed. The step now falls back to JPEG and shrinks the image edge, so an iOS user can set a profile picture.

## 0.34.13

### Patch Changes

- b39db79: Allow champions to equip every legal wargear replacement and additive upgrade.

## 0.34.12

### Patch Changes

- 92c6746: Show profile pictures consistently and link league player names to their profiles.

## 0.34.11

### Patch Changes

- 458c226: Speed up navigation by loading account and chooser data only where needed, and keep roster workspaces stable while loading.

## 0.34.10

### Patch Changes

- 64418e3: Reduce complex profile pictures until they fit the upload limit.

## 0.34.9

### Patch Changes

- b892a56: Speed up roster setup and roster selection across rosters, battles, and leagues.

## 0.34.8

### Patch Changes

- 7342664: Speed up initial global searches and roster page loads.

## 0.34.7

### Patch Changes

- 2d587dc: Speed up initial global searches and roster loading.

## 0.34.6

### Patch Changes

- 4807376: Keep account sign-ins compatible with Better Auth 1.7.

## 0.34.5

### Patch Changes

- 84d349f: Show every equipped weapon when configuring a unit's wargear.
- 1765553: Contain and memoize rows in the unit picker, the roster column, and faction datasheet lists, keeping long books responsive without hiding off-screen content from assistive technology.

## 0.34.4

### Patch Changes

- 221e6a7: Keep composite roster loadouts reversible and show every weapon profile they contain.

## 0.34.3

### Patch Changes

- 8e8d48c: Load one faction on the pages that render one faction, instead of shipping the whole catalogue's worth in their markup.

## 0.34.2

### Patch Changes

- 9889f0c: Stop sending each army's frozen unit list twice in every battle read; the tracked units already carry it.

## 0.34.1

### Patch Changes

- efb7b29: Let the browser keep faction, datasheet, mission, and terrain reference data for an hour, keyed to the catalogue snapshot, instead of re-downloading it on every visit.

## 0.34.0

### Minor Changes

- 5baafe7: Run recurring league events with fresh registration and sealed rosters.

## 0.33.6

### Patch Changes

- 4c53471: Load the battle list a page at a time, ordered by most recent activity, so it stays fast however many battles an account has played.

## 0.33.5

### Patch Changes

- 5d029ad: Cache faction references, datasheet slugs, rule-name lookups, picker lists for restricted factions, and saved-list points against the immutable catalogue snapshot, making faction pages, search, and the library markedly faster.
- 5d029ad: Compress every response with zstd or gzip, cutting page and data transfers roughly fourfold.
- 32e5b9d: Show squad-wide wargear quantities correctly in roster previews.
- 5d029ad: Index battle commands by account so deleting an account no longer scans the whole command log.
- 5d029ad: Round battlefield geometry to a thousandth of an inch, shrinking terrain payloads by a quarter.
- 5d029ad: Wait for held steppers, typed names, and picker searches to settle before saving or searching, instead of sending a request per intermediate value.
- 5d029ad: Stop refetching the battle screen a player's own command already returned, halving per-tap traffic in a live battle.
- 5d029ad: Window the battle report to the latest hundred events, with earlier ones a click away.

## 0.33.4

### Patch Changes

- e97d470: Show only the faction abilities available to the selected army.

## 0.33.3

### Patch Changes

- 0929f4e: Narrow and order the roster library from a Filter button and a Sort button that fit every screen size.

## 0.33.2

### Patch Changes

- 43a41a2: Show roster details when choosing a roster to seal in a league.

## 0.33.1

### Patch Changes

- d83e5d6: Export complete roster setup and attachments, apply repeated-unit points correctly, and unlock enhancement-dependent attachment options.

## 0.33.0

### Minor Changes

- 2378621: Add public and private leagues with configurable player limits, sealed roster battles, and organizer-controlled reveal.

## 0.32.2

### Patch Changes

- 2c03bcb: Offer sign-in when a session lapses mid-battle, instead of an error the player cannot act on.

## 0.32.1

### Patch Changes

- 0f0e4a6: Keep the battles list readable during a deploy that adds a new command kind, by skipping a log row an older replica cannot parse instead of failing the whole list.

## 0.32.0

### Minor Changes

- a83123d: Adopt a Google or Discord profile picture for players who don't have one yet, on sign-up and when linking a new sign-in method.

## 0.31.0

### Minor Changes

- 43f0778: Track wounds on a unit in the battle, so a damaged vehicle or monster is counted in wounds rather than only in whole models.
- 43f0778: Open a fielded army over the live battle and record its losses there: take models off a unit, mark a whole unit lost so it leaves its shelf, and bring one back.

## 0.30.0

### Minor Changes

- 7208abf: Add a privacy policy at /privacy and terms of service at /terms

## 0.29.0

### Minor Changes

- 10c933a: Show attachment roles and related units in roster datasheets, add valid attachment menus, and enforce one Leader and one Support per unit.

## 0.28.4

### Patch Changes

- 15fb7bf: Remove origin labels from saved rosters in the roster library.

## 0.28.3

### Patch Changes

- d45692a: Show core abilities granted by selected unit upgrades.

## 0.28.2

### Patch Changes

- 787ec46: Keep roster export actions visible and label exported text with the Praetorium version.

## 0.28.1

### Patch Changes

- b1e07c9: Clear unit enhancements and upgrades when changing detachments.

## 0.28.0

### Minor Changes

- 1884cc4: Add a GitHub Issues link for bug reports and feedback.

## 0.27.1

### Patch Changes

- 50c2d2a: Fix missing and duplicated roster weapons, nested loadout choices, and detachment unit upgrades.

## 0.27.0

### Minor Changes

- cac064f: Add the initial iOS and Android application shell.
- 27a4590: Search for datasheets by their keywords, abilities, weapons, and wargear.

### Patch Changes

- 32ae6bc: Apply King of the Colosseum eligibility and unit limits while building a roster.
- ca0af86: Show multi-profile weapons once and remove false catalogue warnings from shared wargear.
- de654f3: Harden authentication redirects and analytics identity changes.
- 8cdf33e: Keep broad datasheet searches responsive.
- b35a558: Restore Leader and Support keywords to faction datasheets.

## 0.26.0

### Minor Changes

- 84c9de5: Add SMTP-backed email verification and password recovery, use a clearer sign-in URL, and explain social authentication failures.

## 0.25.1

### Patch Changes

- 8d21a60: Harden social sign-in configuration, OAuth token storage, and two-factor authentication.

## 0.25.0

### Minor Changes

- 14e63da: Add account administration, impersonation, linked Google and Discord sign-in, password management, and authenticator two-factor authentication.

## 0.24.1

### Patch Changes

- b159de3: Show when one side has completed its turn while the other still has a turn left in the battle round.

## 0.24.0

### Minor Changes

- 6eb41f7: Show abilities granted by enhancements and attached units on contextual datasheets.

## 0.23.5

### Patch Changes

- 7e94a2e: Make switching between building and viewing a roster clear.

## 0.23.4

### Patch Changes

- 4f664f9: Stop false catalogue validation warnings for recognised primary categories and aggregated model wargear.

## 0.23.3

### Patch Changes

- e5d790e: Open related datasheets in their canonical faction reference.

## 0.23.2

### Patch Changes

- ecefcfc: Allow every model in an aggregated squad to take its per-model equipment choices.

## 0.23.1

### Patch Changes

- 082afd6: Keep a unit's weapon visible in the roster preview when it carries a nested upgrade.

## 0.23.0

### Minor Changes

- d37675d: Add a deployment section that names who sets up first and lists each side's units that deploy outside their zone.
- d37675d: Ask an allied side which Force Disposition it plays when its two armies brought different ones, instead of playing the first seat's.
- d37675d: Open a 2v1 from either side, choosing an ally to play beside you instead of only a pair to play against.
- d37675d: Play a mission twist from the pack that prints one, chosen while the mission is read and readable from the table all game.
- d37675d: Read each side's primary mission and choose the twist before the battlefield, where the matchup that decides them is finally known.
- d37675d: Add a pre-battle rules section that names who resolves first and lists each side's units with a scouting move, and begin the battle from there.
- d37675d: Take an army back off the table during setup, instead of only being able to swap it for another.

### Patch Changes

- d37675d: List only the units with somewhere else to be when setting reserves, and ask once whether the table is using Strategic Reserves at all.
- d37675d: Stop a single fixed secondary mission scoring past the per-card cap its mission pack prints.
- d37675d: Claim the battle ready bonus when an army is chosen, leaving an unpainted army to turn it off.
- d37675d: Fit the battle scoreboard back onto a phone, naming each side by its players' pictures where there is no room for their names.
- d37675d: Draw every scrollbar thin and dark, on both axes, instead of leaving the platform's own across a dark panel.
- d37675d: Stop badging a practice opponent's side, its format and its table as practice, since the seat is already named after what it is.
- d37675d: Read a side's missions beside its stratagems on a tablet, where one panel has the page to itself.
- d37675d: Move finishing, conceding and deleting a battle to a named button under the battle log, leaving the round and the phase centred.
- d37675d: Group an allied side's stratagems under the detachment that brought each one, and say that a detachment's rules do not reach an ally's units.
- d37675d: Head each side panel with its players' pictures, names and the army each one brought, and leave the scoreboard to the score once both panels are on screen.
- d37675d: Pay a side one battle ready bonus, earned only when every army on it is battle ready, rather than one bonus per allied army.
- d37675d: Sit the button that ends a phase flush against the bottom of a phone or tablet screen rather than a little above it.
- d37675d: Give a 2v1 side every stratagem both allies brought, instead of only the first ally's detachment.
- d37675d: Name each army's faction, detachment and list as links on its own line in its side panel, and say it there once rather than a second time in the scoreboard.
- d37675d: Group an army's units by their datasheet shelf when setting reserves, and state where each one starts instead of drawing every placement as an equal button.
- d37675d: Stop tracking and showing which players have a battle open.
- d37675d: Say that your army is missing when a setup section has nothing to show without it, rather than drawing an empty panel.
- d37675d: Let a player settle their side's cards when a practice opponent happens to hold the seat beside them, instead of leaving that side unable to start.
- d37675d: Read the mission, choose the battlefield and settle the secondaries in sections of their own, rather than two of them sharing a screen.
- d37675d: Show each army's force disposition in its own colour beside the list it was built with, and set the battle ready bonus there too.
- d37675d: Show only the payout a side can actually take on a card that scores one way fixed and another tactical, once that side has settled which it plays.
- d37675d: Draw the rule between a side's missions and its stratagems only where the two stack, instead of across the top of a column beside them.
- d37675d: Say which secondary missions a turn just dealt, apart from the ones the hand was already carrying, and offer a card back to the deck only in the turn it was drawn.
- d37675d: Wear the scored side's colour throughout the scoring prompt, so which side is being paid is clear before its name is read.
- d37675d: Colour the button that ends a phase to match the side taking the turn, rather than wearing one colour all game.
- d37675d: Take exactly two fixed secondary missions, from the four cards the pack prints a fixed payout for, instead of up to six from the whole deck.
- d37675d: Warn that a mission twist which rewrites the Primary Mission cards is recorded but not applied to the missions on screen.
- d37675d: Show both names of an allied side in full rather than clipping the second one off the panel.

## 0.22.2

### Patch Changes

- 6dc0960: Keep mission packs, battle setup, and create-battle showing their mission and disposition data when the cached rules lack a disposition map.

## 0.22.1

### Patch Changes

- 023d630: Draw two new tactical secondaries at the top of every one of a side's own turns regardless of how many earlier cards are still unresolved, instead of only topping the hand back up to two.

## 0.22.0

### Minor Changes

- f439680: Replace solo practice with a practice opponent: a full battle against an account that holds a seat and never signs in, in a 1v1 or on either side of a 2v1.

### Patch Changes

- f439680: Show an allied pair the deck they draw their shared hand from, rather than only the seat that deals it.
- 0f9d5bd: Stop a datasheet whose name opens with a weapon keyword claiming that weapon's rule.
- 0f9d5bd: Leave the catalogue's own bookkeeping off a datasheet's keyword line.
- 0f9d5bd: Shelve a datasheet by a primary keyword it sorts under, so Titans leave Other.
- f439680: Say what the active side still owes instead of refusing the turn to anyone else at the table.

## 0.21.18

### Patch Changes

- fcdd4e8: State a mission pack's per-round victory point cap alongside its per-battle cap.
- fcdd4e8: Hold each side to the caps of the mission it is playing rather than to those of the mission the player looking at the screen is playing.
- fcdd4e8: Show how much of a card's claim a mission cap took in that card's own total, so a payout can be given up elsewhere to make room.
- fcdd4e8: Say what a reached mission cap left room for once beneath the scoring total, naming the cap and the points it refuses, instead of repeating an unnumbered note under every payout.
- fcdd4e8: Fix a scoring prompt totalling points it will not bank once a mission's round or battle cap is reached, such as a round already holding 4 VP offering 13 more and recording 11.
- fcdd4e8: Show how each mission category stands against the victory point cap that is limiting it at the top of a scoring prompt, so a round's remaining allowance is known before a payout is pressed.
- fcdd4e8: Count the points a previous turn owed against the battle round that turn was in, so a side can no longer bank a full round's allowance in its own turn and spend the next round's on what the opponent's turn owed it.

## 0.21.17

### Patch Changes

- 021f3e0: Give a unit the keywords its book grants it, so a Dark Angels Chaplain in Terminator Armour is Deathwing and can take Deathwing Assault.

## 0.21.16

### Patch Changes

- 5633a37: Make the end-of-turn tactical discard prompt show whether the round's bonus CP is still available and mark selected cards clearly, instead of leaving both hidden behind unlabelled buttons.

## 0.21.15

### Patch Changes

- e4f8951: Fix a multi-mode weapon like a missile launcher showing no weapon stats in the loadout pane, when the catalogue prints its modes with a marker and a dash rather than in parentheses.
- 7cca113: Draw the models a datasheet insists on, so a unit's loadout no longer omits its sergeant. An Eradicator Squad showed two Eradicators and no Eradicator Sergeant, and its wargear was counted two models short; 53 datasheets were missing a model this way, among them Tactical Squad, Kasrkin, Grey Knights Strike Squad and Battle Sisters Squad.
- 7cca113: Name a squad's rank and file after the model rather than after the unit, so an Eradicator Squad's second card reads "Eradicator" instead of repeating the unit's own name.

## 0.21.14

### Patch Changes

- d850d47: Stop drawing a piece of wargear twice when the datasheet and the catalogue both describe it, such as the Incursor Squad's haywire mine.

## 0.21.13

### Patch Changes

- ee858c0: Fix uploading a profile picture eventually causing HTTP 431 or 502 errors, by storing it in S3-compatible object storage instead of embedding it in the account and its session cookie.

## 0.21.12

### Patch Changes

- 981c0b6: Fix roster units listing in the order they were added instead of alphabetically.

## 0.21.11

### Patch Changes

- a3d448f: Fix favourited datasheets sometimes never appearing after a hard refresh of a faction's datasheets page.
- a3d448f: Stop blocking a scoring selection once the round or battle VP cap is reached — it now stays a warning, and only the overage is left uncounted, so the rest of that turn's legitimate scoring can still go through.
- a3d448f: Make discarding tactical secondaries at the end of a turn optional, letting a player choose which cards, if any, to give up instead of forcing every active card into the discard pile.
- a3d448f: Fix undoing a tactical draw from several turns back auto-dealing a fresh hand instead of pausing, which made it impossible to rewind past that point.

## 0.21.10

### Patch Changes

- df32cf7: Pass realtime overrides and the database pool size through docker-compose.yml, so self-hosted instances can point at their own Centrifugo.

## 0.21.9

### Patch Changes

- 892aab6: Stop the faction datasheets list from flickering on first load for signed-in players.

## 0.21.8

### Patch Changes

- d4462df: Show datasheets whose catalogue and reference names use different apostrophe styles.

## 0.21.7

### Patch Changes

- 85aee37: Score primary missions at the end of each player's turn in the final battle round.

## 0.21.6

### Patch Changes

- 7b1210d: Discard mandatory conditional secondary replacements before drawing another card.

## 0.21.5

### Patch Changes

- 36bfeb6: Show only completed battle rounds in the scoreboard progress rail.

## 0.21.4

### Patch Changes

- 8817242: Show primary and secondary scoring guidance from the applicable battle round.

## 0.21.3

### Patch Changes

- 693a912: Undo every tactical secondary from the same hand refill together.

## 0.21.2

### Patch Changes

- 91ca61f: Discard unresolved tactical secondaries at the end of each turn so the next turn draws a fresh hand.

## 0.21.1

### Patch Changes

- 63e5874: Match fielded roster snapshots to the standard read-only roster presentation and applied unit details.

## 0.21.0

### Minor Changes

- 511175d: Favourite detachments to place them first when setting up a roster.

## 0.20.1

### Patch Changes

- 7338333: Show faction colors across the full top edge of faction reference headers.

## 0.20.0

### Minor Changes

- e7aa048: Find shared faction datasheets and detachments under their canonical reference page, and offer typo-tolerant datasheet search results.

## 0.19.6

### Patch Changes

- a770797: Undo every score recorded by one scoring confirmation as a single action.

## 0.19.5

### Patch Changes

- 892237e: Show shared scoring prompts to every seated player and clearly name the affected side.

## 0.19.4

### Patch Changes

- 3790dcc: Set the interface font size to 18px for a more readable layout.

## 0.19.3

### Patch Changes

- be7e549: Offer the end-of-turn tactical secondary discard for one command point.

## 0.19.2

### Patch Changes

- 67ad859: Show battle roster snapshots in the full read-only roster view.

## 0.19.1

### Patch Changes

- c6a1825: Restore the default interface font size for a more compact layout.
- 8082b0d: Show synced descriptions for core stratagems in battles.
- 52f4e62: Cap additional command point gains at one per side each battle round.
- c069e57: Confirm before undoing randomly drawn secondary missions.
- f7526a0: Describe round-one secondary redraws without referring to impossible earlier rounds.

## 0.19.0

### Minor Changes

- 66f3508: Separate deployment order from the post-deployment first-turn roll-off.

## 0.18.8

### Patch Changes

- 17854eb: Correct the attacker deployment guidance in battle setup.

## 0.18.7

### Patch Changes

- 7731ec6: Keep fielded battle rosters unchanged when saved rosters are edited or deleted.

## 0.18.6

### Patch Changes

- 1437a38: Show the correct global search shortcut for each platform.
- 2d908a6: Show connected objective terrain as one objective.
- 4e94b67: Enlarge the battle terrain viewer for accurate measurements.

## 0.18.5

### Patch Changes

- 0b8e04a: Make battles, rosters, catalogue references, navigation, and core account pages safer and clearer.

## 0.18.4

### Patch Changes

- b081d11: Open picker previews and read-only roster datasheets without sending or processing unnecessary roster data.

## 0.18.3

### Patch Changes

- 3694c7a: Open datasheets reliably in large rosters.

## 0.18.2

### Patch Changes

- 703607e: Measure datasheet request and rendering delays in large rosters.

## 0.18.1

### Patch Changes

- d6f0811: Load roster unit datasheets without expanding the full roster twice.

## 0.18.0

### Minor Changes

- 8c4cdd3: Sort saved rosters by creation time, name, update time, or battle size without changing their default order when opened or edited.
- 8c4cdd3: Inspect roster units in one configurable three-column workspace.

### Patch Changes

- 8c4cdd3: Give Praetorium a distinctive new logo and charcoal field-document color scheme across the app and browser.
- 8c4cdd3: Show the actual account error when sign-in or sign-up fails.
- 8c4cdd3: Hide zero-count weapons from read-only roster model cards.

## 0.17.1

### Patch Changes

- 3ecf75b: Open battles and the battles list faster by leaving the list expansion out of the log.
- 3ecf75b: Load battle and roster pages in fewer round trips by fetching what does not depend on the page alongside it.
- 3ecf75b: Keep offering players to connect with once you have many friends, instead of running out of suggestions.
- 3ecf75b: Show every roster's points as the library loads, in one request instead of one per row.

## 0.17.0

### Minor Changes

- ae68a6a: Run more than one replica by pointing `VALKEY_URL` at a Valkey, which carries live updates, sessions and sign-in limits between them.
- ae68a6a: Store accounts, lists, battles and command logs in Postgres instead of SQLite.

### Patch Changes

- ae68a6a: Open the battle list, a player's profile and a friend list in a fixed number of queries rather than one per battle, friend or row.

## 0.16.8

### Patch Changes

- 70ba273: Keep the faction list working when a stale rules object is missing a map. The list builder reads several rules maps to name factions and detachments, and a rules snapshot loaded before one of those maps existed made the reader throw and return an empty list. Each map read now falls back to its plain value rather than failing.
- 06b4f4b: Draw every hover explanation the same way: what it is about, what it says, and where it came from, in that order. A rule long enough to fill the screen now stays inside it instead of running off the bottom edge, and a tooltip left open while a panel scrolls follows the word it belongs to.
- 06b4f4b: Open a unit from anywhere on its card. The rows under a unit's name — its enhancement, its unit upgrade, and the one saying which unit it is leading or supporting — read like part of the card and were the only part of it that did nothing when clicked, so a player reaching for an Overlord by the relic it carries had to aim at the name instead. Every row opens the unit now, and the buttons that do something else still do only that.
- 06b4f4b: Explain a weapon keyword something in the list added. Skyshroud Spearhead's Deepening Madness gives a unit's ranged attacks `[ASSAULT]`, and the keyword appeared on the weapon as plain text: the catalogue links the rules a profile was printed with and links nothing for one that was added, so it was the only keyword on the page a player could not read. It now hovers like every other, and says which upgrade or enhancement put it there.
- 06b4f4b: Add up the relics a single unit is carrying. A Leader and a supporting character joined to the same bodyguard unit are one unit, so a Destroyer Ankh that adds 2" to the Move of models in the bearer's unit moves the Chronomancer standing in it as well — and its own Murdermind adds 3" on top. Each character could only see the unit it had joined, never the character beside it, so the Chronomancer showed 8" where the rest of its unit showed 7" and the two enhancements never stacked.

## 0.16.7

### Patch Changes

- fae016d: Ask a squad that must match one question instead of ten. Immortals take gauss blasters or tesla carbines, Lychguard warscythes or sword and shield, and neither may be mixed — but the editor offered a count against each option and only said "all models must be equipped identically" once a player had used it. Where the data forbids the mix the option is picked once and every model follows, including the models a resize adds. A list imported from another builder still says exactly what it said: a split it states is kept and reported, not quietly reissued. Aggressor Squads, Vanguard Veterans with Jump Packs and Cthonian Beserks read the same way.
- fae016d: Set the rules text in the unit editor at the size of the labels around it. What a resurrection orb does, what each enhancement gives and what a dispersion shield is for were all printed larger than the option they explain, so the note shouted over the thing it was describing.
- fae016d: Ask what a unit fights with before asking what else it carries. An Overlord's blade and tachyon arrow sat below the question about his resurrection orb, which is neither the order the datasheet prints nor the order the choice gets made in.

## 0.16.6

### Patch Changes

- b97636e: Show a detachment all six of its stratagems. A card two detachments share is written down once, under whichever of them the source filed it, and named by the others only by its id. Reading the filing alone left Armoured Speartip without Armour of Contempt or Rapid Embarkation, and 184 other detachments similarly short, on the reference page and in the live tracker alike.
- b97636e: Let a tank take the weapons bolted on beside its fixed ones. A hunter-killer missile, a multi-melta and a storm bolter sit in the same capless group as the guns a Land Raider always has, and nothing in that group competes for room, so it may carry all three. Reading the group as one shared slot offered none of them, and did the same to the Rhino's havoc launcher, the Gladiator's Icarus rocket pod and the ironhail heavy stubber.
- b97636e: Put a cross in every box that narrows a list. A query matching nothing looks exactly like an empty shelf, and getting back to the whole list meant selecting the text and deleting it. The picker, the faction and datasheet finders and the player search all clear on the cross, or on Escape.
- b97636e: Keep the roster on screen while a deleted unit is being taken off it. The list is drawn from the priced answer and the price is a round trip behind the picks, so dropping one unit emptied the whole list until the server replied. What is left now stays where it is, as it already did while a unit was being added.
- b97636e: Offer every datasheet in the book, not the first sixty. The picker sorts by name and stopped once it had priced sixty, so a Space Marine list ran out somewhere after Inner Circle Companions and Sternguard Veterans could only be reached by searching for them.
- b97636e: Give the Space Marines detachments their points, stratagems and enhancements back. The rules source files that book under Adeptus Astartes while the catalogues call it Space Marines, so every one of its sixteen detachments came back empty. Each faction now answers to every name its own data gives it.
- b97636e: Offer the upgrades a datasheet asks about one at a time. A lone yes-or-no needs no group to hold it and is written without one, and the builder only ever looked for groups: a Chaos unit's daemonic icon and instrument, an Infiltrator Squad's comms array, helix gauntlet and grapnel launchers, a Reiver's grav-chute, the demolition charge on Imperial Navy Breachers and 268 more could not be taken at all.
- b97636e: Offer the crown only to what may wear it. Nominating a Land Raider or a Repulsor as Warlord took a detachment that makes vehicles characters, and a daemon borrowed into a Chaos Space Marine army may not lead it at all, but every one of them was offered anyway. Take Headhunter Task Force and its Tank Ace Character upgrade and the tank can be nominated, as the rule intends.

## 0.16.5

### Patch Changes

- f08efae: Keep a squad the size it was when it is handed a weapon. A Plague Marine's meltagun, a Chaos Biker's flamer and a Tempestus Scion's hot-shot volley gun are each taken _instead of_ what that model was carrying, but asking for one added a model to the squad and charged for it — a five-marine squad came back as six, sixty points dearer. A model brought into the group a squad's size is counted in now costs a squadmate their place, and putting its weapon down hands the place back. A drone, a plasmacyte or a pack of hunting wolves is filed beside the squad rather than in it and still adds to the unit, because that is what taking one means. The specialists the catalogue files apart from the squad they are drawn from can be armed at all now: the panel drew them on a card of their own with nobody to take a body from, and left the control dead.

## 0.16.4

### Patch Changes

- c008a07: Let a squad take the weapons its datasheet files in a group of their own. A group holds nothing until something is put in it, so the heavy weapon a squad may take is absent from a list until asked for — and the request that asked was the one request that could never land, because every walk to a group steps through what is already there. Hearthkyn Warriors could not take a magna-rail rifle, Tempestus Scions could not take a flamer, and 240 choices across the catalogue did nothing at all when pressed. The model a request brings in is one of the squad rather than an extra body: where the group it joins is already full, a squadmate puts down their weapon to carry it, as one arming a specialist always has.

## 0.16.3

### Patch Changes

- 898ef20: Fix a whole-unit enhancement reached through the catalogue's shared library of enhancements — such as the Gauntlet of Compression's extra range — showing on neither the bearer's own weapons nor the unit it joins.

## 0.16.2

### Patch Changes

- 2186f26: Ask for a squad's weapons once. Where the community catalogue files a kind of model one entry per weapon — Necron Warriors as a warrior with a gauss flayer beside a warrior with a gauss reaper — the loadout panel drew a card for each and then asked for the same weapon again as a wargear option underneath. Those entries are now gathered into the model they are all of, with a count against every weapon it may carry, wherever the catalogue happened to file them. Where the entries cannot be drawn as a weapon each, because the loadout pairs two weapons the player cannot separate as Canoptek Wraiths do, each pairing keeps the card the catalogue wrote and is counted on that card rather than in a second list below it.

## 0.16.1

### Patch Changes

- 32a3867: Fix the unit loadout panel flashing blank while wargear or enhancement choices reprice.

## 0.16.0

### Minor Changes

- 9d37c68: Right-click a unit card in the list builder to duplicate it, toggle collection ownership, or delete it.

## 0.15.1

### Patch Changes

- 9cffb21: Keep the list builder working when a unit choice arrives without its options, so points and legality still calculate instead of failing.

## 0.15.0

### Minor Changes

- 41868d2: Show a unit's wargear a model at a time, with each kind of model named as its datasheet names it and every weapon it may carry listed beneath it — a count against each, so the ten veterans of a squad can divide a pair of special weapons between them. Datasheets the community catalogue describes no model kinds for now read from the rules source instead, which is what lets a Deathwatch kill team show all of its weapons and offer the free swaps its datasheet allows. The roster card counts the same models the panel draws, so a free swap shows up there too rather than leaving the card naming a weapon that was traded away. Anything interchangeable is listed together: a swap sits beside the weapon it replaces, and the options of one group stay side by side. Also keeps a squad honest as it is armed: the body for a specialist comes from a squadmate rather than the model the datasheet insists on, goes back to one when that specialist puts its weapon down, no longer comes out of the weapons the player has just asked for — a squad wanting five combi-weapons and a pyrecannon used to come back with three — and a choice the data has closed behind another is let go of rather than reported as a broken rule.
- 682ac7a: Carry an enhancement that speaks of the bearer's unit across to the unit a character leads, so a Destroyer Ankh moves the models it has joined and not only its bearer. Show what every weapon a unit could take would do in this list rather than on a bare datasheet, so a choice between two guns can be made knowing what an enhancement does to each. And say plainly when a second character is given a unit that is already led: one leads, and others may still be attached alongside.

### Patch Changes

- 57a6e3b: Keep an enhancement's effect on the model bearing it, and show that effect where the unit's weapons are listed. A Destroyer Ankh now adds to the Attacks of its own bearer's melee weapons rather than leaving them as the bare datasheet prints them, and no longer changes the weapons of a second character who has no ankh of their own.
- 97df53d: Say when the same enhancement has been given to two characters. The catalogue limits a relic to one per army and always did; a unit built by the catalogue itself is excused its own composition, and that excuse was covering the player's choices inside it as well. A limit is also reported once now rather than once per selection that breaks it.
- 4f96173: Apply the enhancements and datasheet rules that were written against a scope the catalogue reads and this app did not: a Master Artisan now adds to its bearer's Wounds as well as to the Toughness of the unit around it, and a Kroot Trail Shaper moves the Kroot it leads. Four such scopes went unresolved, so around a hundred and fifty stat changes across every book quietly did nothing.

## 0.14.1

### Patch Changes

- 715f5c9: Fix a secondary put back into the deck showing up in your hand as a discarded card, by tracking it as returned and no longer listing it.

## 0.14.0

### Minor Changes

- 4c0cd8e: Refuse a primary or secondary score that would pass the mission's round or game cap, explaining why in the scoring dialog.

## 0.13.3

### Patch Changes

- beaffe5: Fix a roster with disagreeing Force Dispositions across its detachments (as an imported list can carry) blocking battle setup silently, by asking the player to pick one on the roster.

## 0.13.2

### Patch Changes

- 752924d: Route PostHog analytics through `/t` instead of `/ingest`, since ad-blocker lists block that literal path segment regardless of host.

## 0.13.1

### Patch Changes

- 63d0fd7: Improve battle player details and keep tactical mission draws usable while inspecting cards or undoing actions.

## 0.13.0

### Minor Changes

- 5db06cb: Let every seated player record battle actions for either side.

## 0.12.1

### Patch Changes

- be41610: Show selected loadouts when viewing another player's roster.

## 0.12.0

### Minor Changes

- fe1301e: Split unit lists into collapsible datasheet categories.

## 0.11.1

### Patch Changes

- e621751: Stop the global search shortcut from throwing on Android soft keyboards that dispatch key events without a key.

## 0.11.0

### Minor Changes

- 0795eb7: Show user profile pictures and links in the battle tracker.

## 0.10.0

### Minor Changes

- 0c66b6a: Show faction icons and faction and detachment links on battle scoreboards.

## 0.9.0

### Minor Changes

- 3ff636b: Use one roster page for editing and sharing, with changes available only to its owner.

### Patch Changes

- d61574d: Preserve compound weapon loadouts when importing text rosters.

## 0.8.1

### Patch Changes

- bcbbf31: Add battle actions to the battle library's context and overflow menus.
- bcbbf31: Assign primary missions to the correct side and allow either player to rewind battle actions across turns.

## 0.8.0

### Minor Changes

- 9bdf3c9: Edit your display name and profile picture from the account menu.
- 171f874: Import pasted New Recruit roster exports.

### Patch Changes

- 9bdf3c9: Use a compact navigation menu below 815 pixels.

## 0.7.0

### Minor Changes

- 6cdff42: Ask each mission payout in the words the mission pack prints on the card, so a row says what to check instead of restating the points it pays. The card's full text moves behind its name. The prompt that deals your secondary missions can no longer be dismissed by clicking away from it.
- 2b29aad: Rebuild battle setup and the live tracker around sides, so a 2v1 shows one score, one command point pool and one hand of cards for the allied pair. Deal tactical missions at random when a turn opens, and ask each card its own question at the moment it pays out: what it wants, what meeting it pays, and a way to say it scored nothing. A card that pays at the end of the opponent's turn is settled as the turn comes back, before the next hand is dealt over it, and the list of battles updates itself when someone adds you to one. Missions still in play sit at the top of the hand until they are scored or put back. Battles, shared lists and profiles now live at `/battles/…`, `/rosters/…` and `/players/…` rather than the old one-letter paths, which no longer resolve.

### Patch Changes

- 6cdff42: Import BattleBase rosters with named game formats, combined detachments, enhancements and repeated wargear choices.

## 0.6.0

### Minor Changes

- 46f8e96: Add friend-only 2v1 battles with separate allied armies, shared team resources, and collaborative setup.
- 488d597: Search pages, game references, rosters, and battles from anywhere.

### Patch Changes

- 6750113: Make roster editing sidebars easier to navigate on mobile and expose unit datasheets.
- 53ae105: Show each unit's attachment targets only once on its datasheet.
- a5239de: Show each faction's full army rule on its faction page.

## 0.5.2

### Patch Changes

- f6ed4d0: Improve datasheet readability and show accurate composition, profile, and attachment options.

## 0.5.1

### Patch Changes

- 8f3e7ab: Remove enhancements cleanly, show each selected enhancement once, and keep the roster visible while adding units.
- 4899109: Show complete datasheets with correctly classified abilities, unit composition, loadout, and wargear options.

## 0.5.0

### Minor Changes

- 5de00a8: Show each faction with its own icon and colour, and sync faction favourites across devices.

## 0.4.6

### Patch Changes

- 99f4eda: Improve wargear defaults and per-model choices, enforce faction restrictions, clarify invulnerable saves, and speed up catalogue-backed pages.

## 0.4.5

### Patch Changes

- 4ef4500: Add forced detachment enhancements to required units and preserve complete, readable datasheet rules.

## 0.4.4

### Patch Changes

- 428cb87: Validate shared upgrades and conditional catalogue pricing without showing unsupported rule warnings.

## 0.4.3

### Patch Changes

- 5d2713b: Show unit upgrades separately from character enhancements.

## 0.4.2

### Patch Changes

- 57a040d: Show available enhancement rules and preserve mandatory wargear when changing a unit's loadout.

## 0.4.1

### Patch Changes

- 64a7e58: Keep roster controls stable, simplify roster setup, collapse enhancements by default, and explain profiles and abilities beside their loadout choices.
- e862ede: Keep community catalogue data available through verified shared snapshots.

## 0.4.0

### Minor Changes

- 1ff10c7: Build and play King of the Colosseum battles with its prototype army restrictions.
- a666bb2: Group allied units by faction at the bottom of the unit picker and let players hide them.

### Patch Changes

- bc07d07: Export rosters as Games Workshop text from the actions menu.
- 3f9747a: Keep modal controls reachable on shorter screens.
- 7830c22: Offer legal model replacements in mixed-composition squads.

## 0.3.1

### Patch Changes

- b324bc9: Show the correct weapon quantities in roster datasheets.
- 801703b: Show owned datasheets first in the roster picker and remove the redundant view icon.

## 0.3.0

### Minor Changes

- f8e8fc5: Manage guided battle setup with exact battlefield plans, clocks, tactical missions, corrections, results, and richer private rosters.
- a471aaf: Import BattleBase rosters, browse mission references, and inspect detachment rules while editing a roster.
- ce03dde: Set a battle up one step at a time, then track it on a board that shows the round, the phase and the running log beside each army's own missions and stratagems.

## 0.2.3

### Patch Changes

- 2de8bb2: Capture anonymous server telemetry for collection updates and roster deletion.

## 0.2.2

### Patch Changes

- d59bdee: Publish and deploy release images by immutable digest.

## 0.2.1

### Patch Changes

- 097910d: Capture anonymous server telemetry for key battle milestones and operational failures.

## 0.2.0

### Minor Changes

- 90e4d6f: Add privacy-safe product analytics, session replay, feature flags, error tracking, and account identity.

## 0.1.1

### Patch Changes

- 2d7ff97: Adopt automated versioned releases for Praetorium.
