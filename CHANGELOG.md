# praetorium

## 0.203.4 (2026-10-30)

### Patch Changes

- 6cb4bee: The club invite button confirms when the link is copied or shared.
- b2adc93: The "Remind players" note tells apart entrants who share a display name.
- 0d2b2d4: The battle size filter on your rosters writes points with a thousands separator, such as 2,000 points.
- e31f240: Scoring no longer animates the scroll when your device asks for reduced motion.
- 6cb4bee: Battle setup shows the chosen layout for older battles instead of "No layout yet".
- 6cb4bee: Battle setup and the scoring draw dialog say "1 unit", "1 model" and "1 card" instead of "1 units", "1 models" and "1 cards".
- 0d2b2d4: Share and copy buttons for invites and links use the same wording everywhere.
- 0d2b2d4: The simulator shows chances under 1% to two decimal places, and very small ones as <0.01% instead of 0.0%.

## 0.203.3 (2026-10-30)

### Patch Changes

- 33330ad: Your battle list, player profiles and friends' battles load faster.

## 0.203.2 (2026-10-30)

### Patch Changes

- 8acdf79: The simulator now calculates more Adeptus Custodes rules, including Trajann's Moment Shackle, the Blade Champion's Sword of the Throne, the Sodality objective rules, Venatari's Strike from the Skies, Memento Moritoi and Not a Shell Wasted.
- 8acdf79: Enhancements that only boost a bearer's melee weapons no longer boost its ranged weapons in the simulator.
- 8acdf79: The simulator now calculates more rules across factions, such as the Biologus Putrifier's Foul Infusion, the Lord of Contagion's Vector of Disease, Worthy Foes and several re-roll and cover rules.
- 8acdf79: The simulator can now calculate Canoptek Scarab Swarms' Self-destruction, removing the destroyed Scarab before the rest of the unit fights.

## 0.203.1 (2026-10-30)

### Patch Changes

- ea1ae0c: An assistant reading a detachment rule whose source names its detachment only by name, such as the Custodes ones, now gets that detachment's record to look it up.
- ea1ae0c: An assistant planning a matched play list sees only the leaders and support units that list can take, without Legends or Crucible ones.
- ea1ae0c: A signed-in assistant no longer gets a server error while Praetorium is deploying; it is asked to retry instead.

## 0.203.0 (2026-10-30)

### Minor Changes

- 29aad97: Organizers can let allies in a 2v1 or doubles event split their pair's points however they agree, such as 900 and 1,100 of 2,000.

### Patch Changes

- 29aad97: Organizers can change a sealed game's or tournament's points per army and house rules after lists are sealed, as long as every sealed list still fits.

## 0.202.1 (2026-10-30)

### Patch Changes

- ac4a96f: An AI assistant reading one of your saved rosters now sees each unit's name, points, wargear, enhancements and attachments, the total, and any problems with the list, instead of catalogue ids.
- ac4a96f: When Praetorium leaves out a rule's wording, an assistant is now pointed at the exact entry in the source file that holds it, including detachment rules and enhancements.
- ac4a96f: An assistant listing a faction's units for list building gets a shorter answer that leaves out Legends and Crucible datasheets unless asked, and can ask for units by name or keyword, so large factions no longer overflow what it can read.
- ac4a96f: Assistants no longer receive empty "When:", "Target:" and "Effect:" labels where Praetorium leaves out a rule's wording.
- ac4a96f: The combat simulator now applies Martial Ka'tah, Captain-General and other Adeptus Custodes abilities that it previously couldn't read.
- ac4a96f: An assistant using the combat simulator can name each side's detachment to apply its rules and offer its stratagems, and the simulator link it shares keeps that detachment.
- ac4a96f: The assistant combat simulator now names re-roll abilities it can't apply, such as a Caladius Annihilator's Advanced Firepower, instead of leaving them out silently.

## 0.202.0 (2026-10-30)

### Minor Changes

- 230a5b7: When you earn an achievement, a message tells you once, on whichever device you're using, with a link to your achievements.

### Patch Changes

- 230a5b7: The leaderboard and rating changes update as soon as a battle finishes, instead of up to a minute later.

## 0.201.2 (2026-10-30)

### Patch Changes

- 580cdcb: The combat simulation achievement is now called Augury.
- 580cdcb: Sealed club games count towards Club Night, Club Stalwart, Pillar of the Club and Founder.
- 580cdcb: Recruiter, Herald and Muster count each guest once, only when they created an account to keep the battle, and never for imported battles.

## 0.201.1 (2026-10-29)

### Patch Changes

- f66e484: Battles without a battle size yet no longer say "Legacy format".
- f66e484: Unfinished battles untouched for two weeks no longer headline the home page; they stay on the battles page.

## 0.201.0 (2026-10-29)

### Minor Changes

- ba836f9: Profiles have an Achievements tab with medals for nearly everything you can do, from building your first roster to 100-win streaks, and achievement points show under the player's name.

## 0.200.1 (2026-10-29)

### Patch Changes

- 14116b8: Terrain layouts now measure from other terrain and the board edges by default, since a blank mat has no deployment lines to measure from until the terrain is down.

## 0.200.0 (2026-10-29)

### Minor Changes

- c403b31: Battle setup is redesigned: both sides face each other down one line, each step folds to its answer once it is settled, steps with a default answer have a checkbox on their number that stays in view while you scroll, and on a phone each step shows one side at a time with tabs to switch.

## 0.199.5 (2026-10-29)

### Patch Changes

- 1d0faa8: The Tarantula Sentry Battery now shows its 30 points in unit lists and datasheet pages, instead of 0 points before you add it to a roster.

## 0.199.4 (2026-10-29)

### Patch Changes

- eb5391e: Mission card choices name objectives by where they sit, such as a player's home, the centre, an expansion or a left flank, instead of Objective 1 to 6.
- 65f94b4: Linking Google, Apple, Discord or GitHub to your account now says so when the link cannot start, instead of doing nothing.

## 0.199.3 (2026-10-29)

### Patch Changes

- 3dc07c7: Terrain layouts keep every piece's placement number when published distances are also shown.

## 0.199.2 (2026-10-29)

### Patch Changes

- f1777bd: Terrain layouts always fall back to the board edge for a piece's distances, so pieces are numbered even on deployments whose lines run only one way, and the "Board edges" option is gone.
- f1777bd: The terrain layout option that shows a layout's own printed distances is now called "Published distances", since many of them run to terrain corners rather than objective centres.

## 0.199.1 (2026-10-29)

### Patch Changes

- 5c51419: Imported lists are read about a quarter faster.
- 5c51419: Importing rosters or battles from another app shows how many it has read so far.

## 0.199.0 (2026-10-29)

### Minor Changes

- c36497e: Terrain layouts number the pieces in the order to put them down and measure each one from a piece already placed, a deployment zone line, or the board edge, and you can tick which of those to measure from.

### Patch Changes

- c36497e: Terrain layout distances are coloured by what they measure from, matching their tick boxes, and the key now sits under the board so ticking an option no longer moves it.

## 0.198.0 (2026-10-29)

### Minor Changes

- 35aa6c4: Bring your finished games in from another battle tracker, starting with BattleBase, with **Import battles** on the Battles page, or ask there for the app you use.
- 35aa6c4: Import several rosters at once from a BattleBase player's public rosters or from New Recruit share links, under **Import roster**.

### Patch Changes

- 35aa6c4: Importing a list with several detachments keeps the ones Praetorium knows, and their enhancements, when another is no longer available.
- 35aa6c4: Imported squads whose models are named for their loadouts, such as Chaos Terminators, keep each model's wargear.
- 35aa6c4: Giving some models in a squad a different pistol no longer multiplies the squad's other weapons, and each model can then take its own melee weapon, as Death Company Marines do.

## 0.197.0 (2026-10-29)

### Minor Changes

- 9f74d8b: Your battles and player profiles now show how much each battle moved each player's leaderboard rating.
- 9f74d8b: Player profiles chart the player's leaderboard rating after every counted battle.

### Patch Changes

- 9f74d8b: A finished battle shows how much it moved each player's leaderboard rating beside their name.
- 9f74d8b: Leaderboard ratings no longer drop when your older battles pass the 90-day window.
- 9f74d8b: The leaderboard shows one table per army instead of a separate table for each rules version.
- 9f74d8b: A single result now moves your leaderboard rating less, because dice decide more of a battle than the old rating assumed.
- 9f74d8b: A lone player who beats two allies in a team battle no longer gains as if they had beaten two players at once.

## 0.196.1 (2026-10-29)

### Patch Changes

- 4894c16: Data updates are more compact: each update says which armies it reached and what changed before you open it, and lists repriced, removed and added items under their own headings.
- 4894c16: Data updates show the prices of units whose later copies cost more together on one line, instead of as separate added and removed rows.
- 4894c16: Data updates no longer list a unit as removed and added when a new book only changes the capitals in its name.
- 4894c16: Data updates and datasheet pages say a datasheet, detachment or enhancement was added rather than calling it new.
- 4894c16: Data updates list a change that reached several armies once, naming every army it reached, instead of repeating it under each one.

## 0.196.0 (2026-10-29)

### Minor Changes

- bcde100: What's new sums up recent changes once a week, with a dot on its links in between.

### Patch Changes

- bcde100: What's new groups changes by release day, with new features apart from fixes.

## 0.195.16 (2026-10-29)

### Patch Changes

- 2111f97: The page background is a darker, neutral charcoal, with slate kept for the band atop each page.

## 0.195.15 (2026-10-28)

### Patch Changes

- 7604bef: Saving your screens on this device after a tap or battle action is much faster.
- a31fc13: Pages no longer freeze briefly when new game data finishes downloading in the background.

## 0.195.14 (2026-10-28)

### Patch Changes

- e3fa360: A quick double tap on a battle control, such as ending a phase, acts only once.
- e3fa360: In a battle, your taps now reach your opponent's screen sooner.

## 0.195.13 (2026-10-28)

### Patch Changes

- b12567b: Date fields no longer spill past the edge of dialogs on iPhone.
- b12567b: A draft season shows **Draw again** only once enough players have joined for fixtures.

## 0.195.12 (2026-10-28)

### Patch Changes

- cfca9a8: On a phone, the battle scoreboard sits at the top, with the playing guide under the Battle tab and event and club links beside the battle details.

## 0.195.11 (2026-10-28)

### Patch Changes

- c3fd878: Battles no longer offer a secret mission, which no supported mission pack has; one from an earlier battle can still be revealed.

## 0.195.10 (2026-10-28)

### Patch Changes

- d63b6f6: Sealing a list or starting a battle in a club's sealed game no longer freezes the page briefly the first time.
- d63b6f6: The seal button shows it is sealing as soon as you press it.

## 0.195.9 (2026-10-28)

### Patch Changes

- a3a38d0: A faction's datasheet list reacts faster to filters and opening a datasheet, especially on phones.

## 0.195.8 (2026-10-28)

### Patch Changes

- 5e70390: Editing a list, such as typing a unit's name, is faster, especially in large armies.
- 5e70390: The first battle or tournament action no longer freezes the page for up to a couple of seconds while army rules are prepared.

## 0.195.7 (2026-10-28)

### Patch Changes

- eacfe2c: Battle taps show their result straight away, without waiting for the server.

## 0.195.6 (2026-10-28)

### Patch Changes

- 323f386: Battle actions show their result sooner, as the battle is no longer downloaded again while each action is sent.
- 323f386: The first battle action after opening a battle no longer freezes the screen for up to a few seconds on devices with army rules saved offline.
- 323f386: Switching back to the app no longer re-downloads every saved battle, league and list, which slowed the next battle action.

## 0.195.5 (2026-10-28)

### Patch Changes

- 28ff003: Burden of Trust no longer offers a unit that already guards another objective.
- 28ff003: Each Burden of Trust and Consecrate objective has a button to clear its unit.
- 68731ca: When the scoring prompt is taller than the screen, its button steps through each card before letting you pass the turn.
- 0df9e2a: After an update, switching tabs reopens each tab where you left it, and Back still works.

## 0.195.4 (2026-10-28)

### Patch Changes

- d3e2e12: Tournament and club battles use your ability alerts as of the battle's start, so changing one no longer means resealing your list.

## 0.195.3 (2026-10-28)

### Patch Changes

- 76d1eb7: Battle errors appear at the top of the screen, not under the battle events.
- 76d1eb7: Record a missed action only offers phases the chosen stratagem can be used in, and lets you change its cost.
- 76d1eb7: A stratagem's other prices grey out when it can't be used this phase, and its menu can record it as a missed action.

## 0.195.2 (2026-10-28)

### Patch Changes

- 1a74955: Passing the turn or ending a phase works again after undoing it, instead of leaving the phase stuck.

## 0.195.1 (2026-10-28)

### Patch Changes

- d187d11: Broadside Battlesuits can have 1 to 3 models in rosters and the combat simulator.
- d187d11: Crisis Starscythe Battlesuits and other units whose models each take two weapons from one list keep every weapon when split, no longer dropping some and flagging the unit illegal.
- d187d11: The optimizer's note says plainly when it didn't check every loadout.

## 0.195.0 (2026-10-28)

### Minor Changes

- 0398318: Swiss tournament organizers can reopen any table's finished result from the tournament page for its players to correct, even at tables they didn't play.
- b308810: The Apple Watch keeps the score, round and turn clock live while its app is open, even with your iPhone locked or off the battle screen.
- b308810: The Apple Watch can follow a live battle you're watching, naming both sides.

### Patch Changes

- 35b06b1: Pasting or dropping a .ros, .rosz or .regiztry file into Import roster says it isn't supported yet and asks for the text export.

## 0.194.3 (2026-10-27)

### Patch Changes

- 8ff8fa1: List checks flag an attached unit with more than one enhancement, counting upgrades, as the core rules allow only one.

## 0.194.2 (2026-10-27)

### Patch Changes

- 4a3aad3: Official-app Steel Hammer lists import Character vehicles with their Warlord and enhancement, and the builder offers Warlord to a vehicle once it's a Character.

## 0.194.1 (2026-10-27)

### Patch Changes

- 49912eb: A sealed game whose battle is still being set up or played stays under Up next, not past sealed games.
- 49912eb: A club's overview lists sealed-game battles among its recent games, so it's no longer empty for clubs that only play sealed games.

## 0.194.0 (2026-10-27)

### Minor Changes

- 8f3ed45: Club pages open on an overview with a card for what's waiting on you, and the leaderboard, season and sealed games on their own tabs.
- 346c812: Club organizers can set a deadline for each season round; games unfinished by then show as overdue.
- 346c812: Clubs can run a season where every joining member plays each other once, with fixtures and a table on the club page.
- a284ef8: Once a tournament or club game reveals rosters, anyone who can see them can save every list in one text file.
- 6bffbc3: Every Swiss tournament player is notified when a new round is paired.
- 5a43af8: A sample tournament with made-up players shows sealed lists, the reveal, Swiss rounds with a bye and the standings, so you can see one run before starting your own.
- 7f8b691: Organizers can remind players who haven’t sealed their list yet, once a day.
- d5fc3a9: Swiss tournament players can withdraw and organizers can drop a no-show, so the next round still pairs.
- 6d60f27: Swiss rounds mark a table as a rematch when its players have already met in the tournament.
- 841aa73: Players can't reopen a Swiss round's results once the next round is paired.
- 298668b: Export a tournament's or sealed game's results table as CSV once rosters are revealed.

### Patch Changes

- a0599eb: AI assistants now know tournaments can run Swiss rounds.
- 8f3ed45: Past sealed games on a club page are separate cards, no longer running into each other.
- 8f3ed45: A club's recent games show its six latest battles instead of three.
- 8f3ed45: Results tables show players' full names on a phone, not cut short.
- 8f3ed45: A sample tournament link to a missing stage opens the first stage instead of failing.
- 8f3ed45: Battles in a Swiss tournament say which round and table they were.
- a0599eb: When a Swiss round can't avoid every rematch, it makes as few as possible.
- a0599eb: A tournament too large to read in full no longer pairs its next Swiss round from incomplete results.
- 8f3ed45: After your Swiss battle, the tournament page says it's done and when the next round is paired.
- 8f3ed45: A Swiss tournament page offers Resume battle while your round's battle is in play.

## 0.193.2 (2026-10-26)

### Patch Changes

- 8c58d35: Players who sign up with Apple without sharing their name are asked to choose a display name, so they don't appear nameless.
- 5f577d6: Assistants link Imperial Knights allies, such as an Armiger in an Ultramarines or Astra Militarum army, to their datasheets.
- 8b044dc: Assistants can simulate and link datasheets for a chapter's Space Marines codex units, such as Ultramarines Intercessors.
- 8b044dc: Assistants find factions however apostrophes are typed, such as Tau Empire or Emperor's Children, and rank current rules above archived ones in faction search.
- eeafc4b: Opening a roster shows its units and points sooner, and unit list search is faster on phones.
- 3ccb0af: Feedback you're writing no longer clears when your earlier conversations finish loading.
- eeafc4b: A roster keeps View mode if you last chose it, instead of sometimes reopening in Build.
- cd21ca4: Imported official-app lists keep specialists listed under a squad's ordinary troopers, such as a Tempestus Command Squad's medic and vox operator or a Tempestus Aquilons squad's long-las and plasma carbine.
- eeafc4b: Datasheet pages stay responsive on phones while their rules text loads.
- af76f84: Weapon names with a rule in brackets, such as a Tempestus Scion's plasma gun, show their closing bracket.

## 0.193.1 (2026-10-26)

### Patch Changes

- 485c618: Search boxes ignore accents and curly apostrophes, and match words in any order.
- 485c618: The privacy docs say deleting your account also deletes clubs you own, for all their members.
- 485c618: Delete account warnings say it also deletes clubs you own.
- 485c618: Data updates no longer drop points and datasheet changes published between releases.
- 485c618: Roster setup's detachment search ignores accents and curly apostrophes, and matches words in any order.
- 485c618: Docs links use current page names, not old addresses that no longer open.
- 485c618: The sign-in docs no longer say battles need an account, and the More page no longer calls battles private.
- 485c618: Text export from the library keeps a roster's agreed points limit, as the builder's does.
- 485c618: Opening many battles in one visit no longer stops later ones updating live.
- 485c618: Tournament docs name the Simulate button as shown on each player's card.
- 485c618: 2v1 battle mission choices offer the chosen battlefield's objectives instead of asking for typed names.

## 0.193.0 (2026-10-25)

### Minor Changes

- f966973: 2v1 and doubles battles and tournaments set points per army, such as 1,750 against 800 each, and allies can bring smaller lists.

### Patch Changes

- 5091cd1: Assistants can plan a chapter army with a Space Marines codex detachment, seeing only the units it allows.
- 5091cd1: Units only one detachment allows, such as Deathwatch in a chapter army, appear in the picker with it and are flagged in lists without it.
- f966973: Tournaments with their own points total accept lists built to it.
- 5424d97: Official-app text that lost its blank lines and price brackets in pasting now imports, rather than being refused as unsupported.
- 5424d97: Imported official-app lists read a Gun Servitor as the servitor its weapon marks, so Inquisitorial Agents no longer cost an extra servitor.
- 5424d97: Imported official-app Bladeguard Veteran Squads keep their Master-crafted Power Swords (power weapons in the catalogue).
- 5424d97: Imported official-app lists keep a sergeant's swapped weapon on the sergeant, so a Scout Squad with a shotgun sergeant is no longer priced as ten models.
- 5091cd1: Points caps, such as a chapter's 500 points of Deathwatch, are checked against what the units cost your list.
- aa3eaf2: Club player rows and actions stay inside sealed game cards on narrow screens.

  Combat simulations work again between revealed club lists, including combined team armies.

  New club games open from a compact page action, so club activity leads the page.

  Roster viewing controls line up across club player rows.

  Choosing an opponent for a club game shows player avatars.

  Sealed club games move to Past when a new game starts or their game day ends; battles stay resumable and revealed lists can still be viewed and simulated.

- 5091cd1: Data updates no longer mark every datasheet new when a rules version is added.
- 5091cd1: Data updates no longer list each army's changes twice, under the army and under the current rules version.

## 0.192.1 (2026-10-25)

### Patch Changes

- a9f61bf: Past sealed games stay open on the club page, with Delete in each ⋯ menu.
- a9f61bf: Sealed games show player and list names in capitals, like battle and roster cards.
- a9f61bf: Team sealed games take less room, and you join a side from its open seat.

## 0.192.0 (2026-10-25)

### Minor Changes

- 75017e2: A club's sealed game can be a duel, solo vs pair, or doubles, with players picking sides.
- a44c340: Clubs give your club or friend group a standing leaderboard: pick the club at battle setup and the result counts toward its ratings.
- 059f3fd: A duel tournament can play a battle size at its own points, such as Incursion at 750.
- 059f3fd: Tournaments and sealed games can set a play date and a roster deadline, after which entrants without a sealed roster sit out.
- c9918af: Clubs and tournaments open from an Events menu in the header and their own rows on the More screen.
- 5de7e66: Filter a faction's datasheet list by keyword, Legends and Crucible, or your favourites or collection.
- 9836cc6: Getting started walks you through building or importing an army and trying a matchup, signed in or not, with battle, friend and tournament help on their own pages.
- a1b8ea4: Every existing league is now a club with the same people, and each event a sealed game whose battles count on the club's leaderboard.
- c9918af: Duel tournaments can play Swiss rounds: the organizer pairs each round on scores so far without rematches, and results rank by match points, victory points and strength of schedule.
- a1b8ea4: Leagues are now single-event sealed-roster tournaments, or sealed games when a club plays one.

### Patch Changes

- 8ce50cb: Battle cards show status as a coloured left edge, not a score bar across the top.
- 8ce50cb: Finished battle cards fade the losing side so the winners stand out.
- 64bc2b0: A sealed duel marks an opponent you're still playing as Playing, not Played.
- 64bc2b0: Requests to join a club show at the top of the club page for organizers to see first.
- 64bc2b0: A club's members list marks its owner and admins; start a club battle from New game.
- 64bc2b0: A club's sealed games list each battle on one tappable line with its score.
- 64bc2b0: Withdraw a club join request from the club page's request card.
- 45d9e67: Declining a tournament request, rejecting or cancelling a friend request, cancelling an invite link, revoking an app, returning a lent roster and removing an alert ask first.
- 5a71081: Detachment cards on a faction page open from their edges too.
- 5a71081: Faction cards on the factions page open wherever you click them.
- 411ef9f: A faction page's Datasheets, Data updates and Public armies links sit side by side on wide screens.
- 5823f7d: A faction's overview shows the same datasheet count as its datasheets page.
- 214ed75: A faction page shows its public army count beside its Datasheets link.
- c41370a: Imported lists keep the melee weapon chosen for a heavy weapon Chaos Terminator.
- c41370a: Imported lists keep a squad's swapped weapons when several loadouts share a weapon, such as Red Corsairs Raiders' meltaguns and power fists.
- 5de7e66: Legends and Crucible datasheets are available offline.
- 99f1e33: An edit made just before leaving a roster is no longer lost.

## 0.191.1 (2026-10-25)

### Patch Changes

- 25060a5: A faction's datasheets page counts every datasheet it lists, including Legends and Crucible.

## 0.191.0 (2026-10-25)

### Minor Changes

- 35b604c: League organizers can choose what an event allows beyond matched play, such as Legends, Crucible or no Warlord, and lists needing anything else are refused at sealing.
- 3535786: The unit picker can show Legends and Crucible datasheets to add to a list.
- d047ef3: Legends and Crucible datasheets have their own reference pages, on each faction's datasheets page and in search, with profiles, base sizes, abilities, wargear and points.

### Patch Changes

- 9344eea: Battle setup is more compact: Warlord and battle ready choices share one row under each army, and each side's Force Disposition sits under its mission, where allies pick theirs.
- 6797631: The embark menu no longer lets a transport's capacity overlap its name.
- 6797631: A transport's card names every unit in an embarked attached unit, such as its Leader, without a model count pushing Disembark to its own line.
- 6797631: An embarked unit isn't offered other transports; remove it first to move it.
- ac41212: A faction's detachments sit side by side on wider screens.
- ee442e7: The factions page lists factions in columns on wider screens.
- 54ed7d1: The force dispositions page lists each disposition's primary mission per opponent.
- 45dc515: The friends page leads with your friends, shows how many games you've played each and when, and starts a battle with one click.
- cae3779: The signed-in home page shows two games per section, linking to the rest of your, your friends' and public games.
- d732546: The docs explain how to run a league, play in one, and fix a refused seal.
- d047ef3: Legends units use Munitorum Field Manual points where it prices them, not the community catalogue's.
- 3535786: A Legends unit's datasheet no longer links to a missing full-datasheet page.
- f743583: Datasheets show keywords only some models have, such as CHARACTER and OFFICER on a Command Squad's commander, apart from those every model has.
- 9344eea: In battle, each side's primary mission shows its Force Disposition.
- 6797631: When an edit leaves a unit too big for its transport, a brief message says so rather than a lasting note on its card.
- 817dbd1: A transport's datasheet in the roster builder shows its model capacity.
- 8af1871: Roster menus drop Convert rules version: change it in Edit roster setup, which also offers Keep the original.
- 7db257d: Roster action menus match the unit card's style and group actions, with Delete set apart at the bottom.
- 985c605: The team's support replies show images and links properly, and the conversation list no longer shows their markdown.
- 6797631: A unit's action menu groups its actions, with Delete unit set apart at the bottom.

## 0.190.0 (2026-10-24)

### Minor Changes

- d2cf1b1: Ability alerts belong to you, not one roster: set one once and every unit with that ability, in any roster, alerts in battle.
- f27470e: Keep a unit's custom name in its saved loadout.
- 6156b2f: Save a unit and its attached characters as one attached unit, and add it to another roster already attached.
- 57f0a01: Allies in a 2v1 or 2v2 battle or league keep their own Warlords and choose whose leads their side.
- d37e254: Your Warlord now has a crown beside its name in the roster list.
- fa1701c: A list with a possible Warlord is flagged unless it names exactly one, as the core rules require; untick Warlord under Format restrictions to play without.

### Patch Changes

- 7e3291d: The attach menu offers only pairings the roster then accepts.
- 5757cb4: A battle action lost to a dropped connection asks you to check your connection instead of showing a raw browser error.
- fba81aa: The unit picker finds units by detachment-given keywords, such as Ogryns, Bullgryns and Ratlings by Abhuman in Abhuman Auxiliaries.
- b86c07e: Embarked units and boarding choices show custom names, to tell similar squads apart.
- b383ca2: Official-app imports no longer report a Space Marine character's Chainsword as unplaced.
- b383ca2: Official-app imports give a Death Korps medi-pack or Simulacrum Imperialis to the model carrying it, instead of reporting it unplaced.
- b383ca2: Official-app imports no longer report Death Riders' Savage claws as unplaced.
- 2bb6216: Ratlings, Tzaangors and the Ironclad Dreadnought can take all their optional wargear together, not just one piece.
- fba81aa: In King of the Colosseum, the picker allows two of a unit your detachment makes Battleline, such as Gretchin in Runt Swarm.
- 0a67118: You can build rosters and compare loadouts on older browsers.
- 9d03c28: Each Bullgryn, Troupe Player and Corsair Cloud Dancer can take its own wargear, not one choice for the whole squad.
- fba81aa: The unit picker files units where your detachment moves them, such as Gretchin under Battleline in Runt Swarm.
- d37e254: Adding a unit that must be your Warlord takes the role from your current one instead of leaving two.
- 9c76bd1: Resizing a squad with mixed wargear keeps your picks, giving added models standard wargear and removing standard-equipped models first.
- 55fbffb: You can retry drawing secondary missions after a failed battle action.
- 7e3291d: Removing a character from a simulated unit keeps a Loyal Protector with its Command Squad.

## 0.189.0 (2026-10-24)

### Minor Changes

- a56ca27: Attached units sit on their bodyguard's shelf, bodyguard first with leaders and support indented under it, not on a shared Attached units shelf; each shelf's heading shows its units' cost.

### Patch Changes

- b90a70b: Rosters, battles, battle actions and visibility changes made through an AI assistant are counted like those made on the site.
- fa4c778: Imports read official-app points grouped with an apostrophe, as in Swiss German exports.
- 8a55c07: Screen readers name each attached unit's outline after the unit the others joined, not "Attached unit".
- 5033dad: Failed sign-ins and sign-ups record why, such as a wrong password, rate limiting or a dropped connection, to tell those problems apart.
- 3ff8c88: Battles that play out their final round count as finished, not only those ended early.
- a821bd2: Battle analytics identify each battle by its internal id, so its start and finish can be matched.
- 99d4f05: Datasheet pages have an Add to roster button beside the Add to menu for favourites and the collection.
- b1a3e56: An old datasheet page address, with or without the id suffix a same-named datasheet adds, redirects to its current page instead of not found.
- e767992: A datasheet page keeps its address when its book also lists another faction's same-named datasheet, such as Deathwatch's Watch Master beside the Agents of the Imperium one.
- 703b537: A battle army's Destroyed shelf stays open as you bring units back and lose them again, instead of closing whenever it empties.
- a56ca27: A leader or support unit's menu offers Detach from unit.
- 13968b5: The Discord links point to the new invite.
- fb794e1: Holding a More or Fewer count button steps until you let go or hit the limit.
- d834ba9: A league page says what happens next at each stage, from sharing the invite link to revealing rosters and starting the next event, for the organizer and its players.
- 14b34a9: The assistant help page explains "This app is no longer registered", and connection pages point back to your assistant.
- 02d3875: When an AI app's connection request has expired or the app is no longer registered, the consent page says so and asks you to restart from the app; other loading failures show the usual error page, not an expired request.
- bdd2c65: Pasting a New Recruit share link explains that the list's exported text is needed.
- 0e7e914: Visits to missing pages, including direct links, are counted by kind of address.
- 7819354: Pages stay responsive while the offline reference downloads: it's unpacked and saved in the background, so taps and typing no longer wait up to a second.
- 44c1622: Pick simulator survivor, weapon and wound counts, and counted mission scores, from the number between their buttons.
- b861bb0: The browser console no longer logs a message on every live-update connection.
- 1928ca4: Going back while choosing a battle roster closes the list instead of leaving the battle.
- 30be48d: The `simulate_combat` assistant tool answers matchups it can't estimate with a normal result naming each refused phase and why, keeping errors for unknown units, illegal sizes or attachments, and unavailable data.
- 41c92fb: A tab left open across an update loads the new version when you change page or a page fails, instead of an error Try again couldn't clear.
- eb29a60: Signed-out tabs keep one live-update connection rather than reconnecting as someone new every four minutes.
- 80c4c21: Comparing a variant with its base no longer marks a unit changed just because units before its transport moved, but does mark one that starts in a different transport.
- ac969bf: Pages and the army builder stay fast right after an update, not slow for the first few minutes.

## 0.188.3 (2026-10-24)

### Patch Changes

- 855bafa: Long unit names, such as Militarum Tempestus Command Squad, wrap in the unit editor on small phones instead of running off screen.

## 0.188.2 (2026-10-24)

### Patch Changes

- 43ad719: The email saying we replied looks like Praetorium, with a button to open the conversation.
- de203c6: The email saying we replied names who replied and which message it's about, and that replying to the email doesn't reach us.

## 0.188.1 (2026-10-24)

### Patch Changes

- f4a096e: Twelve Chapter Approved terrain layouts join footprints the publisher's diagrams mark as one terrain area, including Purge the Foe / Reconnaissance Layout B.
- 07bd36b: The eye marking joined footprints no longer hides under the objective marker on central objective terrain.

## 0.188.0 (2026-10-24)

### Minor Changes

- a536821: Replies to your feedback email you a link to the conversation, once per run of replies.

### Patch Changes

- e60e18f: A link to one of your feedback conversations opens it over the Support page.
- c761fc3: A reply you send no longer briefly shows twice while delivering.
- e60e18f: When signed in, the account button marks a reply to your feedback before you open the conversation.

## 0.187.0 (2026-10-24)

### Minor Changes

- 5d266fb: Photos of your models' other builds, such as a magnetised Leman Russ set up as a Demolisher, are filed under that build and show on its datasheet, staying with one collection entry.
- 51e0ba6: Mark what else your collection's models can be, such as each build of a magnetised Leman Russ; a roster's Your collection section counts each model once wherever it's used.
- 6ea1cc4: Terrain layouts mark footprints joined into one terrain area with an eye, as the publisher's diagrams do, explained in the legend.

## 0.186.0 (2026-10-24)

### Minor Changes

- 6bd9051: Feedback opens a support panel over your current page to read and answer our replies. Reopen it from the account menu, the More tab or the Support page; signed in, conversations follow you to every device.

## 0.185.0 (2026-10-24)

### Minor Changes

- 34b6bf9: Embark units in transports from the roster cards; each transport lists who starts inside, and battle setup starts them there, which you can change. An attached unit embarks and takes another Leader or Support unit from the foot of its outline. A change that stops a unit fitting removes it, and its card or outline says why.

## 0.184.5 (2026-10-24)

### Patch Changes

- a87cc47: Nork Deddog, Ogryn Bodyguard and Regimental Attachés can embark in any transport their Command Squad can, a Loyal Protector taking 3 models' space.

## 0.184.4 (2026-10-24)

### Patch Changes

- 6d3e8b8: The agent combat tool and simulator links can field a unit joined to an attached unit, such as Nork Deddog with the Cadian Command Squad leading Cadian Shock Troops.

## 0.184.3 (2026-10-24)

### Patch Changes

- f6fc73c: An Inquisitor leading a unit can embark in any transport its bodyguard can, per Authority of the Inquisition.

## 0.184.2 (2026-10-24)

### Patch Changes

- 2617042: An invulnerable save no longer shows as a granted ability.
- 2617042: Shared army abilities a datasheet links to apply, such as Psychic Hood, Fulgrim's Daemonic Speed and the Norn Emissary's Unnatural Resistance.
- 2617042: Nork Deddog and Ogryn Bodyguard give their Command Squad's Officer Feel No Pain 4+ while they stand.

## 0.184.1 (2026-10-24)

### Patch Changes

- 1ece916: Discord announcements show what's changed once an update is live.
- 1ece916: The Discord invite opens the welcome channel when you join.

## 0.184.0 (2026-10-24)

### Minor Changes

- 68c83e8: Attached units share a shelf in the roster builder, outlined with total points and the bodyguard's custom name; untick Group attached units in the roster menu to keep role shelves.

### Patch Changes

- 68c83e8: The roster menu groups actions under Play, Setup, Copies and access, Share and Display.

## 0.183.3 (2026-10-23)

### Patch Changes

- 19a5750: Leaders whose attachments name unit types no longer offer single-model characters as bodyguards, such as a Runtherd leading Grotmas Gitz.

## 0.183.2 (2026-10-23)

### Patch Changes

- 58df806: Nork Deddog and Ogryn Bodyguard join the unit their Command Squad leads, so the simulator and reserves see one unit.

## 0.183.1 (2026-10-23)

### Patch Changes

- a0579d7: The combat simulator accepts an Inquisitor leading Tempestus Scions in Bridgehead Strike.

## 0.183.0 (2026-10-23)

### Minor Changes

- 68a78e5: Terrain layouts outline each terrain area's pieces together, so they don't look like separate touching pieces.

## 0.182.4 (2026-10-23)

### Patch Changes

- 4db3c94: A unit has every keyword of its models, so Chaplain Grimaldus, Marneus Calgar and Canis Rex show Character, Vehicle and other model keywords, and keyword rules and attachments use them.

## 0.182.3 (2026-10-23)

### Patch Changes

- 8bdecc7: A Skitarii Rangers or Vanguard specialist replaces a galvanic-rifle or radium-carbine squadmate, keeping the squad at ten models; each specialist is added or removed on its own, and lists with a transuranic arquebus or omnispex import.

## 0.182.2 (2026-10-23)

### Patch Changes

- 091533e: A Militarum Tempestus Command Squad can take its regimental standard and master vox again.
- 091533e: Weapon buttons in a group a specialist has shrunk change the weapon you press, not another.
- 091533e: A specialist replacing a squadmate, such as a Tempestus Scion with a medi-pack or regimental standard, takes that squadmate's weapon, so a Militarum Tempestus Command Squad with a plasma gun and meltagun stays legal.

## 0.182.1 (2026-10-23)

### Patch Changes

- 86f7e86: Crucible Champion of the Chapter and Librarius Adept no longer offer Character units as bodyguards.

## 0.182.0 (2026-10-23)

### Minor Changes

- 218332d: Give roster units an optional custom name, shown above the datasheet name to anyone who can see the roster.

## 0.181.3 (2026-10-23)

### Patch Changes

- 81fd67d: Datasheet pages list the Command Squads an Ogryn Bodyguard or Nork Deddog can join, and other attachments only catalogue unit links record.

## 0.181.2 (2026-10-23)

### Patch Changes

- 4999dc2: Inquisitors can lead units a detachment makes Imperium Battleline Infantry, such as Tempestus Scions in Bridgehead Strike.
- 4999dc2: Bridgehead Strike makes Tempestus Scions Battleline when a Militarum Tempestus Officer is the Warlord.
- 4999dc2: Detachments that double a unit limit, such as Bridgehead Strike for Tempestus Scions, double it in the builder.

## 0.181.1 (2026-10-23)

### Patch Changes

- 39298a4: Ogryn Bodyguard and Nork Deddog can join a Command Squad.

## 0.181.0 (2026-10-23)

### Minor Changes

- ca5f8b3: Profiles show results against each opponent.
- ca5f8b3: Profiles show each stratagem's win rate and the best and worst used in three or more battles.
- ca5f8b3: Anyone can see a player's performance over time on their profile.
- ca5f8b3: Profile stratagem and secondary mission tables show the top ten, with Show all for the rest.

### Patch Changes

- ca5f8b3: A stratagem or secondary mission renamed by a data update no longer appears twice on a profile.

## 0.180.0 (2026-10-23)

### Minor Changes

- 7c6579e: The Battle privacy setting is gone: anyone can find and watch any battle.
- 7c6579e: Every collection is public: the Show collection on profile setting is gone.
- 7c6579e: The Text size setting is gone; use browser or device zoom instead.

### Patch Changes

- 7c6579e: Account settings show sign-in methods and two-factor authentication in one panel, and connected assistants such as Claude, ChatGPT, Codex and Gemini with their logos.

## 0.179.5 (2026-10-23)

### Patch Changes

- 00d30e8: The Praetorium plugin adds skills that guide assistants through building a roster, comparing two units and tracking a battle.
- 1bd7432: Connected apps on your profile links to setup steps for Claude, ChatGPT or Gemini.
- 3e477d5: Imports keep a pistol or melee swap inside a chosen loadout, such as two Death Korps Watchmasters with plasma pistols and power weapons.
- 3e477d5: Imports give a Krieg Command Squad veteran its stated power weapon when the Lord Commissar swaps his for a power fist, and warn when a stated weapon is dropped even if a wargear group shares its name.
- 390e892: A Death Korps Watchmaster can swap their laspistol for a bolt or plasma pistol and chainsword for a power weapon, and search finds Death Korps of Krieg by those weapons.
- 874b18d: An AI assistant that saves a roster gets its Praetorium link to share.

## 0.179.4 (2026-10-23)

### Patch Changes

- edabe2c: AI assistants treat roster and battle changes as visible to other players, since rosters and battles can be public.

## 0.179.3 (2026-10-23)

### Patch Changes

- b50724c: Connect an assistant links to Praetorium in Claude's connector directory, gives setup steps for ChatGPT and Gemini, and shows the Connect to Praetorium page; account docs show Connected apps.
- 1cb69a0: Simulator links from an AI assistant's combat simulation are full praetorium.gg addresses that open from the chat.
- 0071b2a: AI assistants and connector directories show each Praetorium tool by a readable name, such as "List my saved rosters".

## 0.179.2 (2026-10-23)

### Patch Changes

- e4ce5d5: The roster editor and faction datasheet lists match misspelt unit names, as global search does.
- e4ce5d5: The roster editor and faction datasheet lists find units by what their abilities do, as global search does.
- 430060e: The docs explain what search matches and how to search Praetorium from your address bar.

## 0.179.1 (2026-10-22)

### Patch Changes

- 34c77d5: The privacy policy and account deletion confirmation list GitHub with Apple, Google and Discord as sign-in providers.

## 0.179.0 (2026-10-22)

### Minor Changes

- f0ae1df: Player guides are now docs: short pages on building and importing lists, the combat simulator, battles and AI assistants, with screenshots outlining each step's control, a troubleshooting page per area, and a docs search that finds problems by symptom. Old guide links redirect.

### Patch Changes

- a0058b1: Send feedback leaves the desktop footer; it stays in the account menu and on the Support page.
- b6a9dc5: The Support page leads with docs search and each area's troubleshooting page; account and app help lives in the docs.

## 0.178.1 (2026-10-22)

### Patch Changes

- 5a88c2c: The app shows the logo while Praetorium opens, on the header and tab bar background, instead of a small spinner.
- e9c5292: Scrolling in the iPhone app keeps its momentum, like Safari.
- 0f9c500: More leads with the combat simulator, missions, rules and leagues as large tiles, with the rest grouped below.

## 0.178.0 (2026-10-22)

### Minor Changes

- 011f38f: The force dispositions page shows how many detachments and armies can field each disposition.

### Patch Changes

- 72114bf: Official-app imports keep a Relic Greataxe, multi-melta Eradicator, Thunderwolf Cavalry Pack Leader and Wulfen Death Totem, which the catalogue names differently.
- 72114bf: Official-app text imports read every weapon when several share one bullet.
- 72114bf: Official-app text copied without its title line imports instead of being refused.
- 86cc1fd: Search shows recent searches and the page list in one scrolling list.

## 0.177.0 (2026-10-22)

### Minor Changes

- 3f79de8: The header shows every section, including Factions, Missions, Force dispositions and Rules, in one bar on wide screens or two rows on narrower ones, and stays pinned while you scroll.
- c39412a: Profile photos open in a viewer instead of a new tab, and every photo viewer steps between photos with its arrows or the arrow keys.

### Patch Changes

- 3f79de8: The header and phone tab bar are darker, and the search box stands out.
- b520550: Pages no longer show a rules text sources banner; choose sources from any rule without text yet.
- 3f79de8: Search on phones opens as a panel near the top instead of covering the page.
- c39412a: Profile collections use the same faction sections and datasheet cards as your own, with owned, built and painted counts for every datasheet.

## 0.176.0 (2026-10-22)

### Minor Changes

- 79400bb: In 2v1 and 2v2 league events, revealed roster comparisons can field both lists of a pair together, starting with your team against your opponent's.
- 79400bb: The simulator's Rosters comparison lists friends' public rosters and revealed league lists alongside your own.
- 79400bb: Simulate on a unit in another player's roster or revealed league list opens the combat simulator with it defending against one of your rosters.
- 79400bb: The combat simulator's roster picker lists friends' rosters from revealed league events.
- 79400bb: The combat simulator shows each side's roster owner and avatar on unit cards, recent simulations and roster comparisons.

### Patch Changes

- 3628925: A unit's equipped weapons include those from its chosen wargear options, such as a Defiler's two excruciator cannons.
- 79400bb: The roster comparison is easier to read: tabs switch phases, a bar tracks a running comparison, cells shade by result, best matchups are outlined, a pair's units group under each player, and units that can't attack say why once.
- 79400bb: The simulator's Calculation uses section lists both sides' active rules and buffs, chosen weapon options and left-out weapons, plus manual modifiers.
- 79400bb: Reopening a simulator link with a roster side no longer calls the roster unavailable while it loads.
- 79400bb: The simulator's Rules & buffs and Manual modifiers headings open from anywhere on their row.
- 79400bb: Rosters flag a Support unit not attached to a Bodyguard unit as illegal, and the simulator asks you to attach it before calculating its attacks.

## 0.175.5 (2026-10-22)

### Patch Changes

- 2b0f0b7: Rules text that once arrived broken no longer stays missing on that device.
- 2b0f0b7: When rules text can't load from its community source, each rule says so and offers Try again instead of a dash.

## 0.175.4 (2026-10-21)

### Patch Changes

- 2f5dceb: Salamanders rosters with Deathwatch Support and Forgefather's Seekers import without losing either detachment.

## 0.175.3 (2026-10-21)

### Patch Changes

- a6fd686: Loadout optimization keeps working after a fresh reference download.

## 0.175.2 (2026-10-21)

### Patch Changes

- 207b249: A faction's datasheet list no longer sometimes takes many seconds to open.

## 0.175.1 (2026-10-21)

### Patch Changes

- e8733a1: Each rule on a rules page offers to load its text in place, as datasheets do, instead of one notice at the top.
- e8733a1: The rules text sources question appears only on pages showing rules text, such as factions, rules, missions, rosters, battles and the simulator.

## 0.175.0 (2026-10-21)

### Minor Changes

- 9b118e3: Optimizing a squad with a huge choice of weapons, such as Plague Marines, Legionaries or Chaos Terminators, finishes in seconds instead of running for minutes and giving up. With too many loadouts to compare, the simulator improves one step by step from several starting points and says so.

### Patch Changes

- e541595: Building and changing units is faster, speeding loadout optimizing by about a quarter.
- 9b118e3: Optimizing a unit no longer fails when some loadouts use rules the simulator can't estimate, such as Einhyr Hearthguard's; it leaves those out and says so.

## 0.174.4 (2026-10-20)

### Patch Changes

- e9f37be: Loadout optimizing in the combat simulator is faster again, taking about a third of the time in a full army.
- e9f37be: Comparing two whole rosters in the combat simulator readies units several times faster.

## 0.174.3 (2026-10-20)

### Patch Changes

- 2f0ac37: New Recruit chapter rosters import with faction, disposition, attached units and allied datasheets intact.

## 0.174.2 (2026-10-20)

### Patch Changes

- 60d176d: Loadout optimizing in the combat simulator finishes about a third sooner.

## 0.174.1 (2026-10-20)

### Patch Changes

- b886786: Official-app lists in another language, such as German, import with their units, attachments, Warlord and enhancements.
- b886786: An imported list with an unrecognised force disposition takes its detachment's, or asks you to choose one in setup.

## 0.174.0 (2026-10-20)

### Minor Changes

- 5b0d920: Built and painted collection counts have Max actions, and newer collection edits, profile changes and simulator roster selections survive while requests finish.

## 0.173.3 (2026-10-20)

### Patch Changes

- dc23723: Collection and wishlist cards are smaller, suggestions fill free slots, and uploaded photos load faster from smaller previews.

## 0.173.2 (2026-10-20)

### Patch Changes

- c4f77e5: Collection factions show owned, built, and painted totals with compact datasheet cards on desktop and phones.
- c4f77e5: Wishlist suggestions no longer recommend models already in your collection.

## 0.173.1 (2026-10-20)

### Patch Changes

- 4f3a0fe: Each army's collection spreads across the page width.
- dce0223: Show From your battles above the wishlist on the collection page.
- 49d43be: Collection suggestions skip armies whose rosters are all archived.

## 0.173.0 (2026-10-20)

### Minor Changes

- b475841: Wishlist suggests datasheets other players' public rosters field in your armies that none of yours use.

### Patch Changes

- b475841: A collection datasheet's owned, built and painted counts sit beneath its name.
- b475841: Open a datasheet from its name in the collection's From your battles suggestions.
- b475841: Collection and wishlist datasheet pickers show faction marks and points, like the simulator's unit picker.

## 0.172.1 (2026-10-20)

### Patch Changes

- 3b2a3cf: Simulator is third in desktop navigation, and its page background matches the others.

## 0.172.0 (2026-10-20)

### Minor Changes

- ed4557d: After league rosters are revealed, you can make your original saved roster public for others to discover and copy.

## 0.171.0 (2026-10-20)

### Minor Changes

- 39134a4: Factions, Missions, Force dispositions and Rules sit in a row beneath the desktop header instead of a Reference menu, and every section link stays visible at narrow desktop widths.

## 0.170.0 (2026-10-20)

### Minor Changes

- 73fd3fa: Simulate a unit from your saved rosters or a friend's public roster, with its detachment, enhancements and attachments, against any unit in the combat simulator.

### Patch Changes

- 73fd3fa: Recent matchups are now recent simulations; the home page shows the newest three and links to the rest in the simulator.

## 0.169.4 (2026-10-19)

### Patch Changes

- 0ef0a11: Live updates stay connected for visitors, failed pages recover, and search, unit pickers and faction references stay responsive; Brood Brother Auxilia rules and options resolve consistently.

## 0.169.3 (2026-10-19)

### Patch Changes

- 5c5f02c: Roster text exports use one readable layout for copying or downloading.

  Official-app roster imports keep support attachments alongside leaders.

## 0.169.0 (2026-10-19)

### Minor Changes

- 5364dfe: Start a roster from a faction page with that faction chosen, or from any mission pack or matchup page.

## 0.168.0 (2026-10-19)

### Minor Changes

- 9b5923c: A new player guide shows how to add Praetorium to an AI assistant and look up units, points and matchups with source links.

## 0.167.1 (2026-10-19)

### Patch Changes

- a3e7e50: Resizing Skorpekh and Ophydian Destroyers keeps them within 3–6 models.

## 0.167.0 (2026-10-19)

### Minor Changes

- 0ef1ab4: The roster editor shows the model total beside the unit count.

## 0.166.0 (2026-10-19)

### Minor Changes

- adc4033: The simulator's Optimize dropdown builds a unit for ranged or melee combat.

## 0.165.3 (2026-10-19)

### Patch Changes

- e976019: Roster imports keep units with typographic hyphens, model names, paired weapons and one-per-army upgrades.

## 0.165.2 (2026-10-19)

### Patch Changes

- 309327d: Roster cards and loadouts count both copies of a weapon a model carries twice, such as a Sanctifier's two hand flamers.

## 0.165.1 (2026-10-18)

### Patch Changes

- 0e20317: Fixed-size squads such as Wyches, Kabalite Warriors and Strike Teams no longer offer other model counts, so a list without model counts imports them at full strength.

## 0.165.0 (2026-10-18)

### Minor Changes

- 9566d5e: Start a battle from a saved roster's menu with that roster already on your side.

## 0.164.2 (2026-10-18)

### Patch Changes

- 39dd32b: Sanctifiers can take their simulacrum imperialis and two-hand-flamer Sanctifiers, each replacing a hand-flamer Sanctifier, so the squad stays at nine models and lists with them import.

## 0.164.1 (2026-10-18)

### Patch Changes

- 81b6a09: Profile, roster, battle and update tabs wrap onto two lines on narrow phones and larger text sizes rather than widening the page.

## 0.164.0 (2026-10-18)

### Minor Changes

- 541ad35: After a guest game, the guest can sign up, prefilled with the name they played under, to add the battle to their record and the leaderboard and send the host a friend request.
- d5bf2fa: Seat an opponent without an account as a guest to track a real battle; it counts in your record but not on the leaderboard.
- 541ad35: A guest can scan the host's QR code or open their link to pick an army and play their side on their own device without an account, seeing the other side's actions live.
- d8cf26b: Without an account, the rosters page and builder work like a signed-in player's, keeping one roster on your device; starting another asks you to sign up and moves your roster into the new account.

### Patch Changes

- f106f1f: Battle setup no longer calls mission data unavailable for a side that hasn't chosen its army.

## 0.163.0 (2026-10-18)

### Minor Changes

- 90b7fb4: The roster builder shows points left, or how far over the limit you are, beside its points total.

### Patch Changes

- 90b7fb4: On phones, the roster builder's points and buttons fit one line before you sign in.

## 0.162.1 (2026-10-18)

### Patch Changes

- fc910ff: Mission cards get more scrolling space in mobile scoring prompts, even at larger text sizes.

## 0.162.0 (2026-10-18)

### Minor Changes

- edf4557: Recent combat simulator matchups save to your account and follow you across devices; signed-out visitors' devices no longer keep them.

### Patch Changes

- edf4557: Recent matchups show as a compact row of cards with each army’s mark and attached leaders; adding a leader updates its card instead of adding another.

## 0.161.2 (2026-10-18)

### Patch Changes

- 3d553fb: ListForge, Warmind and WTC-style exports comma-separate detachments so Warmind reads both, and ListForge exports mark enhancements for ListForge to apply.
- 7d165b0: Warmind imports no longer report wargear a unit already holds under its datacard name: Drazhar's Executioner's demiklaives, Lady Malys's blade and razor fan, and the Hand of the Archon's "Splinter Pistol and 1 Razorflail".
- 3d553fb: ListForge WTC lists naming their faction by keyword, such as Chaos Daemons, Chaos Space Marines and Space Marines, import.
- 3d553fb: ListForge lists with allied units no longer report the allies heading as unreadable.
- 3d553fb: An imported unit takes its text's model count, so a Piranha with two carbines no longer imports as two Piranhas.
- 2ccbfcc: A list naming every model in a squad imports exactly those, so Plague Marines with plague spewers and Chaos Bikers with meltaguns keep their specialists.
- 2ccbfcc: ListForge imports give each model its listed wargear, so a Hekatrix's blast pistol and power weapon and a Stealth Shas'vre's burst cannon no longer become the squad's weapons.
- 3d553fb: Warmind exports in ListForge or official app layout import with both detachments, battle size, disposition and wargear.
- b2bc5cb: Ungrouped upgrades a unit may take more than once can be chosen: Incubi and Aspect Shrine Tokens, a Bastion's heavy bolters and Scarab Occult Terminators' Hellfyre missile racks. Imports keep an Incubi Shrine Token.
- f797af1: A Piranha can carry both seeker missiles; two on one Piranha, or six across three, kept only one each.
- f797af1: Stealth Shas'ui with fusion blasters can be added after a squadmate takes a homing beacon, which left no model free for them.
- 4f188ee: Specialists can join fixed-size squads or squads whose minimum shrinks to make room: a Pathfinder Team's rail rifles and grenade launcher, and a five-model Intercessor Squad's grenade launcher. Choosing them did nothing, and imports called them missing.
- aa3c02c: A squad grown past its minimum adds default models, so a 10-model Terminator Assault Squad starts with lightning claws, not five storm shields, and each storm shield swapped in is charged. It had priced 25 points under the Munitorum Field Manual.
- 7d819c9: A Trygon with its Character upgrade can take Trygon Prime in Subterranean Assault, in the builder and imports. Options opened by the rest of the unit are offered, such as a Daemonic Charioteer's Slaanesh weapons with Daemon of Excess, the Desolation Sergeant's vengor launcher and the Hesyr's concussion gauntlet.

## 0.161.1 (2026-10-18)

### Patch Changes

- 14bec30: The homepage shows up to three each of played, friends' and public games.

  Live games stand out with filled green status badges and dark text.

## 0.161.0 (2026-10-18)

### Minor Changes

- c172dff: The Rosters page's Played tab lists armies from finished public battles with who played each and under which rules version; duplicate one to edit and simulate.
- 15bb37f: Played armies show their battle result like battle cards, with the score, factions faced and a battle link.
- 2f4ee7e: Save a configured unit as a loadout and add it from beneath its datasheet in another same-army roster's picker, which flags any choice its rules version, detachment or limits don't allow. Rename or delete saved loadouts from their picker menu.

## 0.160.1 (2026-10-18)

### Patch Changes

- 036bf2b: The Discord community invite no longer expires.

## 0.160.0 (2026-10-18)

### Minor Changes

- 9fa6e13: Open the Discord community and GitHub repository from icons beside Search in the header, or join Discord from Support.

## 0.159.1 (2026-10-18)

### Patch Changes

- a6b3cf6: Imports keep a weapon that brings its own model, such as a Terminator Squad's cyclone missile launcher, and the import review names any listed wargear the unit ended up without.
- e2202b9: Wargear chosen for several models in a squad costs points for each model holding it, so Deathwatch Terminators with storm shields cost 210, not 195.
- e2202b9: Squads whose models each carry several weapons, such as XV9 Hazard Battlesuits, no longer show a false "needs at least" warning at larger sizes.

## 0.159.0 (2026-10-18)

### Minor Changes

- c159027: Export rosters as ListForge, Warmind, and WTC-style text.
- 8329719: Import rosters pasted from ListForge, Warmind, and WTC-style tournament lists.

## 0.158.0 (2026-10-18)

### Minor Changes

- d26b3b9: Try an editable combat simulator example and reopen recent standalone matchups from the simulator or home page on this device.

### Patch Changes

- fce5392: A weapon chosen inside a model option, such as a Terminator's cyclone missile launcher, is charged once instead of twice.

## 0.157.5 (2026-10-18)

### Patch Changes

- 6c492db: An option taken by several identical models shows its full per-model price.
- 6c492db: Wargear options priced on the weapons they hold, such as Leman Russ sponson pairs, Knight Despoiler arms and Forgefiend cannons, are charged once, not twice.

## 0.157.4 (2026-10-18)

### Patch Changes

- ab66405: Screen readers announce failures to copy a roster link, leave an impersonated account, share a battle invite or load the unit picker.
- ab66405: Assistant tool and onboarding tour failures show in the error colour.
- ab66405: A faction link with a malformed rules version opens the faction's current rules, not an error page.
- ab66405: Combat simulator failures show in red, apart from prompts to choose models or weapons.
- ab66405: A text size chosen in one tab applies to your other open tabs straight away.

## 0.157.3 (2026-10-18)

### Patch Changes

- feea201: Keep selectors working after browser translation.

## 0.157.2 (2026-10-17)

### Patch Changes

- 6dcd5a4: Screen readers announce failures in account security, sign-in, sharing settings, battle setup and creation, friend invites and notifications as they appear.
- 6dcd5a4: Copying recovery codes or a collection CSV says when the browser refuses the copy.
- 6dcd5a4: Friend invite links now show a titled preview card when shared.
- 6dcd5a4: A league list refused for marking three or more Warlords names them as "A, B and C" instead of "A, B, and C".
- 6dcd5a4: Battle setup names three or more waiting players as "A, B and C" instead of "A and B and C".
- 6dcd5a4: Roster build and view switching, and remembered panes and tabs, no longer break when the browser blocks storage.

## 0.157.1 (2026-10-17)

### Patch Changes

- 9b7facd: Everywhere rules text isn't loaded has a Choose sources link.
- 9b7facd: Rules text prompts and the sources banner no longer flash the wrong state while a page loads.

## 0.157.0 (2026-10-17)

### Minor Changes

- 8fc51b8: Datasheet abilities, enhancements and other rules text show once you turn BSData on, with one prompt per page naming the source until you do.
- 073f2e4: Choose which community sources load rules text on your device in one dialog, opened from any page missing text, and change it later on the Data sources page.
- a851682: Stratagems, detachment and army rules, and datasheet wording from Game Datacards load in your browser wherever they appear once you turn it on.
- 9a7faaf: Core rules pages show rule numbers and titles, and load rules text from Game Datacards in your browser once you turn it on.

## 0.156.1 (2026-10-17)

### Patch Changes

- 9e02e74: A battle link opened right after sharing opens the battle once ready instead of staying on "Nothing here".

## 0.156.0 (2026-10-17)

### Minor Changes

- 57e2654: Before you type, search lists results you opened recently, which you can remove one by one or clear.

### Patch Changes

- 5b3e162: A painted count entered right after changing the built count is no longer reset to zero.
- 94653bd: Loadout optimisation is up to ten times faster, finishes for large squads such as Plague Marines, shows progress from the start, and no longer slows the service for others.
- 57e2654: Datasheets, rules and other reference pages open from your downloaded reference while it's up to date.
- 790bce3: The roster builder prices units and opens datasheets on your device while downloaded rules are current.
- 57e2654: Search shows results as you type once the reference downloads, without waiting for the server.
- 57e2654: The offline download is smaller, its pages and search work before it finishes, and older rules versions download only when a roster of yours uses them.

## 0.155.2 (2026-10-17)

### Patch Changes

- b846272: A squad imported without specialists no longer gets vox-casters or other specialists it didn't take.
- b846272: Imports place enhancements whose name ends in "(Upgrade)", such as Furious Assault, again.

## 0.155.1 (2026-10-17)

### Patch Changes

- 479ba00: Pasted New Recruit lists keep attached units joined to their bodyguards.
- 479ba00: Imported squads keep the specialists and weapons the list names, such as a vox-caster, weapons team or hull lascannon beside sponson heavy bolters.
- 479ba00: Pasted New Recruit lists read force disposition, enhancements marked as upgrades, renamed Warlord entries and models named without loadout.
- 479ba00: Enhancements for one model in a unit, such as Bombast-class Vox-array on a Tempestor Prime, are offered to that unit.
- 479ba00: Squads such as Cadian Shock Troops, Heavy Intercessors and Outriders can take their datasheet's specialist model in place of a default trooper.

## 0.155.0 (2026-10-17)

### Minor Changes

- e73c5f8: The Rosters Friends tab lists friends' public rosters to open or duplicate.
- e73c5f8: Rosters has Mine, Friends and Public tabs like Battles, replacing the Discover armies page, whose old links open the Public tab with their filters.
- cf1dc1e: Friends' and public rosters sort by update, creation, name or battle size, like your own.

### Patch Changes

- cf1dc1e: The Battles tabs read Mine, Friends and Public, matching Rosters.
- 83a9371: Rosters lent to you show the same card as yours, with detachment, points, legality and last update, in your rosters and when choosing a battle army.
- e73c5f8: Public rosters no longer list your own rosters; they stay under Mine.

## 0.154.0 (2026-10-17)

### Minor Changes

- 655b1bb: Count each datasheet's built and painted models on the Collection page.
- 655b1bb: Export your collection as CSV and import one after reviewing which rows match, differ or are skipped.
- 655b1bb: Keep a wishlist of models to buy on the Collection page, shown on your profile with your collection.
- 655b1bb: Saved rosters have a Your collection section showing models you lack or still need to build or paint.

## 0.153.0 (2026-10-17)

### Patch Changes

- 1d11aa9: The player photo viewer keeps its photo, like and actions on one screen on phones, and datasheet galleries show larger photos.

## 0.152.1 (2026-10-16)

### Patch Changes

- 3a64684: The account menu and page are called Account settings, with one heading and one short line per section.
- 3a64684: Battle errors read as sentences, and setup and scoring prompts repeat themselves less.
- e47292f: The battle log names the player who chose to attack, not the one who took the first turn.
- c8028b9: The battle phase rail shows every phase name in full.
- 3a64684: Battle setup opens with both sides facing off, puts each step in its own panel without pinned bars, names each side once, and ends with Start battle.
- c8028b9: Battle setup steps drop the extra panel around their choice cards, and spectators see victory and command points at full size.
- 3a64684: Roster setup offers a custom points total as a battle size, naming whose limits it uses, instead of a separate budget field.
- 5d2253d: Buttons and fields look the same on every device, and chosen setup options show a highlighted border, not just a ring.
- 3a64684: Data updates list each faction as a flat row instead of a card inside a card.
- 7537003: A force disposition's page lists each faction once, not once per rules version.
- 3a64684: Removing a friend asks first, naming the friends-only battles and lent rosters it affects.
- 5c8b383: Battle cards on a league page mark your seat and show Won or Lost, as they do on Battles.
- 3a64684: Once every roster is sealed, a league's next-action card offers Reveal all rosters, and an open event lists its entrants once.
- 3a64684: Leagues call a sealed army a roster and use the same Battle format label as new battles.
- b1e6416: A mission matchup's header names and links each side's primary mission, and each side's missions and actions carry its disposition colour.
- b1e6416: Terrain layout cards on a mission matchup fill their row, with each layout's name beside its letter.
- 3a64684: The compact header menu lists reference pages directly, without a second menu.
- a7be774: Battle sizes and budgets show thousands separators, such as 2,000 points.
- 6f5294d: Profiles, friends, and the leaderboard show quiet one-line empty states, and the leaderboard's faction picker sits in its header.
- 3a64684: Home and profiles show records in the same won, drawn, lost order.
- 3a64684: Reference pages share one heading style, list Core Rules first, and drop repeated labels and helper text.
- f137abf: Faction, rules, and force disposition pages lose repeated labels and stray empty shelves, and their rows gain hover states.
- 3d0a70a: The roster name in the builder no longer sits in a filled bar, keeps its full size on desktop, and shows keyboard focus.
- 3a64684: Roster screens name their buttons and confirmations consistently, with New roster, Keep roster, and Archive roster as the main choice when deleting.
- 3d0a70a: Roster library and discovery filters that match nothing show one short line, and long roster names wrap on phones.
- 3a64684: Search on a touch screen has a Cancel button, no keyboard hints, and a Retry button when search fails.
- 3c702e1: Search results with match details no longer overlap while the list first lays out.
- e86e975: Battle setup records each side's stratagems and primary once, not twice.
- 3a64684: Sign-up uses one name for creating an account, and Home welcomes a new player instead of welcoming them back.
- 204b1f4: Creating an account asks for your name instead of using part of your email address.
- 35e5e44: Rosters compared in the combat simulator show their faction instead of loading it forever, and weapon choices are named.
- 3a64684: Discarding unsynced changes is marked destructive and says why it needs a connection, and sign-out explains when it's waiting on them.
- 3a64684: A unit lost in battle is marked Destroyed, so it no longer reads like a battle result.

## 0.152.0 (2026-10-16)

### Minor Changes

- f624534: On a phone, Home has a tab beside Rosters, Battles and Factions; Missions moves into More.

### Patch Changes

- f624534: On a phone, the page footer keeps only the privacy policy, terms and data sources; More lists the rest.
- f624534: More groups its pages into compact Reference, Play, Account and Help rows, and adds player guides, your profile and support.

## 0.151.6 (2026-10-16)

### Patch Changes

- a821bf6: A unit's datasheet in the army dialog matches the roster editor's, with detachment rules, keywords, attachments and model photos.
- a821bf6: The army dialog's header takes two short lines, not three, and on a phone an open datasheet has a back button to the list.

## 0.151.5 (2026-10-16)

### Patch Changes

- 3175a1a: Screen readers announce button-styled links, such as Build a roster, View list and Edit roster, as links.
- a069131: Live battles and lists resume on their own after a dropped connection or when you return to the app.
- 84b39f0: Outlined link buttons, such as Create an account, keep their border on light-appearance devices.

## 0.151.4 (2026-10-16)

### Patch Changes

- 2531165: The army dialog's datasheet pane shows just the datasheet, edge to edge, without the unit's card; on a phone it fills the dialog and close returns to the list.

## 0.151.3 (2026-10-16)

### Patch Changes

- 85f7fb0: Cancelling the file picker when adding a unit photo in the roster no longer blanks the loadout pane.
- 18148ef: Photo prompts invite you to show off your models, not warn you to add only photos you took.

## 0.151.2 (2026-10-16)

### Patch Changes

- e144650: A unit's datasheet in the battle army dialog opens beside the list on wide screens, and in its own view with previous and next on phones.
- e144650: Recording wounds, models or a lost unit no longer fills the battle log or takes Undo from the last action.
- e144650: Casualty buttons stay usable while saving, so you can tap a squad down several models at once.

## 0.151.1 (2026-10-16)

### Patch Changes

- f639d83: A detachment page's force disposition chips link to that disposition's page.
- f639d83: A detachment page's header no longer repeats the faction name shown in the breadcrumb.

## 0.150.0 (2026-10-16)

### Minor Changes

- 1548f27: A reported photo is hidden from all but its owner until an administrator reviews it.

### Patch Changes

- 1548f27: Collection photos and profile pictures are screened for content that does not belong on the service, and the privacy policy covers collection photos.

## 0.149.0 (2026-10-16)

### Minor Changes

- f5349aa: Add up to six photos of your models per datasheet by dropping or clicking on the photo area in Player photos, the roster builder's unit pane or your Collection. Adding one puts the datasheet in your collection.

### Patch Changes

- 8746440: Datasheets and the roster builder drop the base size characteristic box; datasheet pages list it under Unit configuration, including units whose base size came only from their profile.
- f5349aa: Removing a collection photo asks for confirmation, and removing a datasheet from your collection says how many photos go with it.

## 0.148.0 (2026-10-16)

### Minor Changes

- 8845886: Like other players' photos; the most liked lead a datasheet's Player photos and stand in for yours in the roster builder.
- daceddc: Add a photo of your models to each datasheet in your collection; it shows on your Collection page and, while your collection is shared, your profile.
- daceddc: Datasheet pages show Player photos from shared collections, and the roster builder shows your photo of the selected unit, or a shared one if you have none. Report an unwanted photo from its viewer.

## 0.147.6 (2026-10-16)

### Patch Changes

- 02b2c33: A long unit name under From your battles no longer widens the Collection page on phones.
- 02b2c33: Points badges on a faction's datasheet list line up in one column.

## 0.147.5 (2026-10-16)

### Patch Changes

- 31ca9cc: On iPhone and Android, Back returns from a screen opened on Home or More to the screen that opened it.

## 0.147.4 (2026-10-16)

### Patch Changes

- b42f3e4: Compact Praetorium text still imports without its "Exported with Praetorium.gg" footer.
- b42f3e4: Imported army text finds the detachment after the battle size, so its enhancements are placed.
- b42f3e4: Army text imports under the right faction when a "Warhammer 40,000" line sits above it.
- b42f3e4: Imported army text reads "• 5 models" lines as squad sizes and skips a final "TOTAL ARMY POINTS" line.
- b42f3e4: Imported army text works when its title has a note after the points, such as "(600 Points; Cult Icon to add in builder)".

## 0.147.3 (2026-10-15)

### Patch Changes

- 1dbe41c: The battle list drops a battle deleted while you were away instead of keeping it until a reload.
- 1dbe41c: Editing a roster right after opening it from a link saves rather than reporting a change on another device.
- 154ae55: Scrubbing a battle replay shows the scoreboard for the current event, not an outdated one.
- 1dbe41c: Signing out while a page loads reloads it signed out instead of showing an error.

## 0.147.2 (2026-10-15)

### Patch Changes

- 7efc667: On iPhone, swipe from the left edge to go back from a detail screen to the one that opened it in the same tab.

## 0.147.1 (2026-10-15)

### Patch Changes

- 1296537: An exchange code from the roster library carries the roster's current points, not a cached price.

## 0.147.0 (2026-10-15)

### Minor Changes

- 78065fe: Archive a roster instead of deleting it. Archived rosters sit in a collapsible section at the bottom of your roster library, stay off Home and the battle, league and simulator roster choosers, and return with Unarchive.
- 78065fe: The game journal is gone, and its saved games and events are deleted.

### Patch Changes

- 7aba302: Battle rows label a conceded or early finish as "Conceded" or "Finished early".
- 7aba302: Battle rows show their battlefield as soon as the page appears, not a moment later.
- 087891e: Home drops the Getting started checklist; a new account's Home leads with its rosters.
- 7aba302: The roster library shows only its loading placeholders, without an extra loading line above.

## 0.146.1 (2026-10-15)

### Patch Changes

- c47f5bf: The Support page opens the feedback form in place, keeping the public issue tracker as an alternative.

## 0.146.0 (2026-10-15)

### Minor Changes

- 93bf720: Send feedback, with an optional screenshot, from any page without leaving it.

### Patch Changes

- 9c99942: A roster chooser with no list for the battle size offers a different battle size.
- 4e15ed2: A wargear count that cannot go higher says why, and every lit add button changes the loadout.
- 8dc4616: A detachment address under a faction that borrows it opens the printing faction's page.
- fb1107e: The compact roster export wraps inside its box on a phone.
- b527577: Cthonian Beserks can take twin concussion gauntlets and mole launchers.
- 8dc4616: The favourite heart on a faction's datasheet list has a full-size touch target and no longer opens the datasheet.
- 4e15ed2: Clicking a detachment card in roster setup selects it; the reference icon opens its reference.
- 8ad6cae: Error pages explain the problem plainly and offer to try again, or to reload when a release replaced the page's code.
- b527577: Wolf Guard Headtakers keep their Hunting Wolves instead of flagging a saved choice as unavailable.
- fdfb98d: Imported lists keep equipment nested under each model, plural Enhancements labels and each squad's full model count.
- b527577: The Deathwatch Indomitor Kill Team starts legal at 10 models.
- 62d1742: A list that fails to import is reported to us automatically so the importer can be fixed.
- 20fd45c: Sealing a league roster explains its Warlord problem and links to editing the list.
- 8c40173: Releases drop the What's new banner; the What's new page still lists every change.
- 8300c50: Older rosters open straight into the builder without briefly saying their army book was replaced, and a failed army read offers Try again.
- 3a6d780: The simulator's Optimize names the rule that stopped it, not unsupported rules in general.
- 9c99942: Choosing a roster over its points limit for a battle explains why and links to editing it.
- 4e15ed2: A unit holding a choice the current rules no longer offer can reset just that choice.
- 4e15ed2: Opening a saved roster shows its outline while army data loads, without flashing that data is unavailable.
- 4e15ed2: Sharing a roster shows progress beside the header and copies the link once per click.
- 3a6d780: The simulator's unit picker says units are loading instead of finding no matches.
- 8ad6cae: A bottom tab forgets a page that no longer exists instead of reopening it.
- 3e0e703: A roster that has not synced yet opens in a new tab or after a reload instead of showing nothing.

## 0.145.0 (2026-10-15)

### Minor Changes

- d39a0b5: MFM 1.6 is the current rules, with points for every faction; rosters on MFM 1.5 follow it.

### Patch Changes

- d39a0b5: The Adeptus Custodes codex joins the current rules with official MFM 1.6 points, Leader lists and unit limits; Custodes preview rosters move to it unchanged.
- d39a0b5: Custodes rosters built on the index stay on MFM 1.5 and offer codex conversion.
- 019ece9: Converting a roster skips rules versions that fold into another, where conversion would change nothing.
- d39a0b5: Upgrades the Munitorum Field Manual marks as one per army take their MFM points.
- d39a0b5: Links to a faction's rules under an earlier MFM version open the matching archived rules, or the current rules if none are kept.

## 0.144.7 (2026-10-15)

### Patch Changes

- f8e4911: Show your record and leaderboard place with the rest of the home page, not after it loads.

## 0.144.6 (2026-10-15)

### Patch Changes

- 1359ab9: Open Home after signing in to the mobile app instead of showing "Something went wrong".

## 0.144.5 (2026-10-15)

### Patch Changes

- a72d79f: Keep a full league's lists sealed until someone reveals them, even after the last list is sealed.

## 0.144.4 (2026-10-15)

### Patch Changes

- 71407ac: Seat the only possible league matchup when starting a 1v1, 2v1 or 2v2 battle.
- 71407ac: Pick the only two league entrants left to pair by default.
- 71407ac: Let league entrants open their own sealed list before the reveal.
- 71407ac: End league entrant rows with the solo and allied size toggle, after the view and remove icons.

## 0.144.3 (2026-10-15)

### Patch Changes

- 49f8fa9: Open rosters in the mobile app without waiting for saved battles and rosters to refresh.

## 0.144.2 (2026-10-15)

### Patch Changes

- c219e75: Stop re-pricing an open roster a few seconds after the page loads.

## 0.144.1 (2026-10-15)

### Patch Changes

- ae6366f: Leave a battle page as soon as its battle is deleted, not at the next refresh.
- 3bd45a8: Price rosters faster by reusing the units a change didn't touch.
- 4015934: Update how many copies of each unit you can add faster while editing a roster.
- ae6366f: Refresh your data once when live updates connect, not several times per screen.
- 5c38f17: Serve reference pages faster to visitors who are not signed in.
- 8a5e4b9: Roster edits settle faster without reloading the whole page's data after each change.

## 0.144.0 (2026-10-14)

### Minor Changes

- c17890e: The battles page lists your games, your friends' games or every public game, one list at a time, and Home links to each.
- c17890e: Home names the latest data updates to your rosters' armies and how many of your lists each changed.
- c17890e: Battles show as compact fixture cards on Home, the battles page, profiles and leagues, with every player at the table, their armies and the score.
- c17890e: New players see a Getting started checklist on Home that ticks off each step.
- c17890e: Home shows your record, win rate, current streak and leaderboard place under the greeting.
- c17890e: Profiles show recent form, a player's most-used army and a clearer service record, and open on rosters for players who only build lists.

### Patch Changes

- 14179d1: The new list button reads Create roster.
- c17890e: Home leads with your lists when you have no games and shows your record only once you have played.
- fb2d3b5: What's new and the update notice only list changes you can see in the app.

## 0.143.8 (2026-10-14)

### Patch Changes

- 3f96e16: Mission choices such as Burden of Trust guards, A Tempting Target and Punishment are optional: skip them and play on, or record them later from the mission card.
- 3f96e16: Tempting Target objectives take one tap each, and its confirmations, like Consecrate's, are a single switch.

## 0.143.7 (2026-10-14)

### Patch Changes

- 899acbe: Swiping on a battle prompt on a phone no longer scrolls the battle page behind it.
- 899acbe: Starting a battle opens the first turn at the top of the page, not where setup was scrolled.
- 899acbe: Dialog actions stay at the bottom of the screen on phones, even before the dialog has content.

## 0.143.6 (2026-10-14)

### Patch Changes

- 94a93a9: Battle actions and your opponent's moves appear faster.
- 94a93a9: Open pages no longer reload in the background every few minutes, and an open battle ignores moves in other battles.
- 94a93a9: Watching someone else's battle refreshes it every five seconds.

## 0.143.5 (2026-10-14)

## 0.143.4 (2026-10-14)

## 0.143.3 (2026-10-14)

### Patch Changes

- dd6a2de: A battle with a saved change awaiting review stays live and accepts actions while connected, no longer freezing until a reload.

## 0.143.2 (2026-10-14)

### Patch Changes

- aef5bc2: Units in reserves or embarked can be set up on the battlefield mid-battle from the army roster, so the combat simulator can target them.
- 7c413f5: Changing two profile defaults or battle sharing choices quickly no longer snaps the second one back.

## 0.143.1 (2026-10-14)

### Patch Changes

- 2e1bf41: Battle actions keep working after a site update, without freezing or needing a reload.

## 0.143.0 (2026-10-14)

### Minor Changes

- 3659518: Battlefield maps shade each side's territory as well as its deployment zone.

### Patch Changes

- f38c2bf: Offer the Custodes preview stratagems In Auramite Clad, Vigil Unending, Superhuman Focus, and Gilded Champion in battle.
- d9a3ed8: Show every stratagem in battle, including the other player's turn, when asked for those not playable now.

## 0.142.0 (2026-10-14)

### Minor Changes

- 7e2de05: Set detachment rule battle alerts from the new Detachment rules row on any unit's datasheet in the roster builder.

## 0.141.20 (2026-10-14)

### Patch Changes

- af8c4aa: Datasheets that print their transport rule as a Transport ability no longer repeat it in a Transport section.

## 0.141.19 (2026-10-14)

### Patch Changes

- cdc4f06: Impulsors, Land Raider Redeemers and other Space Marine, Black Templars, Deathwatch and Orks transports whose datacards print the rule as an ability or in bold accept embarked units, no longer refusing them for unknown model capacity.
- cdc4f06: Transports hold passengers to their printed rule: only named keywords can embark, excluded units such as Terminators in a Rhino are refused, larger models take their printed space, and extra allowances such as a Ghost Ark's character slot count separately. Earlier battles keep counting one space per model.

## 0.141.18 (2026-10-14)

### Patch Changes

- ff8423e: Choosing an option for a previously counted weapon group takes effect instead of keeping the old counts.
- ff8423e: Resizing a squad with chosen loadouts grows and shrinks its default loadout first, so every model keeps its weapons and the squad is priced at its new size.
- ff8423e: Arming a heavy weapon scout or special weapon marine, or putting the weapon down, saves the squadmate it replaces or returns, so later weapon changes on that squad take effect.

## 0.141.17 (2026-10-14)

### Patch Changes

- a836312: Rosters on superseded Space Marines codex versions move to the current MFM 1.5 rules with official codex points and follow its later updates.
- a836312: A list saved after the move to newer rules is no longer read on older rules because of its gear.
- a836312: Fixes, codexes and dated MFM builds update the current rules version instead of adding one, and rules versions are named after their MFM version.

## 0.141.16 (2026-10-14)

### Patch Changes

- eef80b9: The first eligible character added to a roster becomes Warlord, and deleting the Warlord passes it to the next one added.

## 0.141.15 (2026-10-14)

### Patch Changes

- e4d1f60: Roster setup marks a detachment unavailable, and says why, when it would break a one-per-army limit, such as a second Custodes Shield Host or Necron Dynasty.
- de14ff2: A roster no longer flags "a saved choice is no longer available" for weapon choices under a loadout the player switched away from.

## 0.141.14 (2026-10-14)

## 0.141.13 (2026-10-14)

### Patch Changes

- 0f4ba22: Faction pages and the unit picker no longer stall for seconds after a site update.

## 0.141.12 (2026-10-14)

### Patch Changes

- 86dc6f4: Opening an older rules version's faction pages no longer slows other pages.

## 0.141.11 (2026-10-14)

## 0.141.10 (2026-10-13)

### Patch Changes

- 81e94fa: Cadian Shock Troops grown to 20 models keep their special weapons without flagging an unavailable saved choice.

## 0.141.9 (2026-10-13)

### Patch Changes

- d8314f4: Keep the oldest remaining list heading a variant group whose original was deleted, rather than a new variant.
- d8314f4: Save a new variant of a roster whose original was deleted, instead of holding it for review as not yours.

## 0.141.8 (2026-10-13)

### Patch Changes

- 413958b: Printing a fielded battle roster waits for its army data, so the print is not empty while the faction loads.

## 0.141.7 (2026-10-13)

### Patch Changes

- f796e88: Show fixed weapons in roster loadouts when unit composition sets squad size.

## 0.141.6 (2026-10-13)

## 0.141.5 (2026-10-13)

## 0.141.4 (2026-10-13)

## 0.141.3 (2026-10-13)

### Patch Changes

- 7854363: Restore stratagem text and counts on detachment references when battle timing is unsupported.

## 0.141.2 (2026-10-13)

### Patch Changes

- 98579f8: Count attached Leaders and their squads as one unit on league roster cards.
- 97cd75a: Restore chapter-specific Space Marine detachments on faction reference pages.

## 0.141.1 (2026-10-13)

### Patch Changes

- 67779fc: Show Hunter and standard melta profiles in Eradicator roster loadouts.

## 0.141.0 (2026-10-13)

### Minor Changes

- b73ddab: Find detachments by rule, enhancement, upgrade and stratagem names and effects, including common advance-and-charge and fight-on-death phrasing, with every match scrollable.

  Stop simulator breakdown values overflowing on narrow phones.

## 0.140.2 (2026-10-13)

### Patch Changes

- bd95765: Show an allied side's Force Disposition once in battle setup, and lead a league pair's status with the card it still needs.

## 0.140.1 (2026-10-13)

### Patch Changes

- 9c2925b: Restore older saved leagues, rosters and favourites without losing saved changes.

## 0.140.0 (2026-10-13)

### Minor Changes

- c0f2b27: Let an allied side in battle setup play any Force Disposition either list's detachments offer, not just the chosen ones.
- c0f2b27: Pair the allies in a 2v1 league to play together, and start a battle by choosing a side of the table.
- c0f2b27: Choose an allied pair's Force Disposition in a 2v1 or doubles league before the reveal, from every card either list's detachments offer; league battles then use it without asking.

## 0.139.1 (2026-10-13)

### Patch Changes

- baacc68: Refresh Space Marines points and charge partial squads the larger squad price.

## 0.139.0 (2026-10-13)

### Minor Changes

- 854d4ec: Search Praetorium from your browser with live results on a search page.

  Find units by ability effects, such as gaining command points.

## 0.138.0 (2026-10-13)

### Minor Changes

- fa3ddb5: Let a league's owner name friends as admins who start events, change settings and manage players; only the owner can delete the league.
- fa3ddb5: Show each revealed league list as a roster library card, one per line, with the player and icons to open it or simulate against it.
- fa3ddb5: Show everyone in a league whose list is sealed, let anyone playing reveal the lists once all are in, and name who revealed them in the event.
- fa3ddb5: Show a results table on every revealed league, ranked by wins, draws, then victory points, and tell each duel player who they have left to play.
- fa3ddb5: Open every sealed list automatically once a league with a player limit is full and the last list is sealed; organizers can reveal before the limit fills.

### Patch Changes

- fa3ddb5: Start new leagues with automatic entry, since the private link decides who joins.
- fa3ddb5: Tidy league cards and pages: one status instead of chip rows, a status card with a step checklist in the side column, and a lighter readiness panel.
- fa3ddb5: Simplify the league settings dialog to name, format, points and whether you play, with the rest under More options.
- fa3ddb5: Open the list chooser right after joining a duel league, start a list there at the league's size, and link back from the builder to seal it.
- fa3ddb5: Explain a revealed league to outsiders, with a way to start their own.
- fa3ddb5: Say league, not event, where a page, notification or error means the whole league, and number events only when a league has several.
- fa3ddb5: Use a calculator icon for the combat simulator and every simulate action.

## 0.137.1 (2026-10-13)

### Patch Changes

- 38d2754: The iPhone app reloads less when opening saved reference data or editing a roster.

## 0.137.0 (2026-10-13)

### Minor Changes

- 23cea62: Allow league rosters to use preview rules as well as released and archived ones.

## 0.136.3 (2026-10-13)

## 0.136.2 (2026-10-13)

### Patch Changes

- cc91bca: Restore the Land Raider Redeemer's Wrath of the Machine Spirit ability in the current Space Marines rules.

## 0.136.0 (2026-10-13)

### Minor Changes

- b818909: Choose a larger text size on your profile; it applies on this device at once and on every page load.

## 0.135.1 (2026-10-13)

### Patch Changes

- dd42e3d: Open an app tab you have not visited at its top, not the previous tab's scroll position.
- dd42e3d: Keep battle setup working when online but Praetorium is unreachable, saving choices to sync later.

## 0.135.0 (2026-10-12)

### Minor Changes

- d09af4a: Keep a private game journal of games played outside Praetorium, grouped by event, with totals that never affect ratings.

## 0.134.0 (2026-10-12)

### Minor Changes

- 6d7064e: Lend a saved roster to a friend, who can view and field it in their battles but not edit it.

### Patch Changes

- 6d7064e: Open a roster you were just given access to without a stale "Nothing here" page.

## 0.133.9 (2026-10-12)

### Patch Changes

- bc7201b: Show average kills without the target's model limit, so attackers that both usually wipe a small unit can be compared.

## 0.133.8 (2026-10-12)

### Patch Changes

- 6333ccd: Highlight roster changes and legality problems in setup reviews, collapsing unchanged units.
- 6333ccd: Make app releases and army data updates easier to browse with clearer panels, shared navigation and highlighted changes.

## 0.133.6 (2026-10-12)

### Patch Changes

- e7504a0: Speed up unit and roster simulations.

## 0.133.4 (2026-10-12)

### Patch Changes

- d5ac3fb: Show Teams Event Companion 20–0 battle points beside victory points on finished battles.

## 0.133.3 (2026-10-12)

### Patch Changes

- 0c2f450: Show which roster a copy came from while the source stays readable.
- 0c2f450: Simulate any roster you can read, including other players' public armies.

## 0.133.2 (2026-10-12)

### Patch Changes

- d87e059: Correct what support, home and agent pages say about guest import, offline use and the mobile app.
- ee535bf: Save a rules-version conversion as a variant, keeping the original roster.
- ddfc019: Keep benchmark model edits responsive and pin matchup table headings while scrolling.
- ee535bf: Filter the roster library by older rules or changes from a data update.
- ddfc019: Open saved rosters when league checks fail, explain changes that cannot sync, and keep normal saves quiet for 10 seconds.
- fce9854: Show what changed after an update, with a What's new page of recent app changes.

## 0.133.1 (2026-10-12)

### Patch Changes

- 58f5242: Show each unit's points before and after in the rules-version conversion review.
- 4b50468: Mark saved rosters that use older rules or changed in a data update.

## 0.133.0 (2026-10-12)

### Minor Changes

- 0919d17: Simulate roster loadouts against custom benchmarks, revealed league rosters and live battle survivors to find effective targets.

## 0.132.5 (2026-10-12)

### Patch Changes

- 3074fb2: Keep battle simulator choices when casualties are recorded while it is open.

## 0.132.2 (2026-10-12)

### Patch Changes

- 73d5fe3: Include compulsory detachment upgrades in Add units prices.
- 73d5fe3: Remove collection actions from roster unit menus.

## 0.132.1 (2026-10-12)

### Patch Changes

- 63eca38: Update current Space Marines rules to the merged BSData codex, keeping the earlier rules for saved rosters.

## 0.132.0 (2026-10-12)

### Minor Changes

- db71d3c: Show collections on profiles by default, with Show collection on profile moved to account settings.
- db71d3c: Start new rosters, copies and imports public for players without a default visibility.

### Patch Changes

- 43c3a83: Show Attach unit and Attach to unit only when a unit can attach now, so a unit with a full Leader slot and no Support slot, such as Skorpekh Destroyers led by a Skorpekh Lord, offers neither.
- 3e114ee: Show friends' and public games below yours on the battles page when signed in.
- 8bf64cd: Discarding saved changes completes while another screen is syncing them, and says why if it cannot.
- f1bcbfd: Let the Discover armies page scroll so long lists reach Show more armies.
- 92cb559: Edits in the iOS app, such as a unit note, no longer get stuck syncing when several saves happen at once.
- ce1db4f: Remove the privacy and setup notes from the Start a battle dialog.

## 0.131.2 (2026-10-12)

### Patch Changes

- 9311dc1: Send saved battle and roster changes immediately after a page reloads mid-sync, not up to a minute later.

## 0.131.1 (2026-10-12)

### Patch Changes

- 275f4e2: Fold the desktop navigation into its menu button when enlarged text would push Reference, Search and Account off screen.
- 275f4e2: Keep the account menu and other menus on screen with enlarged text.
- 275f4e2: Wrap the End phase button's label instead of clipping it with enlarged text.
- 275f4e2: Keep the battle scoreboard's scores clear of the phase title with enlarged text.
- 275f4e2: Keep the simulator's result figures and breakdown apart with enlarged text.
- 275f4e2: Keep weapon profile headings apart with enlarged text.

## 0.131.0 (2026-10-12)

### Minor Changes

- 2356c10: Track a battle manually: keep score, command points, rounds, the timer and notes without mission cards or scoring automation.

### Patch Changes

- 8c68320: Find leaders, support and bodyguards from a unit's attach menu, which can add a new unit already attached, not the unit picker.
- 010c4a7: Remove the in-app report form; report problems on the public GitHub tracker.

## 0.130.0 (2026-10-12)

### Minor Changes

- b64427a: Discover armies other players made public, filter by faction, detachment and rules version, see each builder and whether it is legal, and duplicate one into your rosters to edit. Making a roster private or unlisted removes it from the list immediately.

## 0.129.1 (2026-10-12)

### Patch Changes

- f885102: Remove unit nicknames and keep unit notes private to their owner.

## 0.129.0 (2026-10-12)

### Minor Changes

- 7d36375: Set a custom points budget for a roster while its battle size still sets detachment points, enhancement and unit limits.

## 0.128.1 (2026-10-12)

### Patch Changes

- b09c4b1: Return to the page you were reading after signing in from the account menu.
- b09c4b1: Label link and invite actions Copy in the browser, where they copy to the clipboard.
- b09c4b1: Keep the loadout model count controls on screen with enlarged text.
- b09c4b1: Keep unit picker rows readable and their Add buttons reachable with enlarged text.
- b09c4b1: Keep battle reserve counts on screen with enlarged text.
- b09c4b1: Keep simulator unit choices usable with enlarged text.
- b09c4b1: Stop phone section tab labels overlapping with enlarged text.

## 0.128.0 (2026-10-12)

### Minor Changes

- 51a7f9b: Record a missed stratagem, command point or score in an earlier phase, under that phase's limits and marked late in battle events and replay.

## 0.127.0 (2026-10-12)

### Minor Changes

- b849af7: Give roster units nicknames and private notes. Nicknames show beside the datasheet name in copies, variants, text exports, exchange codes, printed packs and battles; notes stay private unless shared with people who can open the roster.

## 0.126.0 (2026-10-12)

### Minor Changes

- f1be99d: Lock a finished roster against edits, and duplicate it or create a variant to try changes.

### Patch Changes

- 17be14d: Record Locate and Deny markers, Sensor Sweep removals and Consecrate objectives during battles.

## 0.125.1 (2026-10-12)

### Patch Changes

- 90d0529: Clarify catalogue status dates and account requirements for public tools.
- 90d0529: Clarify roster creation actions with the Create variant label.

## 0.125.0 (2026-10-12)

### Minor Changes

- a1db385: Share a roster as an exchange code or QR code for another player to review and import as their own copy.

## 0.124.2 (2026-10-12)

### Patch Changes

- 0dbc837: Keep valid weapon choices after attached-unit edits, explain calculation context and retry failed loadout comparisons.

## 0.124.1 (2026-10-12)

### Patch Changes

- 4d7609d: Explain roster link sharing before publishing; clarify private access, frozen roster retention, sealed league access and account deletion.

## 0.124.0 (2026-10-12)

### Minor Changes

- 6a812f0: Steady collection and favourite saves, keep roster Add controls responsive, simplify picker guidance, add numeric model counts and a faction-grouped Collection profile tab, and limit logo hover rotation to 45°.

## 0.123.0 (2026-10-11)

### Minor Changes

- 6aaa456: Record mission unit and objective choices in battle, kept through casualties and undo, and track Beacon choices manually.

## 0.122.0 (2026-10-11)

### Minor Changes

- d5cc723: Add a datasheet to a roster, favourites or collection, and set its model count, from one Add to button on its page.
- d5cc723: Track your collection on a new Collection page: add datasheets, count models, and add units you fielded in battles.
- d5cc723: Heart favourite datasheets to list them first and filter by them in the unit picker; hearts no longer mark collection ownership.
- d5cc723: Remove the roster's Physical collection dialog; model counts live on the Collection page.

### Patch Changes

- 37c06fb: Keep datasheets hearted before favourites existed as favourites, and start every collection empty.

## 0.121.1 (2026-10-11)

### Patch Changes

- 95ff466: Explain weapon, ability and keyword matches in faction datasheet search, label rules versions in reference roster choices, and keep preview or archived unit labels in the simulator.

## 0.121.0 (2026-10-11)

### Minor Changes

- 5033f6d: Find compatible leaders and bodyguards, explain roster limits, and open mission matchups from the builder.

## 0.120.0 (2026-10-11)

### Minor Changes

- f0bc522: Review public support reports before publishing, then follow their GitHub status and replies in-app.

## 0.119.1 (2026-10-11)

### Patch Changes

- 4001ecd: Score supported final mission awards after both last turns under the battle cap, not the round cap, and allow New Orders once per battle.

## 0.119.0 (2026-10-11)

### Minor Changes

- b2d8844: Preview roster points, removed selections and legality before confirming army setup changes.

## 0.118.0 (2026-10-11)

### Minor Changes

- c591b8d: Record physical model quantities and compare shared equipped stock with roster requirements.

### Patch Changes

- c95d74c: Restore faction icons for battles saved with previous roster rules.

## 0.117.0 (2026-10-11)

### Minor Changes

- 81f8352: Print saved and guest rosters with their loadouts, attachments, army rules and stratagems.

  Keep margins on native print pages and treat closing the iOS print sheet as cancelling.

### Patch Changes

- 97828e0: Remove duplicate equipped weapon profiles and show correct profiles and equipment counts for weapon bundles.
- f2f18ec: Hide private league battles from spectators and explain who can read saved and frozen armies.

## 0.116.0 (2026-10-11)

### Minor Changes

- fa2ed15: Download readable or compact roster text, and check model counts, missing entries and original points before importing.

## 0.115.10 (2026-10-11)

### Patch Changes

- 30a4af4: Keep the sync banner from flashing during quick online saves.

## 0.115.9 (2026-10-11)

### Patch Changes

- b5b6d3c: Show provisional Custodes codex Leader and Support attachments, base sizes and Anathema Psykana army-selection rules in the reference and roster builder.

## 0.115.8 (2026-10-11)

### Patch Changes

- da40372: Explain unit-copy pricing tiers on datasheets when the points source omits labels.

## 0.115.7 (2026-10-11)

### Patch Changes

- a36a090: Name rules versions by release and date, drop duplicates, mark archived and preview status with distinct chips, and give each version a readable URL that old links redirect to.

  Keep simultaneous connected battle setup choices from blocking later actions with an offline sync conflict.

## 0.115.6 (2026-10-11)

### Patch Changes

- 9d245fd: Keep faction pages visible during saved-data updates.

## 0.115.4 (2026-10-11)

### Patch Changes

- f8a58bb: Keep saved rosters' loadouts, points and removed choices on their original rules, with a notice and optional conversion to current rules.

## 0.115.3 (2026-10-10)

### Patch Changes

- dac6baa: Show dialogs full screen on phones and at consistent widths on larger screens.
- dac6baa: Keep dialog titles and the Close and Minimize buttons fixed while scrolling.

## 0.115.2 (2026-10-10)

### Patch Changes

- 6c425dc: Credit community sources for authored preview points and faction reference content.
- 6c425dc: Keep equipment choices when resizing fixed squads and remove the duplicate composition control.
- 6c425dc: Keep checked unit limits visible in the picker while repricing equipment and model-count edits.
- 6c425dc: Mark rules versions on faction logos with accessible tooltips and faction colors, and switch versions from the reference header or compact faction-card menus. Roster setup selectors share one row, versions get readable faction URLs, and converting a roster is opt-in and keeps unavailable choices to fix. Archived rules sources and recorded battle version labels are kept.

## 0.115.1 (2026-10-10)

### Patch Changes

- d4b2883: Preserve finished battle replays and saved tour completion.

## 0.115.0 (2026-10-10)

### Minor Changes

- 3323840: Invite an opponent from the New battle dialog when you have no friends yet.

## 0.114.0 (2026-10-10)

### Minor Changes

- 83970e5: Save rosters, battles, preferences and queued actions offline and sync them when you reconnect.

### Patch Changes

- ff70bb7: Sync queued player commands before automatically settling a connected battle turn.

## 0.113.0 (2026-10-10)

### Minor Changes

- a2a5e64: Choose preview codex rules per faction while keeping released rules, saved lists and codex history.

## 0.112.3 (2026-10-10)

### Patch Changes

- 3d5e691: Show Insane Bravery in the Command phase, including in saved battles.

## 0.112.2 (2026-10-10)

### Patch Changes

- 8980206: Fix mirrored terrain walls and roofs, use layout-specific objectives, and put terrain letters beside their parts.

## 0.112.0 (2026-10-10)

### Minor Changes

- 00d7a78: Import a first army before signing up, with clearer roster setup and limits, friend invite QR codes, better dates and printed lists, and practical guides to first-game prep, army roles and scoring.

### Patch Changes

- 00d7a78: Keep Home signed in after email sign-in with several app tabs open.
- a6289ef: Give player guides illustrated overviews, image previews, compact sections and shorter advice on first games, army roles and scoring.

## 0.111.6 (2026-10-09)

### Patch Changes

- 1a91197: Show Titanicus Traitoris army rules from BSData when Game Datacards has no faction file.

## 0.111.2 (2026-10-09)

### Patch Changes

- 5b1a6bf: Handle Watch background updates and adapt the battle clock to the dimmed display.

## 0.111.1 (2026-10-09)

### Patch Changes

- 99bfc6c: Clarify unavailable battle setup sections, highlight the viewed section, and keep secondary choices and unit lists visible.

## 0.111.0 (2026-10-09)

### Minor Changes

- 3060d4a: Add an Apple Watch battle companion for scores, objectives, and personal reminders.

## 0.110.0 (2026-10-08)

### Minor Changes

- 9101ae3: Add a datasheet to a roster or open it in the simulator from its reference page.
- 9101ae3: Start a roster from a detachment page with that detachment chosen.
- abac057: Set up a battle on one page, with defaults folded away and a bar showing what remains before Start battle.

### Patch Changes

- ff88cac: Add illustrated worked examples to player guides.

## 0.109.0 (2026-10-08)

### Minor Changes

- a3d1e83: Invite spectators who haven't played yet to build an army or start their own battle.

### Patch Changes

- 75a3327: Keep a roster built signed out on this device through tabs, reloads and sign-in, and ask before saving one found at a later sign-in.
- 2073e6e: Limit The Sanguinor, Chaos Spawn and Khorne Lord of Skulls to the copies their datasheets allow.
- 2fcac78: Restore live updates, search, and offline downloads in Firefox before 124 and Safari before 17.4.
- f3cac0a: Pick a squad's model count from its number in the roster editor and simulator.
- 3335099: Disable reserve and transport choices the battle would refuse, and show why beside each.

## 0.108.1 (2026-10-08)

### Patch Changes

- 7443cdb: Use BSData's Space Marines codex for every Space Marines chapter, with its unit limits.
- 7443cdb: Move Space Marines lists from the provisional codex to current data, keeping units, detachments, matching options and Warlord.
- 7443cdb: Offer Invader ATVs to Space Marines lists again.
- 032d75f: Offer Ceramite Sentinels only to Imperial Fists lists.
- 7443cdb: Give Sammael and Suboden Khan the Mobile keyword their datasheets print.

## 0.108.0 (2026-10-08)

### Minor Changes

- 934efb5: Add public player guides.

## 0.107.6 (2026-10-07)

### Patch Changes

- a362534: Give fixed-count units wider selectors and show roster selection first in battle setup.
- a362534: Restore secondary mission details in battles saved before the catalogue ID update.
- 081e683: Open secondary mission pages from links shared before the October data update.

## 0.107.2 (2026-10-06)

### Patch Changes

- c31baa3: Launch online into the current app without an immediate refresh prompt.

## 0.107.1 (2026-10-06)

### Patch Changes

- 24ccff3: Unlock allied units from the current roster, explain exhausted limits, and keep guest drafts when saving.

## 0.107.0 (2026-10-06)

### Minor Changes

- 07a4313: Choose from all saved rosters and infer an even battle format from their sizes, keeping league presets.

## 0.106.0 (2026-10-06)

### Minor Changes

- b65ab69: Simulate leaders and support with their weapons, wounds, supported abilities and loadout odds, and optimize the whole unit’s equipment.

## 0.104.0 (2026-10-05)

### Minor Changes

- 20303de: Add round alerts, first-round restrictions, any-phase triggers, and reminders for abilities used while destroyed.

## 0.103.0 (2026-10-04)

### Minor Changes

- 242518f: Save app data automatically so Home, rosters, battles and the full public reference open instantly on the web and the installed iPhone app. Saved data refreshes in the background, keeping the normal interface and navigation, and private data clears on sign-out and account changes.

## 0.102.3 (2026-10-04)

### Patch Changes

- d83eaed: Shrink the web release notice to a compact message and refresh button above mobile navigation.

## 0.102.2 (2026-10-04)

### Patch Changes

- 1848932: Offer an optional refresh when a new release is ready.

## 0.102.1 (2026-10-04)

### Patch Changes

- 7dc5c2f: Match the iOS status and home-indicator backgrounds to the app bars.

## 0.102.0 (2026-10-04)

### Minor Changes

- 8df0ad9: Show the chosen battlefield in older battles, and open its map from its name in trackers and replays.

## 0.101.1 (2026-10-04)

### Patch Changes

- e7237da: Restore missing weapon and granted ability rule tooltips across datasheets.

## 0.101.0 (2026-10-04)

### Minor Changes

- 8f17481: Show aligned mission scores with current-round emphasis, compact completed missions, and a remaining-deck reference.

### Patch Changes

- 19ed05e: Show published battlefield names on battle cards and remove the repeated completed label.

## 0.100.0 (2026-10-04)

### Minor Changes

- 3500c10: Browse public battles without signing in.

## 0.99.0 (2026-10-04)

### Minor Changes

- 4012673: Expand the getting started guide with combat simulation, army tools, and battle setup and play.

## 0.98.5 (2026-10-04)

### Patch Changes

- bb5c2bf: Restore selectable thunder hammers and storm shields for Terminator Assault Squads.

## 0.98.4 (2026-10-04)

### Patch Changes

- 9c982a6: Fix loadout optimization for squads with mixed exclusive weapon choices.

## 0.98.3 (2026-10-04)

### Patch Changes

- 4a0745f: Clarify supported features and mark signed-out homepage sections with subtle color accents.
- c4be00a: Prompt for standard secondary mission payouts, including Cleanse and Centre Ground, at end of turn.

## 0.98.0 (2026-10-03)

### Minor Changes

- 18cc39d: Show combined shooting and melee losses and the exact chance to destroy the target.

### Patch Changes

- a719dab: Show the combined combat result first even if a phase has no enabled attacks, group phase details, buffs and manual modifiers, and optimize loadouts progressively against the selected defender. Explain what makes a loadout best, show finer small kill chances and drop the simulator’s Mathhammer label.
- bb098fb: Keep battle feeds readable when a page is missing during refresh.

## 0.97.1 (2026-10-02)

### Patch Changes

- 8bd0dfe: Drop the comma in the home greeting when a sign-in provider gives no name.
- 8bd0dfe: Make the account-creation switch easier to find with a compact outlined button.

## 0.97.0 (2026-10-02)

### Minor Changes

- 8292689: Calculate combat odds exactly, so estimates appear instantly and match on every device.
- 69f7097: Show each weapon option's and profile's odds against the selected defender in the simulator's loadout editor, marking the strongest per choice.
- 6ed424c: Keep the simulator's units, loadouts and modifiers in its link, so reloads and shared links reopen the same calculation.

## 0.96.3 (2026-10-02)

### Patch Changes

- 7579a8c: Match equipped weapons to their source profiles and keep unit-level equipment in combat simulation.

## 0.96.2 (2026-10-02)

### Patch Changes

- bf0c3bb: View battle armies, loadouts and casualty controls together, show army and combat dialogs full screen on phones, and export only the chosen force disposition.

## 0.96.1 (2026-10-02)

### Patch Changes

- 04e1966: Restore enlarged battlefield maps and add terrain placement arrows, objective labels, and Colosseum setup measurements.

## 0.96.0 (2026-10-02)

### Minor Changes

- aeb846f: Redraw the logo, favicon and app icons as the King of the Colosseum arena seen from above.

## 0.95.0 (2026-10-02)

### Minor Changes

- f519799: Show a datasheet's recent points changes on its page, linking to its faction's other data updates.
- f519799: Unfurl shared datasheet and detachment links with their own card, naming the unit's faction and points.

## 0.94.0 (2026-10-02)

### Minor Changes

- 58256ae: Restyle Praetorium as a plotting table: slate surfaces, field-green actions, red and blue sides distinct for colour-blind players, Chakra Petch headings, Sofia Sans interface text and plotted-figure scores.

### Patch Changes

- 464f490: Stop the desktop header scrolling sideways just above 1000 pixels by showing the Praetorium name only from 1100 pixels.
- 7ff15b2: Shorten the Force dispositions tile on the More page to Dispositions.

## 0.93.1 (2026-10-02)

### Patch Changes

- 43b2470: Show two equally tall battle cards per row on desktop.

## 0.93.0 (2026-10-01)

### Minor Changes

- 190844f: Show a supporter badge on profiles whose linked GitHub account publicly sponsors the project.
- 60b99eb: Lead visitors from the home page to the builder without an account, list everything free, and offer imports from New Recruit or BattleBase.

### Patch Changes

- 60b99eb: Link GitHub Sponsors from the home page, whose account buttons open the sign-up form.

## 0.91.0 (2026-10-01)

### Minor Changes

- 86317ad: Minimize battle dialogs to inspect the tracker without losing your choices.

## 0.90.1 (2026-10-01)

### Patch Changes

- fdfa5af: Preload complete battle replays and enable phone timeline dragging.

## 0.90.0 (2026-10-01)

### Minor Changes

- 3b1abc3: Show how long each phase and turn took beside the battle events that end them.
- 3b1abc3: Show each side's time on its latest turn and the current phase, with a shared pause for breaks and a round and phase review after the battle.

## 0.89.1 (2026-10-01)

### Patch Changes

- e084a67: Share the Strategic Reserves points allowance across allied armies.

## 0.89.0 (2026-10-01)

### Minor Changes

- 065036b: Support eleventh-edition Space Marines catalogue data and detachment migration.

## 0.88.1 (2026-09-30)

### Patch Changes

- 4eea507: Show which units can take each detachment unit upgrade.

## 0.88.0 (2026-09-30)

### Minor Changes

- cd533c7: Add friends to an open league event directly, without waiting for a join request.
- cd533c7: Set a new league's battle format and points when creating it, and join as a player straight away to seal your list.
- cd533c7: Show a league event on one page for everyone, with the organizer's controls beside the entrants, not on a separate Organize tab.
- cd533c7: Edit a league's settings and its current event's format in one form, saved together.

### Patch Changes

- cd533c7: Pick a league's earlier events from a one-line header menu.
- cd533c7: Show a league's invite link as one card that copies or shares it.

## 0.87.0 (2026-09-29)

### Minor Changes

- 16ffcde: Let spectators scrub a live battle's timeline back to earlier events.

### Patch Changes

- 16ffcde: Open a finished battle as its replay.
- 08e6b25: Remove Finish early; battles end after their last turn or by concession.

## 0.86.2 (2026-09-29)

### Patch Changes

- 5864c5a: Keep the battle replay timeline above the tabs in the mobile app.

## 0.86.1 (2026-09-29)

### Patch Changes

- 30b5faf: Show roster variants, their changes, points and legality when choosing a roster for a battle or league.

## 0.86.0 (2026-09-29)

### Minor Changes

- 2996eee: Create numbered roster variants grouped under their base list, see what each changes, and switch from the roster editor.

### Patch Changes

- 2996eee: Keep optional rules and a borrowed detachment when duplicating a roster from the library, starting the copy at default visibility.
- 2996eee: Show a roster's points beside its name on phones, with its visibility in the details line.

## 0.85.0 (2026-09-29)

### Minor Changes

- 9e01f2a: Improve mission browsing, roster context, and battle setup.

## 0.84.0 (2026-09-29)

### Minor Changes

- 1a6a7b9: Add a page per force disposition listing its primary missions against each opposing disposition and the detachments that offer it, linked from the roster header and mission pack table.

## 0.83.0 (2026-09-29)

### Minor Changes

- 3d25ea6: Set default visibility and battle size for new rosters and battles in your profile.

## 0.82.3 (2026-09-29)

### Patch Changes

- b8eac43: Mark rosters with too many copies of a unit illegal and block adding more.

## 0.82.1 (2026-09-29)

### Patch Changes

- e0bba17: Keep a unit just added to a saved roster instead of briefly dropping it and saving without it.
- 4fccda4: Stay signed in while turning on an authenticator app, so recovery codes stay on screen until saved.

## 0.82.0 (2026-09-28)

### Minor Changes

- 34bcdd5: List each faction's points and datasheet changes on its own data updates page, linked from the faction page.
- 8e76de6: Rank the leaderboard and profile places by a rating that weighs who each player beat, counting allies as one side.
- b639f0a: Replay finished battles event by event on a fixed timeline and show monthly personal performance by detachment, mission, and battle size.

### Patch Changes

- 9598ca4: Show each player's average victory points per battle on the leaderboard.

## 0.81.0 (2026-09-28)

### Minor Changes

- f5e5b73: Show each player one next step for a league event and their progress from joining to playing.
- f5e5b73: Split a league event into an Organize tab for its organizer and an Event tab for players, with a reveal checklist naming who is holding it up.
- f5e5b73: Accept waiting league requests together, let turned-away players back in, and pair doubles teams by ticking two players.

### Patch Changes

- f5e5b73: Change a league event's format and player limit together, and set up the next event, without leaving the league page.
- f5e5b73: Name league formats consistently on league cards and event pages, and open revealed league rosters in the same tab.
- f5e5b73: Ask for a second press before sealing a league roster.

## 0.80.1 (2026-09-28)

### Patch Changes

- 8ca93d2: Save automatic roster names.

## 0.80.0 (2026-09-28)

### Minor Changes

- 4d79f6f: Show an update warning when a saved roster differs from its sealed league roster.

## 0.79.3 (2026-09-28)

### Patch Changes

- c975332: List recently updated rosters first, keep finished games in the main home column, show players their active practice games, and remove the home roster shelf's duplicate data updates link.

## 0.79.2 (2026-09-27)

### Patch Changes

- 51082af: Make faction and roster navigation faster.

## 0.79.1 (2026-09-26)

### Patch Changes

- 05ab5e5: Reduce document delays on home, battle, profile, leaderboard, and roster pages.

## 0.79.0 (2026-09-25)

### Minor Changes

- 84d76b2: Show battle dates, reject friend requests, and keep routine roster legality out of home-page actions.
- 84d76b2: Exclude individual weapons and apply shared or phase-specific combat modifiers in the simulator without duplicate imported units.

## 0.78.2 (2026-09-25)

### Patch Changes

- 715f374: Keep the home page's game shelves close together when the activity column is taller.

## 0.78.1 (2026-09-25)

### Patch Changes

- 2b2d695: Keep roster sorting responsive and guest builders within the mobile viewport.

## 0.78.0 (2026-09-24)

### Minor Changes

- b8c2801: Try the roster builder without an account and sign up to save the list.

### Patch Changes

- 7382101: Keep the roster library in the order you last sorted it.

## 0.77.0 (2026-09-24)

### Minor Changes

- 61dd47e: Redesign the home page: a signed-in dashboard of what's waiting on you, your rosters and recent results, plus a visitor landing page.

### Patch Changes

- 7b2de63: Keep practice games from emptying the public and friends battle lists on the home page.

## 0.76.1 (2026-09-24)

### Patch Changes

- bcf1aa8: Capitalize weapon profile modes, show each configured unit alert, and collapse roster sections only from their chevrons.

## 0.76.0 (2026-09-24)

### Minor Changes

- 8d19840: Simulate attacks on units with mixed model defences, in an allocation order you choose.
- 9c9eb4d: Add characteristic, critical, ability and defender adjustments to the combat simulator conditions.
- 8d19840: Keep combat simulator results in view while adjusting rules and conditions.
- 8d19840: Pick a combat simulator unit from one search grouped by faction.

### Patch Changes

- 61bda9e: Show weapons whose profiles the catalogue links rather than writes out, such as the Celestian Sacresants' bolt pistols.
- 8d19840: Reopen a unit search at the current selection.
- 8d19840: Keep combat simulator conditions as extras that never override a unit's own rules.
- 8d19840: Show every combat simulator condition as a visible choice in one shooting and melee table.
- 8d19840: Move the combat simulator swap button beside the Attacker heading so it stays still when pressed.

## 0.75.0 (2026-09-24)

### Minor Changes

- 1381249: Browse data updates as collapsible rows showing every change, with links to each faction's changes.

## 0.74.0 (2026-09-24)

### Minor Changes

- 0cdcef0: Flag saved lists over their limit or illegal under current army data, and name the data changes that affected each since it was saved.
- 0cdcef0: See what each army data update changed on the new Data updates page.
- 5a19ddb: Show a scoreboard or summary card when a watchable battle, shared list, or player profile link is pasted in chat.
- 9088a58: Send mobile notifications when someone starts a battle with you, answers a friend request, or accepts, reveals, or unseals your league entry.

## 0.73.0 (2026-09-24)

### Minor Changes

- 789a9e1: Show the stratagems, command points, secondary cards, primary missions and opposing armies behind a player's record on their profile.

## 0.72.0 (2026-09-22)

### Minor Changes

- d3a487b: Compare unit loadouts in a combat simulator shared by the public page, roster editor and battles, with buffs, live casualties, and damage and kill odds.

## 0.71.2 (2026-09-22)

### Patch Changes

- 55518cf: Show independently customizable weapons as separate roster loadout controls.
- 802a1d4: Prioritize rosters in mobile navigation and make onboarding an optional profile item.

## 0.70.1 (2026-09-22)

### Patch Changes

- d2c0f9a: Omit narrative flavour text from stratagem descriptions.

## 0.70.0 (2026-09-21)

### Minor Changes

- 4292f78: Add a resumable getting-started guide through roster building, battles, leagues, the game reference and community pages that counts tasks you've already done.

### Patch Changes

- ad7460b: Open your profile from the account menu, and reach battles, rosters and leagues from the main navigation.
- ad7460b: Choose who can watch your battles in a Privacy box beside your other profile settings.

## 0.69.0 (2026-09-21)

### Minor Changes

- 3b506de: Invite a new player with a one-time link that makes you friends once they join.

### Patch Changes

- cc2e7bf: Keep roster loadout and model counters accurate during consecutive presses.

## 0.67.2 (2026-09-19)

### Patch Changes

- 13f59e8: Let either player choose both sides' secondary missions, keep optional paired missions when drawn, and keep mobile navigation during battle prompts.

## 0.67.1 (2026-09-19)

### Patch Changes

- c7711a2: Allow end-of-turn scoring to record every active mission together.

## 0.66.7 (2026-09-19)

### Patch Changes

- 332b8dd: Show full detachment names on the phone faction page, with their chips beneath.
- d2405c7: Find players on the friends page by typing a name.
- 332b8dd: Remove the duplicate "Secondary mission" label from the mission card dialog.
- 332b8dd: Say when a faction has no units to pick, not that it's still loading.
- 6af4c07: Style every dialog, menu, page header and small label consistently.
- 332b8dd: Draw every tooltip as the same small raised panel.

## 0.66.6 (2026-09-19)

### Patch Changes

- 866dc1d: Show the correct terrain reference labels on affected battlefield maps.

## 0.66.5 (2026-09-17)

### Patch Changes

- 7c2f3e1: Open feedback and other external links in an in-app browser when the device has no external handler.

## 0.66.4 (2026-09-17)

### Patch Changes

- ad52c7b: Open shared rule links at the rule they name on small screens.

## 0.66.3 (2026-09-17)

### Patch Changes

- a6d8e8f: Keep mobile web navigation available while viewing a roster unit.

## 0.66.1 (2026-09-16)

### Patch Changes

- 9ff3c7b: Retry automatic mission card preparation after another device updates battle setup.
- 23a659b: Use shared mobile utility and navigation bars with remembered tabs and a dedicated More page.

## 0.66.0 (2026-09-16)

### Minor Changes

- ec3e442: Add configurable multi-phase reminders for roster rules and active mission actions, with scoped dismissals and battle controls.

## 0.64.4 (2026-09-11)

### Patch Changes

- aa42b17: Keep the unit sidebar visible in an owner's roster View mode.

## 0.64.3 (2026-09-11)

### Patch Changes

- 9756548: Count a character inside the unit it joined in the roster header, matching the library.

## 0.64.2 (2026-09-11)

### Patch Changes

- cca1d67: Draw the table a detachment rule rolls on instead of printing its markup.

## 0.64.1 (2026-09-11)

### Patch Changes

- 83a9386: Show unit composition and model count correctly on datasheets whose source lists composition in HTML.
- 83a9386: Underline words the catalogue marks in abilities instead of printing the tag.

## 0.64.0 (2026-09-11)

### Minor Changes

- 300e815: Read every roster on one screen: a fielded list keeps its points total, unit count, actions and full datasheet link, and View mode shows owners exactly what other readers see.

## 0.63.4 (2026-09-10)

### Patch Changes

- 21f3076: Simplify model loadouts: default wargear first, stable visible weapon profiles, source instructions, formatted rule tooltips and clearer controls that keep required weapons.

## 0.63.3 (2026-09-10)

### Patch Changes

- 39fb1e3: Restore missing primary mission scoring text and secondary objective cards after a rules source file rename.

## 0.63.2 (2026-09-10)

### Patch Changes

- f202add: Show a model's wargear beside the single item its loadout group offers, such as a Pathfinder Shas'ui's pulse carbine and pistol.
- f202add: Count a paired loadout once on a unit card: a Boyz mob shows one Nob's weapons, not two.
- f202add: Count the weapons ordinary squad members keep when squadmates swap theirs: a Tactical Squad shows ten boltguns, not one.

## 0.63.1 (2026-09-10)

### Patch Changes

- f7e8607: Show each Agile Manoeuvre's trigger and effect under Aeldari Battle Focus.
- f7e8607: Offer detachment enhancements limited to certain bearers, such as the Aeldari Warhost's.

## 0.63.0 (2026-09-09)

### Minor Changes

- 6ef4d10: Let league allies read each other's sealed lists before the reveal.

### Patch Changes

- 6ef4d10: Recede the league organizer's remove control to a muted icon.

## 0.62.0 (2026-09-09)

### Minor Changes

- 57b9b2c: Share unlisted roster links from the roster screen.

### Patch Changes

- 6ffde79: Fix terrain setup rulers to use the intended corners and whole-inch labels.
- 3f2b45e: Show mission card instructions, including which units a drawn card lets you choose.
- a099830: Remove a special weapon without passing it to a squadmate; the model returns to the squad's ordinary loadout.
- f9413c6: Fade the roster header's faction line when its detachment overflows, so narrow screens show there is more to scroll.

## 0.61.8 (2026-09-06)

### Patch Changes

- ea93795: Keep detachment-only abilities off standalone datasheets.

## 0.61.7 (2026-09-06)

### Patch Changes

- e97c341: Open a mission immediately while its terrain layouts load.

## 0.61.6 (2026-09-06)

### Patch Changes

- 7b62124: Enforce the Strategic Reserves points limit during battle setup.

## 0.61.5 (2026-09-06)

### Patch Changes

- 588e0e9: Drop battle-round and turn qualifiers from end-of-battle mission payouts.

## 0.61.4 (2026-09-06)

### Patch Changes

- 8eaf278: Keep available wargear abilities on standalone datasheets.

## 0.61.3 (2026-09-06)

### Patch Changes

- affb854: Keep optional wargear abilities visible on public datasheet pages.
- affb854: Show dense terrain green and light terrain yellow on battlefield layouts.
- affb854: Fix battlefield objective markers and include all supplied terrain placement measurements.

## 0.61.2 (2026-09-06)

### Patch Changes

- 330d2d0: Keep wound-management controls stable while casualty changes save.
- 42a1a6c: Show detachment-specific datasheet abilities under their detachments, apart from intrinsic abilities.
- 158383f: Show only selected wargear abilities and apply what they grant to unit profiles.

## 0.61.1 (2026-09-06)

### Patch Changes

- 059bd9c: Let either player continue battle setup without waiting for the other to open the secondaries screen.

## 0.61.0 (2026-09-05)

### Minor Changes

- 25ba448: Explain unmatched roster import names: the datasheet's real faction, the closest catalogue name, the enhancement's detachment, and the datasheet's squad sizes.
- 25ba448: Import the rest of a roster when a unit names a datasheet the faction lacks, instead of refusing the whole list; the pre-save dialog names the missing units with anything else that could not be placed.
- 25ba448: Remove `.ros` and `.rosz` file import; roster import reads only Praetorium, BattleBase and New Recruit text exports.

## 0.60.2 (2026-09-05)

### Patch Changes

- 776207b: Report a roster with more enhancements than its battle size allows: two at Incursion, four at Strike Force.

## 0.60.1 (2026-09-04)

### Patch Changes

- 1f4f9a8: Limit Incursion rosters to two of each datasheet and four of each Battleline or Dedicated Transport.
- 1f4f9a8: Report how many of a datasheet a roster may hold for catalogue-composed units, which covers most datasheets.

## 0.60.0 (2026-09-04)

### Minor Changes

- 0bc3cc9: Let league organizers unseal a revealed roster so its entrant can submit a corrected list.

## 0.59.0 (2026-09-04)

### Minor Changes

- 35d19a5: Name the choices a roster import cannot give a unit — equipment, enhancements, Warlord, squad size and attachments — and ask before saving instead of silently using the datasheet's default build.

## 0.58.1 (2026-09-04)

### Patch Changes

- b328da1: Let separate loadout slots take the same weapon within their own limits.

## 0.58.0 (2026-09-04)

### Minor Changes

- 9a82453: Use native app bars across the responsive battle, roster, catalogue, rules, and league screens.

## 0.57.2 (2026-09-04)

### Patch Changes

- 1de9c64: Show player avatars on the leaderboard and in player choices.

## 0.57.1 (2026-09-04)

### Patch Changes

- 41f675d: Let a loadout option be restored after a composite weapon replaced it.

## 0.57.0 (2026-09-04)

### Minor Changes

- 2200221: Add a player leaderboard ranked by wins and win rate, with a table per faction for players who field it.
- 2200221: Open every player's profile to anyone, showing their leaderboard rank, service record, and the battles you may watch them in.
- 2200221: Add a public roster option that shows a saved list on its owner's profile, not just at its link.

## 0.56.0 (2026-09-04)

### Minor Changes

- ea994d7: Browse the core rules, Chapter Approved, the event companion and Combat Patrol by section, or search by rule name or number.

## 0.55.0 (2026-09-04)

### Minor Changes

- a83f758: Search detachments by name or force disposition when building a roster.
- a83f758: Name a list from its contents — `HL 1K - C'tan & Hexmark` — rather than the faction and detachment shown beside it, and never overwrite a typed name.

### Patch Changes

- a83f758: Build deeply nested required weapon choices, so Firestrike Servo-Turrets, Devastator Squads and Sentinels arrive armed and legal.
- a83f758: Say a Judiciar must be attached to a Bodyguard unit, not report an unanswerable shortfall.
- a83f758: Field the full squad when a datasheet reserves a sergeant: a Terminator Squad has five models, not four.
- a83f758: Default mandatory wargear to the cheapest option, so a Leman Russ, Ravager or Achilles Ridgerunner starts at its Munitorum base cost.

## 0.54.0 (2026-09-04)

### Minor Changes

- deb571d: End a battle on the winner's name, picture and score, with confetti on the winners' devices.
- deb571d: New leagues ask only who can see and join; set battle format and points on the league page until the first roster is sealed.

### Patch Changes

- deb571d: Score the battle ready bonus as the battle begins, per the current rules.
- deb571d: Delete a battle from the home page, without opening it first.
- deb571d: Drop the note repeating that a finished battle is finished.
- deb571d: Show a detachment enhancement's ability on a datasheet only once it is taken.
- deb571d: Accept organizers into their own league without self-approval.
- deb571d: Show league events as buttons with their status, and word league pages the way players talk.
- deb571d: Let league organizers change visibility and joining after players join, accepting waiting requests when joining becomes automatic.
- deb571d: Keep the app's Back action and iOS back gesture inside the open tab, and offer neither on a tab's first screen.
- deb571d: Start every battle from one New battle button, and say when a league event awaits that matchup.
- deb571d: Shorten the battle events panel so other battle facts stay in view.

## 0.53.8 (2026-09-03)

### Patch Changes

- 06262a1: Show unconditional detachment-granted weapon abilities on eligible units.

## 0.53.7 (2026-09-03)

### Patch Changes

- cc1cf40: Keep the unit picker available in saved 500-point King of the Colosseum rosters.
- cc1cf40: Count attached datasheets as one unit in roster summaries.

## 0.53.6 (2026-09-03)

### Patch Changes

- 72f16b4: Keep loadout choices open when another selection temporarily closes them.

## 0.53.5 (2026-09-03)

### Patch Changes

- 8d8b7af: Allow squads to take their full special weapon allowance.

## 0.53.4 (2026-09-03)

### Patch Changes

- 9def47d: Let squad-size rules increase the special weapons available.

## 0.53.3 (2026-09-03)

### Patch Changes

- fa1ab0c: Show every available detachment rule, including keyword definitions.

## 0.53.2 (2026-09-03)

### Patch Changes

- 289dd2a: Show each officer's Orders limit and eligible units on its datasheet.

## 0.53.1 (2026-09-03)

### Patch Changes

- 1e9dca9: Let bodyguard units accept every Leader their catalogue permits.

## 0.53.0 (2026-09-03)

### Minor Changes

- a9609f9: Let spectators read battle missions, let seated players record another player's concession, and keep shared rosters stable while loading.

## 0.52.1 (2026-09-03)

### Patch Changes

- 003bdba: Offer and require a Mark of Chaos only in the detachment that grants one.

## 0.52.0 (2026-09-03)

### Minor Changes

- 676107c: Show each mission's unit action, named by the side that may perform it.

## 0.51.3 (2026-09-03)

### Patch Changes

- 75aa8be: Put stratagems first on stacked battle panels and collapse resolved secondary missions behind a reveal control.

## 0.51.2 (2026-09-03)

### Patch Changes

- c7e4628: Limit Wolf Scouts imports to the datasheet's six or twelve models.

## 0.51.1 (2026-09-03)

### Patch Changes

- 64cf604: Keep long roster names, army rows and battle cards on screen on phones.
- d28ae30: Return to the roster, not the screen before it, when a tab reopens a unit.

## 0.51.0 (2026-09-02)

### Minor Changes

- 21e9c10: Split the signed-in home page into, in order: your live games, your past games, your friends' games and everyone else's.

## 0.50.7 (2026-09-02)

### Patch Changes

- 988fbcc: Keep battle controls reachable, preserve native tabs, enlarge mobile dialog actions, and recover stale live battles.

## 0.50.6 (2026-09-02)

### Patch Changes

- 351694f: Keep shared battle setup stable when both players act together.

## 0.50.5 (2026-09-02)

### Patch Changes

- cc572e7: Keep mobile rosters with switched-off format restrictions on screen.

## 0.50.4 (2026-09-02)

### Patch Changes

- ce6d6c3: Show each core stratagem once when sources punctuate its name differently.

## 0.50.3 (2026-09-02)

### Patch Changes

- de2c4d4: Keep undo available in every live battle action dialog.

## 0.50.2 (2026-09-02)

### Patch Changes

- fa61429: Name battlefields and replacement draws clearly in battle logs, count attached datasheets as one unit, and fit unit panes on phones.

## 0.50.0 (2026-09-02)

### Minor Changes

- 1da2457: Return each app tab to the screen you left, so switching between a roster and a datasheet keeps both in place.

### Patch Changes

- fb8d39f: Keep the app tabs reachable, not covered, while a unit is open in the roster editor.

## 0.49.1 (2026-09-01)

### Patch Changes

- 512b657: Open new-tab links inside the app rather than in a window stacked on top.
- d760b77: Stop iOS zooming and pushing the header and tabs off screen when you tap a search or text field.

## 0.48.1 (2026-09-01)

### Patch Changes

- 986a8cf: Show correct characteristics for roster units with optional models.

## 0.48.0 (2026-09-01)

### Minor Changes

- 9a95d8d: Add native phone and tablet navigation, keep back actions in one place, and stop signed-in players returning to sign-in.

## 0.47.3 (2026-09-01)

### Patch Changes

- 48417c5: Wrap every featured battle player name onto its own line on narrow screens.

## 0.47.2 (2026-09-01)

### Patch Changes

- 97299b6: Make homepage capability cards fully clickable and speak directly to players.

## 0.47.1 (2026-09-01)

### Patch Changes

- 0b4cce9: Keep catalogue datasheets and rules aligned when upstream names differ.

## 0.47.0 (2026-09-01)

### Minor Changes

- 9acb549: Show player avatars, factions, faction marks, and detachments on battle cards, and keep practice games off the home page.

## 0.46.0 (2026-08-31)

### Minor Changes

- 0ed0f4e: Show live activity on the home page, newest first: your table, your friends' battles and every watchable battle, including finished ones to watch or read back. Choose who can watch your battles from your profile.
- 0ed0f4e: Every battle names its whole table at creation, so battle links offer no open seat and only open a battle to read or watch.
- e256c5c: Colour each battle by its stage, open player profiles to anyone, and land on the home page after signing in.

## 0.45.0 (2026-08-31)

### Minor Changes

- 18344cd: Add optional rules in their own dialog: homebrew a battle size allows, off unless a roster picks it. King of the Colosseum offers a borrowed disposition, spending the detachment points its own detachment leaves unspent on another detachment's Force Disposition alone, never its rules, enhancements or stratagems.
- 18344cd: Offer King of the Colosseum at one 600-point size, with no size suffix; lists saved at 500 points keep their King of the Colosseum construction rules and play as before.

### Patch Changes

- 18344cd: Report a King of the Colosseum unit at the Toughness cap as unverifiable when an enhancement or attached leader could raise it, rather than accept a list the format forbids.

## 0.44.0 (2026-08-31)

### Minor Changes

- 3333692: Switch off any of a battle size's army construction restrictions per roster, such as Epic Heroes in a King of the Colosseum list.
- 3333692: Warn before a roster with switched-off battle size restrictions is brought to a battle or sealed into a league, and show everyone at the table what it waives.

### Patch Changes

- 8c2b62e: Show a weapon keyword once when a detachment grants one it already has.
- 3333692: Remove the picker's Hide allies filter; allied datasheets already sit at the bottom of the book.

## 0.43.12 (2026-08-31)

### Patch Changes

- ade1c36: Add a public data source and licence notice.

## 0.43.11 (2026-08-31)

### Patch Changes

- d2a94e6: Open datasheets and other new-window actions from the mobile application.

## 0.43.10 (2026-08-31)

### Patch Changes

- d968a60: Finish native sign-in immediately after returning from the provider.

## 0.43.9 (2026-08-31)

### Patch Changes

- e9c37b3: Fix signing in from the app.

## 0.43.8 (2026-08-31)

### Patch Changes

- 0950173: Fix signing in from the app.

## 0.43.7 (2026-08-31)

### Patch Changes

- 3d14898: Refresh the signed-in mobile interface after authentication finishes.

## 0.43.6 (2026-08-31)

### Patch Changes

- b0c82d4: Refresh the mobile interface when social sign-in completes.

## 0.43.4 (2026-08-31)

### Patch Changes

- 383c42c: Refresh the mobile interface immediately after social sign-in.

## 0.43.3 (2026-08-31)

### Patch Changes

- ee2dd54: Fix social sign-in from the app.

## 0.43.2 (2026-08-31)

### Patch Changes

- c81ee21: Finish native sign-in after returning from the provider.

## 0.43.1 (2026-08-31)

### Patch Changes

- 8d31b7d: Let Apple and Google sign-in finish after the native system authentication session.

## 0.43.0 (2026-08-31)

### Minor Changes

- 6abc485: Add store-ready iOS and Android apps with native battle integrations and Sign in with Apple.

## 0.42.8 (2026-08-30)

### Patch Changes

- 36370bd: Use consistent mission addition markers and keep chosen specialist loadouts when adding another specialist.

## 0.42.7 (2026-08-30)

### Patch Changes

- 02c441c: Let Plague Surgeons lead Plague Marines and cap specialist loadouts by the selected squad size.

## 0.42.6 (2026-08-30)

### Patch Changes

- e0b7c9f: Highlight only the weapon keyword added by a roster rule.

## 0.42.5 (2026-08-30)

### Patch Changes

- fc89e76: Clarify alternative and additional mission objectives and drop mission flavor text.

## 0.42.4 (2026-08-29)

### Patch Changes

- ce0deae: Fix secondary mission redraws, New Orders, turn undo, and command-point grants.

## 0.42.3 (2026-08-28)

### Patch Changes

- 4e3ba47: List current detachments and enhancements from Game Datacards.

## 0.42.2 (2026-08-28)

### Patch Changes

- ac307bd: Recover native social sign-in safely after the web renderer or app restarts.

## 0.42.1 (2026-08-28)

### Patch Changes

- 0736263: Restore exact battlefield terrain from the current Battlemaster references.

## 0.42.0 (2026-08-28)

### Minor Changes

- deeec32: Open shared Praetorium links in the mobile app and refresh battles on return.

### Patch Changes

- e002f8e: Use Game Datacards points and force dispositions for army construction.

## 0.41.3 (2026-08-27)

### Patch Changes

- a91e28a: Keep mandatory wargear and unit size when equipping independent model upgrades.

## 0.41.2 (2026-08-27)

### Patch Changes

- cafae13: Fix squad champion wargear, keep loadout edits responsive while pricing, and link same-named datasheets to their own factions.

## 0.41.1 (2026-08-27)

### Patch Changes

- db56725: Show stable skeletons while pages load and keep tapped rule tooltips open.

## 0.41.0 (2026-08-27)

### Minor Changes

- ea4c473: Complete native social sign-in and let players delete their accounts.

## 0.40.4 (2026-08-27)

### Patch Changes

- 392b01a: Merge a weapon's firing modes and casing variants into one search result, its match chip naming the weapon you searched.

## 0.40.3 (2026-08-27)

### Patch Changes

- add6272: Speed up roster pricing so the list builder responds faster to edits.

## 0.40.2 (2026-08-27)

### Patch Changes

- 1adb870: Keep faction datasheet navigation from briefly showing an error.

## 0.40.1 (2026-08-27)

### Patch Changes

- b4f5a0d: Allow size-limited specialist weapons and hide unselected detachment upgrades.

## 0.40.0 (2026-08-27)

### Minor Changes

- 519669f: Duplicate another player's shared roster into your private rosters.
- 0efb506: Import Praetorium Games Workshop roster text and keep repeated unit attachments.

### Patch Changes

- 05350f6: Fix pre-battle rules, command-point feedback, mission scoring prompts, round progression, mission details, casualty controls and weapon readability.

## 0.39.7 (2026-08-27)

### Patch Changes

- 2abd934: Lock loadout counters while a price is calculating, so a quick second press cannot split a squad the roster no longer holds.
- 2abd934: Find a datasheet by any weapon it can take, and stop listing its detachment's enhancements as its abilities.

## 0.39.6 (2026-08-27)

### Patch Changes

- 8a39608: Name stratagems as their cards print them, not in title-cased rules dataset capitals.

## 0.39.5 (2026-08-27)

### Patch Changes

- 3047147: Draw weapon and model cards only from the community catalogue, so loadouts stop listing a weapon twice, under another faction's name, or with a second dataset's stale spelling.
- 3047147: Read rule descriptions from Game Datacards, matched by name to the rules dataset, and give every Codex chapter its army rules.
- 3047147: Allow a faction's own datasheets past an army rule banning another codex's version, such as a Black Templars Impulsor.
- aeaeea7: Stop listing a model's default weapons beside their replacement: a Cadian sergeant with a bolt pistol no longer also shows a laspistol.

## 0.39.4 (2026-08-27)

### Patch Changes

- 251038b: Show battle actions for revealed leagues that predate stored event formats.
- 247c2e1: Validate Warlords when entrants seal league rosters, and place roster actions before event history.

## 0.39.3 (2026-08-26)

### Patch Changes

- 9823cbd: Direct eligible league matchups through their event before starting a casual battle.
- eea3629: Share every live mission prompt across seated devices.

## 0.39.2 (2026-08-26)

### Patch Changes

- 7f0b23c: Let spectators open player profiles, faction and detachment references, and frozen rosters.

## 0.39.1 (2026-08-26)

### Patch Changes

- fc305e5: Show both sides in secondary setup and settle mandatory tactical cards without waiting on another device.

## 0.39.0 (2026-08-26)

### Minor Changes

- 75c4333: Let every league add another event after revealing the current one.
- 6af78a7: Let players select the exact tactical secondary missions they draw.

### Patch Changes

- 46c2dea: Restore missing tactical draws and primary scoring prompts in running battles.
- d1eb804: List a character and their joined unit as one when setting reserves, and hold them back together.
- 10769b1: Open rule tooltips when tapped on a touch device.

## 0.38.4 (2026-08-26)

### Patch Changes

- c46226c: Advance battle setup with one corner button instead of arrows on the section rail.

## 0.38.3 (2026-08-26)

### Patch Changes

- c8a3e77: Highlight detachment and roster links in battle views.

## 0.38.2 (2026-08-26)

### Patch Changes

- efb4270: Choose the defender after the setup roll-off.

## 0.38.1 (2026-08-26)

### Patch Changes

- 1659ac8: List Deep Strike units first among Strategic Reserves choices in battle setup.

## 0.38.0 (2026-08-26)

### Minor Changes

- d8d61e7: Follow league-event battles live or review them later with their frozen rosters.

## 0.37.1 (2026-08-26)

### Patch Changes

- dc4b0c2: Show the live side preview when starting a 2v1 battle from a league event.
- dc4b0c2: Name table shapes the same way when starting a battle and setting up a league event.

## 0.37.0 (2026-08-25)

### Minor Changes

- ff153a0: Add fixed-team Doubles events and four-player battles.

## 0.36.0 (2026-08-25)

### Minor Changes

- 8dd543f: Add event-specific roster sizes and 2v1 roster assignments.

## 0.35.1 (2026-08-25)

### Patch Changes

- ad53f2d: Show full roster details, reference links and accurate equipped wargear in roster views and exports.

## 0.35.0 (2026-08-25)

### Minor Changes

- 9fd6333: Let organizers edit, manage, and delete their leagues.

## 0.34.15 (2026-08-25)

### Patch Changes

- 0ffff03: Show each champion wargear option only once in the loadout.

## 0.34.14 (2026-08-25)

### Patch Changes

- 319b35d: Fix profile picture upload on iOS.

## 0.34.13 (2026-08-25)

### Patch Changes

- b39db79: Let champions equip every legal wargear replacement and additive upgrade.

## 0.34.12 (2026-08-25)

### Patch Changes

- 92c6746: Show profile pictures consistently and link league player names to profiles.

## 0.34.11 (2026-08-25)

### Patch Changes

- 458c226: Speed up navigation and keep roster workspaces stable while loading.

## 0.34.10 (2026-08-25)

### Patch Changes

- 64418e3: Reduce complex profile pictures until they fit the upload limit.

## 0.34.9 (2026-08-25)

### Patch Changes

- b892a56: Speed up roster setup and selection in rosters, battles and leagues.

## 0.34.8 (2026-08-25)

### Patch Changes

- 7342664: Speed up initial global searches and roster page loads.

## 0.34.7 (2026-08-25)

### Patch Changes

- 2d587dc: Speed up initial global searches and roster loading.

## 0.34.5 (2026-08-25)

### Patch Changes

- 84d349f: Show every equipped weapon when configuring a unit's wargear.
- 1765553: Keep long books responsive in the unit picker, roster column and faction datasheet lists.

## 0.34.4 (2026-08-25)

### Patch Changes

- 221e6a7: Keep composite roster loadouts reversible and show all their weapon profiles.

## 0.34.0 (2026-08-25)

### Minor Changes

- 5baafe7: Run recurring league events with fresh registration and sealed rosters.

## 0.33.6 (2026-08-25)

### Patch Changes

- 4c53471: Load the battle list a page at a time, most recent activity first, so it stays fast however many battles you have played.

## 0.33.5 (2026-08-25)

### Patch Changes

- 5d029ad: Make faction pages, search, and the library markedly faster.
- 32e5b9d: Show squad-wide wargear quantities correctly in roster previews.
- 5d029ad: Show the latest hundred battle report events, with earlier ones a click away.

## 0.33.4 (2026-08-25)

### Patch Changes

- e97d470: Show only the faction abilities available to the selected army.

## 0.33.3 (2026-08-25)

### Patch Changes

- 0929f4e: Filter and sort the roster library from Filter and Sort buttons that fit every screen size.

## 0.33.2 (2026-08-25)

### Patch Changes

- 43a41a2: Show roster details when choosing a roster to seal in a league.

## 0.33.1 (2026-08-25)

### Patch Changes

- d83e5d6: Export full roster setup and attachments, price repeated units correctly, and unlock enhancement-dependent attachment options.

## 0.33.0 (2026-08-25)

### Minor Changes

- 2378621: Add public and private leagues with configurable player limits, sealed roster battles and organizer-controlled reveal.

## 0.32.2 (2026-08-25)

### Patch Changes

- 2c03bcb: Offer sign-in when a session lapses mid-battle, not an error the player cannot act on.

## 0.32.0 (2026-08-25)

### Minor Changes

- a83123d: Use a Google or Discord profile picture for players without one, on sign-up or when linking a new sign-in method.

## 0.31.0 (2026-08-25)

### Minor Changes

- 43f0778: Track wounds on units in battle, so damaged vehicles and monsters count wounds, not just whole models.
- 43f0778: Open a fielded army over the live battle to record losses: remove models from a unit, mark a whole unit lost so it leaves its shelf, or bring one back.

## 0.30.0 (2026-08-25)

### Minor Changes

- 7208abf: Add a privacy policy at /privacy and terms of service at /terms

## 0.29.0 (2026-08-25)

### Minor Changes

- 10c933a: Show attachment roles and related units in roster datasheets, add valid attachment menus, and enforce one Leader and one Support per unit.

## 0.28.4 (2026-08-25)

### Patch Changes

- 15fb7bf: Remove origin labels from saved rosters in the roster library.

## 0.28.3 (2026-08-25)

### Patch Changes

- d45692a: Show core abilities granted by selected unit upgrades.

## 0.28.2 (2026-08-24)

### Patch Changes

- 787ec46: Keep roster export actions visible and stamp exported text with the Praetorium version.

## 0.28.1 (2026-08-24)

### Patch Changes

- b1e07c9: Clear unit enhancements and upgrades when changing detachments.

## 0.28.0 (2026-08-24)

### Minor Changes

- 1884cc4: Add a GitHub Issues link for bug reports and feedback.

## 0.27.1 (2026-08-24)

### Patch Changes

- 50c2d2a: Fix missing and duplicated roster weapons, nested loadout choices, and detachment unit upgrades.

## 0.27.0 (2026-08-24)

### Minor Changes

- cac064f: Add the initial iOS and Android application shell.
- 27a4590: Search for datasheets by their keywords, abilities, weapons, and wargear.

### Patch Changes

- 32ae6bc: Apply King of the Colosseum eligibility and unit limits while building a roster.
- ca0af86: Show multi-profile weapons once and drop false catalogue warnings on shared wargear.
- 8cdf33e: Keep broad datasheet searches responsive.
- b35a558: Restore Leader and Support keywords to faction datasheets.

## 0.26.0 (2026-08-24)

### Minor Changes

- 84c9de5: Add email verification and password recovery, a clearer sign-in URL, and explanations for social sign-in failures.

## 0.25.0 (2026-08-24)

### Minor Changes

- 14e63da: Add linked Google and Discord sign-in, password management, and authenticator two-factor authentication.

## 0.24.1 (2026-08-24)

### Patch Changes

- b159de3: Show when one side has finished its turn while the other still has one left this battle round.

## 0.24.0 (2026-08-24)

### Minor Changes

- 6eb41f7: Show abilities from enhancements and attached units on contextual datasheets.

## 0.23.5 (2026-08-23)

### Patch Changes

- 7e94a2e: Make switching between building and viewing a roster clear.

## 0.23.4 (2026-08-23)

### Patch Changes

- 4f664f9: Stop false catalogue warnings for recognised primary categories and aggregated model wargear.

## 0.23.3 (2026-08-23)

### Patch Changes

- e5d790e: Open related datasheets in their canonical faction reference.

## 0.23.2 (2026-08-23)

### Patch Changes

- ecefcfc: Let every model in an aggregated squad take its per-model equipment choices.

## 0.23.1 (2026-08-23)

### Patch Changes

- 082afd6: Show a unit's weapon in the roster preview when it carries a nested upgrade.

## 0.23.0 (2026-08-23)

### Minor Changes

- d37675d: Add a deployment section naming who sets up first and each side's units that deploy outside their zone.
- d37675d: When an allied side's two armies bring different Force Dispositions, ask which it plays instead of using the first seat's.
- d37675d: Open a 2v1 from either side, picking an ally to play beside you, not only a pair to face.
- d37675d: Play a mission twist from packs that print one, chosen with the mission and readable all game.
- d37675d: Read each side's primary mission and pick the twist before the battlefield, once the deciding matchup is known.
- d37675d: Add a pre-battle rules section naming who resolves first and each side's units with a scouting move, and start the battle from there.
- d37675d: Take an army back off the table during setup, not just swap it for another.

### Patch Changes

- d37675d: List only units that can deploy elsewhere when setting reserves, and ask once whether the table uses Strategic Reserves.
- d37675d: Stop a single fixed secondary mission scoring past its mission pack's per-card cap.
- d37675d: Claim the battle ready bonus when an army is chosen; turn it off for an unpainted army.
- d37675d: Fit the battle scoreboard back onto a phone, naming each side by its players' pictures when names don't fit.
- d37675d: Draw every scrollbar thin and dark on both axes, instead of the platform default across a dark panel.
- d37675d: Stop badging a practice opponent's side, format and table as practice, since the seat's name already says so.
- d37675d: Show a side's missions beside its stratagems on a tablet when one panel has the page to itself.
- d37675d: Move finishing, conceding and deleting a battle to a named button under the battle log, keeping round and phase centred.
- d37675d: Group an allied side's stratagems by the detachment that brought them, and note that a detachment's rules don't reach an ally's units.
- d37675d: Head each side panel with its players' pictures, names and armies, leaving the scoreboard to the score when both panels are on screen.
- d37675d: Pay a side one battle ready bonus, only when every army on it is battle ready, not one per allied army.
- d37675d: Sit the button that ends a phase flush against the bottom of a phone or tablet screen.
- d37675d: Give a 2v1 side every stratagem both allies brought, not only the first ally's detachment.
- d37675d: Link each army's faction, detachment and list on its own line in its side panel, and not again in the scoreboard.
- d37675d: Group an army's units by datasheet shelf when setting reserves, and state where each starts instead of showing every placement as an equal button.
- d37675d: Stop tracking and showing which players have a battle open.
- d37675d: Say your army is missing when a setup section needs it, instead of drawing an empty panel.
- d37675d: Let a player settle their side's cards when a practice opponent holds the seat beside them, so that side can start.
- d37675d: Read the mission, choose the battlefield and settle the secondaries in separate sections, not two to a screen.
- d37675d: Show each army's force disposition in its own colour beside its list, with the battle ready bonus.
- d37675d: On a card that scores one way fixed and another tactical, show only the payout a side can take once it has chosen which it plays.
- d37675d: Draw the rule between a side's missions and stratagems only where they stack, not across the top of a neighbouring column.
- d37675d: Say which secondary missions a turn just dealt, apart from those already in hand, and offer a card back to the deck only in the turn it was drawn.
- d37675d: Colour the scoring prompt in the scored side's colour, so the paid side is clear before its name is read.
- d37675d: Colour the button that ends a phase to match the side taking the turn, not one colour all game.
- d37675d: Take exactly two fixed secondary missions from the four cards with a printed fixed payout, not up to six from the whole deck.
- d37675d: Warn that a mission twist rewriting the Primary Mission cards is recorded but not applied to the missions on screen.
- d37675d: Show both names of an allied side in full instead of clipping the second.

## 0.22.2 (2026-08-23)

### Patch Changes

- 6dc0960: Keep mission packs, battle setup and create-battle showing mission and disposition data when the cached rules lack a disposition map.

## 0.22.1 (2026-08-23)

### Patch Changes

- 023d630: Draw two new tactical secondaries at the start of each of a side's own turns however many earlier cards are unresolved, instead of only refilling the hand to two.

## 0.22.0 (2026-08-23)

### Minor Changes

- f439680: Replace solo practice with a practice opponent: a full battle against a seated account that never signs in, in a 1v1 or on either side of a 2v1.

### Patch Changes

- f439680: Show an allied pair the deck their shared hand draws from, not only the seat that deals it.
- 0f9d5bd: Stop a datasheet whose name opens with a weapon keyword claiming that weapon's rule.
- 0f9d5bd: Leave the catalogue's own bookkeeping off a datasheet's keyword line.
- 0f9d5bd: Shelve a datasheet by a primary keyword it sorts under, so Titans leave Other.
- f439680: Say what the active side still owes instead of blocking the turn for everyone else.

## 0.21.18 (2026-08-23)

### Patch Changes

- fcdd4e8: Show a mission pack's per-round victory point cap beside its per-battle cap.
- fcdd4e8: Hold each side to its own mission's caps, not those of the viewing player's mission.
- fcdd4e8: Show in each card's total how much of its claim a mission cap took, so a payout can be dropped elsewhere to make room.
- fcdd4e8: Say once beneath the scoring total what room a reached mission cap left, naming the cap and the points it refuses, instead of an unnumbered note under every payout.
- fcdd4e8: Fix a scoring prompt totalling points it won't bank once a mission's round or battle cap is reached, such as a round holding 4 VP offering 13 more and recording 11.
- fcdd4e8: Show at the top of a scoring prompt how each mission category stands against its limiting victory point cap, so the round's remaining allowance is known before pressing a payout.
- fcdd4e8: Count points a previous turn owed against that turn's battle round, so a side can't bank a full round's allowance in its own turn and spend the next round's on what the opponent's turn owed it.

## 0.21.17 (2026-08-23)

### Patch Changes

- 021f3e0: Give a unit the keywords its book grants, so a Dark Angels Chaplain in Terminator Armour is Deathwing and can take Deathwing Assault.

## 0.21.16 (2026-08-23)

### Patch Changes

- 5633a37: Show in the end-of-turn tactical discard prompt whether the round's bonus CP is still available, and mark selected cards clearly.

## 0.21.15 (2026-08-23)

### Patch Changes

- e4f8951: Fix multi-mode weapons like a missile launcher showing no stats in the loadout pane when the catalogue prints modes with a marker and dash instead of parentheses.
- 7cca113: Draw the models a datasheet requires, so a unit's loadout includes its sergeant. An Eradicator Squad showed two Eradicators and no Eradicator Sergeant, counting its wargear two models short; 53 datasheets lacked a model this way, including Tactical Squad, Kasrkin, Grey Knights Strike Squad and Battle Sisters Squad.
- 7cca113: Name a squad's rank and file after the model, not the unit, so an Eradicator Squad's second card reads "Eradicator" rather than the unit's name.

## 0.21.14 (2026-08-23)

### Patch Changes

- d850d47: Stop drawing wargear twice when the datasheet and catalogue both describe it, such as the Incursor Squad's haywire mine.

## 0.21.13 (2026-08-23)

### Patch Changes

- ee858c0: Fix uploading a profile picture eventually causing errors.

## 0.21.12 (2026-08-23)

### Patch Changes

- 981c0b6: Fix roster units listing in the order they were added instead of alphabetically.

## 0.21.11 (2026-08-23)

### Patch Changes

- a3d448f: Fix favourited datasheets sometimes not appearing after a hard refresh of a faction's datasheets page.
- a3d448f: Stop blocking scoring once the round or battle VP cap is reached: it stays a warning and only the overage goes uncounted, so the rest of that turn's legitimate scoring still goes through.
- a3d448f: Make the end-of-turn tactical secondary discard optional, letting a player choose which cards, if any, to give up instead of discarding every active card.
- a3d448f: Fix undoing a tactical draw from several turns back auto-dealing a fresh hand instead of pausing, which blocked rewinding past that point.

## 0.21.9 (2026-08-23)

### Patch Changes

- 892aab6: Stop the faction datasheets list flickering on first load for signed-in players.

## 0.21.8 (2026-08-23)

### Patch Changes

- d4462df: Show datasheets whose catalogue and reference names use different apostrophes.

## 0.21.7 (2026-08-23)

### Patch Changes

- 85aee37: Score primary missions at the end of each player's turn in the final battle round.

## 0.21.6 (2026-08-23)

### Patch Changes

- 7b1210d: Discard mandatory conditional secondary replacements before drawing another card.

## 0.21.5 (2026-08-23)

### Patch Changes

- 36bfeb6: Show only completed battle rounds in the scoreboard progress rail.

## 0.21.4 (2026-08-23)

### Patch Changes

- 8817242: Show primary and secondary scoring guidance from the applicable battle round.

## 0.21.3 (2026-08-23)

### Patch Changes

- 693a912: Undo every tactical secondary from the same hand refill together.

## 0.21.2 (2026-08-23)

### Patch Changes

- 91ca61f: Discard unresolved tactical secondaries at the end of each turn so the next turn draws a fresh hand.

## 0.21.1 (2026-08-23)

### Patch Changes

- 63e5874: Show fielded roster snapshots in the standard read-only roster view, with applied unit details.

## 0.21.0 (2026-08-23)

### Minor Changes

- 511175d: Favourite detachments to place them first when setting up a roster.

## 0.20.1 (2026-08-23)

### Patch Changes

- 7338333: Show faction colors across the full top edge of faction reference headers.

## 0.20.0 (2026-08-23)

### Minor Changes

- e7aa048: Find shared faction datasheets and detachments under their canonical reference page, with typo-tolerant datasheet search.

## 0.19.6 (2026-08-23)

### Patch Changes

- a770797: Undo every score recorded by one scoring confirmation as a single action.

## 0.19.5 (2026-08-23)

### Patch Changes

- 892237e: Show shared scoring prompts to every seated player and clearly name the affected side.

## 0.19.4 (2026-08-22)

### Patch Changes

- 3790dcc: Set the interface font size to 18px for a more readable layout.

## 0.19.3 (2026-08-22)

### Patch Changes

- be7e549: Offer the end-of-turn tactical secondary discard for one command point.

## 0.19.2 (2026-08-22)

### Patch Changes

- 67ad859: Show battle roster snapshots in the full read-only roster view.

## 0.19.1 (2026-08-22)

### Patch Changes

- c6a1825: Restore the default interface font size for a more compact layout.
- 8082b0d: Show synced descriptions for core stratagems in battles.
- 52f4e62: Cap additional command point gains at one per side each battle round.
- c069e57: Confirm before undoing randomly drawn secondary missions.
- f7526a0: Describe round-one secondary redraws without referring to impossible earlier rounds.

## 0.19.0 (2026-08-22)

### Minor Changes

- 66f3508: Separate deployment order from the post-deployment first-turn roll-off.

## 0.18.8 (2026-08-22)

### Patch Changes

- 17854eb: Correct the attacker deployment guidance in battle setup.

## 0.18.7 (2026-08-22)

### Patch Changes

- 7731ec6: Keep fielded battle rosters unchanged when saved rosters are edited or deleted.

## 0.18.6 (2026-08-22)

### Patch Changes

- 1437a38: Show the correct global search shortcut for each platform.
- 2d908a6: Show connected objective terrain as one objective.
- 4e94b67: Enlarge the battle terrain viewer for accurate measurements.

## 0.18.5 (2026-08-22)

### Patch Changes

- 0b8e04a: Make battles, rosters, catalogue references, navigation, and core account pages safer and clearer.

## 0.18.3 (2026-08-22)

### Patch Changes

- 3694c7a: Open datasheets reliably in large rosters.

## 0.18.0 (2026-08-22)

### Minor Changes

- 8c4cdd3: Sort saved rosters by creation time, name, update time, or battle size without changing their default order when opened or edited.
- 8c4cdd3: Inspect roster units in one configurable three-column workspace.

### Patch Changes

- 8c4cdd3: Give Praetorium a new logo and charcoal field-document color scheme across the app and browser.
- 8c4cdd3: Show the actual account error when sign-in or sign-up fails.
- 8c4cdd3: Hide zero-count weapons from read-only roster model cards.

## 0.17.1 (2026-08-21)

### Patch Changes

- 3ecf75b: Open battles and the battles list faster.
- 3ecf75b: Keep suggesting players to connect with when you have many friends, instead of running out.
- 3ecf75b: Show every roster's points as the library loads.

## 0.16.8 (2026-08-21)

### Patch Changes

- 70ba273: Keep the faction list working.
- 06b4f4b: Draw every hover explanation the same way: topic, text, then source. A rule long enough to fill the screen stays inside it instead of running off the bottom, and a tooltip open while a panel scrolls follows its word.
- 06b4f4b: Open a unit from anywhere on its card. The rows under a unit's name — its enhancement, unit upgrade, and which unit it leads or supports — did nothing when clicked, so reaching for an Overlord by its relic meant aiming at the name. Every row opens the unit, and buttons that do something else still do only that.
- 06b4f4b: Explain a weapon keyword something in the list added. Skyshroud Spearhead's Deepening Madness gives a unit's ranged attacks `[ASSAULT]`, which showed on the weapon as the only plain-text keyword, because the catalogue links only the rules a profile was printed with. It now hovers like every other and says which upgrade or enhancement added it.
- 06b4f4b: Add up the relics a single unit carries. A Leader and a supporting character joined to the same bodyguard are one unit, so a Destroyer Ankh adding 2" to the Move of models in the bearer's unit also moves the Chronomancer in it, and its own Murdermind adds 3" on top. Each character saw only the unit it joined, not the character beside it, so the Chronomancer showed 8" where the rest of its unit showed 7" and the two enhancements never stacked.

## 0.16.7 (2026-08-21)

### Patch Changes

- fae016d: Ask a squad that must match one question instead of ten. Immortals take gauss blasters or tesla carbines, Lychguard warscythes or sword and shield, and neither may mix — but the editor offered a count per option and only said "all models must be equipped identically" after one was used. Where the data forbids mixing, the option is picked once and every model follows, including models a resize adds. A list imported from another builder keeps what it said: a stated split is kept and reported, not quietly reissued. Aggressor Squads, Vanguard Veterans with Jump Packs and Cthonian Beserks work the same way.
- fae016d: Set the rules text in the unit editor at the size of the labels around it. What a resurrection orb does, what each enhancement gives and what a dispersion shield is for were printed larger than the option they explain.
- fae016d: Ask what a unit fights with before what else it carries. An Overlord's blade and tachyon arrow sat below his resurrection orb question, matching neither the datasheet's order nor the order the choice is made in.

## 0.16.6 (2026-08-21)

### Patch Changes

- b97636e: Show a detachment all six of its stratagems. A card two detachments share is written once, under whichever the source filed it, and the others name it only by id. Reading the filing alone left Armoured Speartip without Armour of Contempt or Rapid Embarkation, and 184 other detachments similarly short, on the reference page and in the live tracker.
- b97636e: Let a tank take the weapons mounted beside its fixed ones. A hunter-killer missile, multi-melta and storm bolter sit in the same capless group as a Land Raider's permanent guns, and nothing there competes for room, so it may carry all three. Reading the group as one shared slot offered none of them, and did the same to the Rhino's havoc launcher, the Gladiator's Icarus rocket pod and the ironhail heavy stubber.
- b97636e: Put a cross in every box that narrows a list. A query matching nothing looks like an empty shelf, and getting the whole list back meant selecting and deleting the text. The picker, the faction and datasheet finders and the player search all clear on the cross or Escape.
- b97636e: Keep the roster on screen while a deleted unit is removed. The list comes from the priced answer, a round trip behind the picks, so dropping one unit emptied the whole list until the server replied. The rest now stays put, as it already did when adding a unit.
- b97636e: Offer every datasheet in the book, not the first sixty. The picker sorted by name and stopped after pricing sixty, so a Space Marine list ran out somewhere after Inner Circle Companions and Sternguard Veterans could only be found by searching.
- b97636e: Give the Space Marines detachments their points, stratagems and enhancements back. The rules source files that book under Adeptus Astartes while the catalogues call it Space Marines, so all sixteen of its detachments came back empty. Each faction now answers to every name its data gives it.
- b97636e: Offer the upgrades a datasheet asks about one at a time. A lone yes-or-no is written without a group, and the builder only looked for groups: a Chaos unit's daemonic icon and instrument, an Infiltrator Squad's comms array, helix gauntlet and grapnel launchers, a Reiver's grav-chute, the demolition charge on Imperial Navy Breachers and 268 more could not be taken at all.
- b97636e: Offer the crown only to what may wear it. Nominating a Land Raider or Repulsor as Warlord needs a detachment that makes vehicles characters, and a daemon borrowed into a Chaos Space Marine army may not lead it at all, yet all were offered. Take Headhunter Task Force and its Tank Ace Character upgrade and the tank can be nominated, as the rule intends.

## 0.16.5 (2026-08-20)

### Patch Changes

- f08efae: Keep a squad the same size when it is handed a weapon. A Plague Marine's meltagun, a Chaos Biker's flamer and a Tempestus Scion's hot-shot volley gun are each taken _instead of_ what that model carried, but taking one added a model and charged for it — a five-marine squad became six, sixty points dearer. A model brought into the group that sets a squad's size now costs a squadmate their place, and putting its weapon down gives the place back. A drone, a plasmacyte or a pack of hunting wolves is filed beside the squad, not in it, and still adds to the unit, because that is what taking one means. Specialists the catalogue files apart from their squad can now be armed: the panel drew them on their own card with nobody to take a body from, leaving the control dead.

## 0.16.4 (2026-08-20)

### Patch Changes

- c008a07: Let a squad take the weapons its datasheet files in a group of their own. A group holds nothing until something is put in it, so a squad's heavy weapon is absent until asked for — and that request could never land, because every walk to a group steps through what is already there. Hearthkyn Warriors could not take a magna-rail rifle, Tempestus Scions could not take a flamer, and 240 choices across the catalogue did nothing when pressed. The model a request brings in is one of the squad, not an extra body: where its group is already full, a squadmate puts down their weapon to carry it, as when arming a specialist.

## 0.16.3 (2026-08-20)

### Patch Changes

- 898ef20: Fix a whole-unit enhancement from the catalogue's shared enhancement library, such as the Gauntlet of Compression's extra range, showing on neither the bearer's weapons nor the unit it joins.

## 0.16.2 (2026-08-20)

### Patch Changes

- 2186f26: Ask for a squad's weapons once. Where the community catalogue files a model kind as one entry per weapon — Necron Warriors as a warrior with a gauss flayer beside one with a gauss reaper — the loadout panel drew a card for each and then asked for the same weapon again as a wargear option. Those entries are now gathered into one model with a count against every weapon it may carry, wherever the catalogue filed them. Where a loadout pairs two weapons the player cannot separate, as Canoptek Wraiths do, each pairing keeps its catalogue card and is counted there, not in a second list below.

## 0.16.1 (2026-08-20)

### Patch Changes

- 32a3867: Fix the unit loadout panel flashing blank while wargear or enhancement choices reprice.

## 0.16.0 (2026-08-20)

### Minor Changes

- 9d37c68: Right-click a unit card in the list builder to duplicate it, toggle collection ownership, or delete it.

## 0.15.1 (2026-08-20)

### Patch Changes

- 9cffb21: Keep the list builder working when a unit choice arrives without its options, so points and legality still calculate.

## 0.15.0 (2026-08-20)

### Minor Changes

- 41868d2: Show a unit's wargear a model at a time, each model kind named as its datasheet names it with every weapon it may carry beneath — a count against each, so ten veterans can split a pair of special weapons. Datasheets the community catalogue gives no model kinds now read from the rules source, letting a Deathwatch kill team show all its weapons and offer its datasheet's free swaps. The roster card counts the same models the panel draws, so a free swap shows there too instead of naming a weapon traded away. Interchangeable items are listed together: a swap sits beside the weapon it replaces, and one group's options stay side by side. Also keeps a squad honest as it is armed: a specialist's body comes from a squadmate, not the model the datasheet insists on, returns when that specialist puts its weapon down, and no longer comes out of the weapons just asked for — a squad wanting five combi-weapons and a pyrecannon used to come back with three — and a choice the data has closed behind another is let go rather than reported as a broken rule.
- 682ac7a: Carry an enhancement that speaks of the bearer's unit to the unit a character leads, so a Destroyer Ankh moves the models it joined, not only its bearer. Show what every weapon a unit could take does in this list, not on a bare datasheet, so a choice between two guns accounts for each enhancement. And say plainly when a second character is given an already-led unit: one leads, and others may still attach alongside.

### Patch Changes

- 57a6e3b: Keep an enhancement's effect on its bearer, and show it where the unit's weapons are listed. A Destroyer Ankh adds to the Attacks of its bearer's melee weapons instead of leaving the bare datasheet values, and no longer changes the weapons of a second character without an ankh.
- 97df53d: Say when the same enhancement is given to two characters. The catalogue always limited a relic to one per army; a unit built by the catalogue is excused its own composition, and that excuse also covered the player's choices inside it. A limit is now reported once, not once per breaking selection.
- 4f96173: Apply enhancements and datasheet rules written against a scope the catalogue reads and this app did not: a Master Artisan adds to its bearer's Wounds as well as the Toughness of the unit around it, and a Kroot Trail Shaper moves the Kroot it leads. Four such scopes went unresolved, so around a hundred and fifty stat changes across every book quietly did nothing.

## 0.14.1 (2026-08-20)

### Patch Changes

- 715f5c9: Fix a secondary returned to the deck showing in your hand as discarded, by tracking it as returned and no longer listing it.

## 0.14.0 (2026-08-20)

### Minor Changes

- 4c0cd8e: Refuse a primary or secondary score past the mission's round or game cap, explaining why in the scoring dialog.

## 0.13.3 (2026-08-20)

### Patch Changes

- beaffe5: Fix a roster whose detachments disagree on Force Disposition (as an imported list can) silently blocking battle setup, by asking the player to pick one on the roster.

## 0.13.1 (2026-08-20)

### Patch Changes

- 63d0fd7: Improve battle player details and keep tactical mission draws usable while inspecting cards or undoing actions.

## 0.13.0 (2026-08-19)

### Minor Changes

- 5db06cb: Let every seated player record battle actions for either side.

## 0.12.1 (2026-08-19)

### Patch Changes

- be41610: Show selected loadouts when viewing another player's roster.

## 0.12.0 (2026-08-19)

### Minor Changes

- fe1301e: Split unit lists into collapsible datasheet categories.

## 0.11.1 (2026-08-19)

### Patch Changes

- e621751: Stop the global search shortcut throwing on Android soft keyboards that send key events without a key.

## 0.11.0 (2026-08-19)

### Minor Changes

- 0795eb7: Show user profile pictures and links in the battle tracker.

## 0.10.0 (2026-08-19)

### Minor Changes

- 0c66b6a: Show faction icons and faction and detachment links on battle scoreboards.

## 0.9.0 (2026-08-19)

### Minor Changes

- 3ff636b: Use one roster page for editing and sharing, editable only by its owner.

### Patch Changes

- d61574d: Preserve compound weapon loadouts when importing text rosters.

## 0.8.1 (2026-08-19)

### Patch Changes

- bcbbf31: Add battle actions to the battle library's context and overflow menus.
- bcbbf31: Assign primary missions to the correct side and allow either player to rewind battle actions across turns.

## 0.8.0 (2026-08-19)

### Minor Changes

- 9bdf3c9: Edit your display name and profile picture from the account menu.
- 171f874: Import pasted New Recruit roster exports.

### Patch Changes

- 9bdf3c9: Use a compact navigation menu below 815 pixels.

## 0.7.0 (2026-08-19)

### Minor Changes

- 6cdff42: Phrase each mission payout in the words the pack prints on the card, so a row says what to check rather than restating its points. The card's full text sits behind its name. The prompt dealing your secondary missions can no longer be dismissed by clicking away.
- 2b29aad: Rebuild battle setup and the live tracker around sides, so a 2v1 shows one score, one command point pool and one hand of cards for the allied pair. Deal tactical missions at random when a turn opens, and ask each card its own question when it pays out: what it wants, what meeting it pays, and a way to say it scored nothing. A card paying at the end of the opponent's turn is settled as the turn returns, before the next hand is dealt, and the battles list updates when someone adds you to one. Missions in play stay at the top of the hand until scored or put back. Battles, shared lists and profiles live at `/battles/…`, `/rosters/…` and `/players/…`; the old one-letter paths no longer resolve.

### Patch Changes

- 6cdff42: Import BattleBase rosters with named game formats, combined detachments, enhancements and repeated wargear choices.

## 0.6.0 (2026-08-19)

### Minor Changes

- 46f8e96: Add friend-only 2v1 battles with separate allied armies, shared team resources, and collaborative setup.
- 488d597: Search pages, game references, rosters, and battles from anywhere.

### Patch Changes

- 6750113: Make roster editing sidebars easier to navigate on mobile and expose unit datasheets.
- 53ae105: Show each unit's attachment targets only once on its datasheet.
- a5239de: Show each faction's full army rule on its faction page.

## 0.5.2 (2026-08-18)

### Patch Changes

- f6ed4d0: Improve datasheet readability and show accurate composition, profile, and attachment options.

## 0.5.1 (2026-08-18)

### Patch Changes

- 8f3e7ab: Remove enhancements cleanly, show each selected enhancement once, and keep the roster visible while adding units.
- 4899109: Show complete datasheets with correctly classified abilities, unit composition, loadout, and wargear options.

## 0.5.0 (2026-08-18)

### Minor Changes

- 5de00a8: Show each faction with its own icon and colour, and sync faction favourites across devices.

## 0.4.6 (2026-08-18)

### Patch Changes

- 99f4eda: Improve wargear defaults and per-model choices, enforce faction restrictions, clarify invulnerable saves, and speed up catalogue-backed pages.

## 0.4.5 (2026-08-18)

### Patch Changes

- 4ef4500: Add forced detachment enhancements to required units and preserve complete, readable datasheet rules.

## 0.4.4 (2026-08-18)

### Patch Changes

- 428cb87: Validate shared upgrades and conditional catalogue pricing without showing unsupported rule warnings.

## 0.4.3 (2026-08-18)

### Patch Changes

- 5d2713b: Show unit upgrades separately from character enhancements.

## 0.4.2 (2026-08-18)

### Patch Changes

- 57a040d: Show available enhancement rules and preserve mandatory wargear when changing a unit's loadout.

## 0.4.1 (2026-08-17)

### Patch Changes

- 64a7e58: Keep roster controls stable, simplify roster setup, collapse enhancements by default, and explain profiles and abilities beside their loadout choices.

## 0.4.0 (2026-08-17)

### Minor Changes

- 1ff10c7: Build and play King of the Colosseum battles with its prototype army restrictions.
- a666bb2: Group allied units by faction at the bottom of the unit picker and let players hide them.

### Patch Changes

- bc07d07: Export rosters as Games Workshop text from the actions menu.
- 3f9747a: Keep modal controls reachable on shorter screens.
- 7830c22: Offer legal model replacements in mixed-composition squads.

## 0.3.1 (2026-08-17)

### Patch Changes

- b324bc9: Show the correct weapon quantities in roster datasheets.
- 801703b: Show owned datasheets first in the roster picker and remove the redundant view icon.

## 0.3.0 (2026-08-14)

### Minor Changes

- f8e8fc5: Manage guided battle setup with exact battlefield plans, clocks, tactical missions, corrections, results, and richer private rosters.
- a471aaf: Import BattleBase rosters, browse mission references, and inspect detachment rules while editing a roster.
- ce03dde: Set a battle up one step at a time, then track it on a board showing the round, phase and running log beside each army's missions and stratagems.
