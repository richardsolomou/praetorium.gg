# praetorium

## 0.195.11

### Patch Changes

- c3fd878: Battles no longer offer a secret mission, which no supported mission pack has; one chosen in an earlier battle can still be revealed.

## 0.195.10

### Patch Changes

- d63b6f6: Sealing a list or starting a battle in a club's sealed game no longer freezes the page for a second the first time.
- d63b6f6: The seal button shows that it is sealing as soon as you press it.

## 0.195.9

### Patch Changes

- a3a38d0: A faction's datasheet list responds faster to filter taps and opening a datasheet, especially on phones.

## 0.195.8

### Patch Changes

- 5e70390: Editing a list, such as typing a unit's name, responds faster, most of all in large armies.
- 5e70390: The first action in a battle or tournament no longer freezes the page for up to a couple of seconds while the army rules are prepared.

## 0.195.7

### Patch Changes

- eacfe2c: Battle taps show their result straight away instead of waiting for the server to answer.

## 0.195.6

### Patch Changes

- 323f386: Battle actions show their result sooner, since the battle is no longer downloaded a second time while each action is being sent.
- 323f386: The first action in a battle after opening it responds straight away, instead of freezing the screen for up to a few seconds on devices with the army rules saved offline.
- 323f386: Switching back to the app no longer re-downloads every saved battle, league and list each time, which slowed the next action in a battle.

## 0.195.5

### Patch Changes

- 28ff003: Burden of Trust no longer offers a unit that already guards another objective.
- 28ff003: Each objective in the Burden of Trust and Consecrate choices has a button to clear its unit.
- 68731ca: When the scoring prompt is taller than the screen, its button now steps you through each card before it lets you pass the turn.
- 0df9e2a: Switching tabs after an update no longer loses your place: the tab reopens where you left it and Back still works.

## 0.195.4

### Patch Changes

- d3e2e12: Tournament and club battles use the ability alerts you have when the battle starts, so changing an alert no longer means resealing your list.

## 0.195.3

### Patch Changes

- 76d1eb7: Battle errors now appear as a message at the top of the screen instead of under the battle events.
- 76d1eb7: Record a missed action only opens the phases the chosen stratagem can be used in, and lets you change what it cost.
- 76d1eb7: A stratagem's other prices are greyed out when it can't be used in this phase, and its menu can record it as a missed action instead.

## 0.195.2

### Patch Changes

- 1a74955: Passing the turn or ending a phase works again after undoing it, instead of the phase waiting to advance with no way forward.

## 0.195.1

### Patch Changes

- d187d11: Broadside Battlesuits can be resized from 1 to 3 models in rosters and the combat simulator.
- d187d11: Crisis Starscythe Battlesuits and other units whose models each carry two weapons from one list keep every weapon when you split them, instead of dropping some and showing the unit as illegal.
- d187d11: The optimizer's note now says plainly when it didn't check every loadout, instead of saying the unit has too many to compare.

## 0.195.0

### Minor Changes

- 0398318: Swiss tournament organizers can reopen any table's finished result from the tournament page so its players can correct it, even at a table they didn't play.
- b308810: The Apple Watch keeps the score, round and turn clock updating while the watch app is open, even with your iPhone locked or after you leave the battle screen.
- b308810: The Apple Watch can follow a live battle you are watching, showing both sides by name.

### Patch Changes

- 35b06b1: Pasting or dropping a .ros, .rosz or .regiztry roster file into Import roster now says it isn't supported yet and asks for the text export.

## 0.194.3

### Patch Changes

- 8ff8fa1: An attached unit with more than one enhancement, counting upgrades, is now flagged in the list checks, as the core rules allow only one.

## 0.194.2

### Patch Changes

- 4a3aad3: Steel Hammer lists from the official app now import their Character vehicles with the Warlord and enhancement they were given, and the builder offers Warlord to a vehicle once it is made a Character.

## 0.194.1

### Patch Changes

- 49912eb: A sealed game with a battle still being set up or played stays under Up next instead of moving to past sealed games.
- 49912eb: A club's overview now lists battles from its sealed games among its recent games, so it's no longer empty for a club that only plays sealed games.

## 0.194.0

### Minor Changes

- 8f3ed45: Club pages now open on an overview, with the leaderboard, season and sealed games on their own tabs and a card showing what is waiting on you.
- 346c812: Club organizers can give each season round a deadline, and games not finished by it show as overdue.
- 346c812: Clubs can run a season where every member who joins plays every other member once, with fixtures and a table on the club page.
- a284ef8: After a tournament or club game reveals its rosters, anyone who can see them can save every revealed list in one text file.
- 6bffbc3: The app now notifies every player in a Swiss tournament when a new round is paired.
- 5a43af8: A sample tournament with made-up players shows sealed lists, the reveal, Swiss rounds with a bye and the standings, so you can see how one runs before you start your own.
- 7f8b691: Organizers can remind players who haven’t sealed their list yet, once a day.
- d5fc3a9: Swiss tournament players can now withdraw, and organizers can drop a no-show, so the next round can still be paired.
- 6d60f27: Swiss rounds now mark a table as a rematch when its two players have already met earlier in the tournament.
- 841aa73: Once the next Swiss round is paired, earlier rounds' results can no longer be reopened by players.
- 298668b: Export a tournament's or sealed game's results table as a CSV file once the rosters are revealed.

### Patch Changes

- a0599eb: AI assistants now know tournaments can run Swiss rounds.
- 8f3ed45: Past sealed games on a club page are now separate cards, so one game no longer runs into the next.
- 8f3ed45: A club's recent games show its six latest battles instead of three.
- 8f3ed45: Results tables show players' full names on a phone instead of cutting them short.
- 8f3ed45: The sample tournament opens at its first stage instead of failing when a link names a stage that does not exist.
- 8f3ed45: Battles in a Swiss tournament say which round and table they were.
- a0599eb: When a Swiss round cannot avoid every rematch, it now makes as few as it can.
- a0599eb: A tournament with too many battles to read in full no longer pairs its next Swiss round from incomplete results.
- 8f3ed45: Once your Swiss battle is done, the tournament page says so and when the next round is paired.
- 8f3ed45: A Swiss tournament page offers Resume battle while your round's battle is being played.

## 0.193.2

### Patch Changes

- 8c58d35: Players who sign up with Apple without sharing their name are now asked to choose a display name, instead of appearing nameless to other players.
- 5f577d6: Assistants now link Imperial Knights allies, such as an Armiger in an Ultramarines or Astra Militarum army, to their Imperial Knights datasheets.
- 8b044dc: Assistants can simulate combat for a chapter's Space Marines codex units, such as Ultramarines Intercessors, and link to their datasheets.
- 8b044dc: Assistants find factions however their apostrophes are typed, such as Tau Empire or Emperor's Children, and a faction search finds current rules ahead of archived ones.
- eeafc4b: Opening a roster shows its unit list and points sooner, and searching the unit list responds faster on phones.
- 3ccb0af: Feedback you are writing no longer clears itself when your earlier conversations finish loading.
- eeafc4b: A roster you open now keeps View mode when you last chose it, instead of sometimes switching back to Build.
- cd21ca4: Imported official-app lists keep the specialists a squad lists under its ordinary troopers, such as a Tempestus Command Squad's medic and vox operator or a Tempestus Aquilons squad's long-las and plasma carbine.
- eeafc4b: Datasheet pages stay responsive on phones while their rules text loads.
- af76f84: Weapon profile names that mention a rule in brackets, such as a Tempestus Scion's plasma gun, now show their closing bracket.

## 0.193.1

### Patch Changes

- 485c618: Search boxes find names typed without accents or curly apostrophes, and match search words in any order.
- 485c618: The privacy docs now say that deleting your account also deletes the clubs you own for all their members.
- 485c618: The delete account warnings now say it also deletes the clubs you own.
- 485c618: Data updates keep each new points and datasheet change instead of dropping changes published between releases.
- 485c618: The detachment search in roster setup finds names typed without accents or curly apostrophes, and matches search words in any order.
- 485c618: Docs links show the current page names instead of old addresses that no longer open.
- 485c618: The sign-in docs no longer say you need an account to play a battle, and the app's More page no longer calls battles private.
- 485c618: Exporting a roster as text from the library keeps its agreed points limit, as exporting from the builder does.
- 485c618: Opening many battles in one visit no longer stops later battles from updating live.
- 485c618: The tournament docs name the Simulate button as it appears on each player's card.
- 485c618: Mission choices in a 2v1 battle offer the objectives on the chosen battlefield instead of asking for typed names.

## 0.193.0

### Minor Changes

- f966973: 2v1 and doubles battles and tournaments set their own points per army, such as 1,750 against 800 each, and allies can bring lists built for a smaller size.

### Patch Changes

- 5091cd1: Assistants can plan a chapter army with a detachment from the Space Marines codex, and see only the units that detachment allows.
- 5091cd1: Units that only a particular detachment allows, such as Deathwatch in a chapter army, appear in the picker with that detachment and are flagged in lists without it.
- f966973: Tournaments with their own points total accept lists built to that total.
- 5424d97: Official-app text that lost its blank lines and price brackets while being pasted now imports instead of being refused as an unsupported export.
- 5424d97: Imported official-app lists read a Gun Servitor as the servitor its weapon marks, so Inquisitorial Agents are no longer priced with an extra servitor.
- 5424d97: Imported official-app Bladeguard Veteran Squads keep their Master-crafted Power Swords, which the catalogue calls power weapons.
- 5424d97: Imported official-app lists keep a sergeant's swapped weapon on the sergeant, so a Scout Squad whose sergeant carries a shotgun is no longer priced as ten models.
- 5091cd1: Points caps such as the 500 points of Deathwatch a chapter may take are now checked against what the units cost your list.
- aa3eaf2: Keep club player rows and their actions inside sealed game cards on narrow screens.

  Restore combat simulations between revealed club lists, including combined team armies.

  Open new club games from a compact page action so club activity leads the page.

  Keep roster viewing controls aligned across club player rows.

  Show player avatars when choosing an opponent for a club game.

  Move sealed club games to Past automatically when a new game starts or their game day ends, keeping existing battles resumable and revealed lists available to view and simulate.

- 5091cd1: Data updates no longer list every datasheet as new when a rules version is added.
- 5091cd1: Data updates no longer list each army's changes twice, once under the army and again under the current rules version.

## 0.192.1

### Patch Changes

- a9f61bf: Past sealed games stay open on the club page, with Delete in each game's ⋯ menu.
- a9f61bf: Sealed games show player and list names in capitals, as battle and roster cards do.
- a9f61bf: Team sealed games take less room, and you join a side from its open seat.

## 0.192.0

### Minor Changes

- 75017e2: A club's sealed game can be a duel, solo vs pair, or doubles, with players picking their own side.
- a44c340: Clubs give your club or friend group a standing leaderboard: choose the club when you set up a battle and the result counts toward its ratings.
- 059f3fd: A duel tournament can play a battle size at its own points total, such as Incursion at 750 points.
- 059f3fd: Tournaments and sealed games can set the date they're played and a roster deadline, after which entrants without a sealed roster sit the event out.
- c9918af: Clubs and tournaments open from an Events menu in the header, and from their own rows on the More screen.
- 5de7e66: A faction's datasheet list can be filtered by keyword, by Legends and Crucible, and by your favourites or collection.
- 9836cc6: Getting started guides you through building or importing an army and trying a matchup before or after signing in, with battle, friend, and tournament help on their own pages.
- a1b8ea4: Every existing league is now a club with the same people, and each of its events a sealed game in that club whose battles count on the club's leaderboard.
- c9918af: Duel tournaments can play Swiss rounds: the organizer pairs each round on the scores so far without rematches, and the results rank by match points, victory points and strength of schedule.
- a1b8ea4: Leagues are now tournaments: one sealed-roster event each, or a sealed game when a club plays one.

### Patch Changes

- 8ce50cb: Battle cards show their status as a coloured left edge instead of a score bar across the top.
- 8ce50cb: Finished battle cards fade the losing side so the winners stand out.
- 64bc2b0: A sealed duel marks an opponent you're still playing as Playing, not Played.
- 64bc2b0: Requests to join a club now show at the top of the club page, so organizers see them first.
- 64bc2b0: A club's members list marks its owner and admins, and you start a club battle from New game.
- 64bc2b0: A club's sealed games list their battles as one line each, with the score, that opens the battle.
- 64bc2b0: You can withdraw a request to join a club from the club page's request card.
- 45d9e67: Turning away a tournament request, rejecting or cancelling a friend request, cancelling an invite link, revoking an app, returning a lent roster and removing an alert now ask first.
- 5a71081: Detachment cards on a faction page now open the detachment from their edges too.
- 5a71081: Faction cards on the factions page now open the faction wherever you click them.
- 411ef9f: A faction page's Datasheets, Data updates and Public armies links sit side by side on wider screens.
- 5823f7d: A faction's overview now shows the same datasheet count as its datasheets page.
- 214ed75: A faction page shows how many public armies it has, beside its Datasheets link.
- c41370a: Imported lists keep the melee weapon chosen for a heavy weapon Chaos Terminator.
- c41370a: Imported lists keep a squad's swapped weapons when several of its loadouts share the same weapon, as Red Corsairs Raiders' meltaguns and power fists do.
- 5de7e66: Legends and Crucible datasheets are available offline.
- 99f1e33: An edit made just before leaving a roster is no longer lost.

## 0.191.1

### Patch Changes

- 25060a5: A faction's datasheets page now counts the datasheets it lists, including Legends and Crucible.

## 0.191.0

### Minor Changes

- 35b604c: League organizers can now choose what an event allows beyond matched play, such as Legends, Crucible or lists without a Warlord, and lists that need anything else are refused when sealed.
- 3535786: The unit picker can now show Legends and Crucible datasheets, so you can add them to a list.
- d047ef3: Legends and Crucible datasheets now have their own reference pages, listed on each faction's datasheets page and in search, with their profiles, base sizes, abilities, wargear and points.

### Patch Changes

- 9344eea: Battle setup is more compact: each army's Warlord and battle ready choices sit in one row under it, and each side's Force Disposition shows as a row under its mission, where allies pick theirs.
- 6797631: The embark menu no longer lets a transport's capacity overlap its name.
- 6797631: A transport's card names every unit in an embarked attached unit, such as its Leader, without a model count that pushed Disembark onto its own line.
- 6797631: An embarked unit is no longer offered other transports while it's aboard one; remove it first to move it.
- ac41212: A faction's detachments sit side by side on wider screens.
- ee442e7: The factions page lists factions in columns side by side on wider screens.
- 54ed7d1: The force dispositions page lists each disposition's primary mission against every opponent.
- 45dc515: The friends page leads with your friends, shows how many games you've played each one and when, and starts a battle with one in a click.
- cae3779: The signed-in home page shows two games per section, with links to the rest of your, your friends' and public games.
- d732546: The docs now explain how to run a league, play in one, and fix a refused seal.
- d047ef3: Legends units now cost what the Munitorum Field Manual says, where it prices them, instead of the community catalogue's points.
- 3535786: A Legends unit's datasheet no longer offers a full-datasheet link that led to a missing page.
- f743583: Datasheets now show keywords that only some models have, such as CHARACTER and OFFICER on a Command Squad's commander, separately from the keywords every model has.
- 9344eea: During a battle, each side's primary mission shows the Force Disposition it's playing.
- 6797631: When an edit leaves a unit too big for its transport, a brief message says so instead of a note staying on the unit's card.
- 817dbd1: A transport's datasheet in the roster builder now shows how many models it can carry.
- 8af1871: Roster menus drop Convert rules version: change the rules version in Edit roster setup, which now also offers Keep the original.
- 7db257d: Roster action menus match the unit card's style and group their actions, with Delete set apart at the bottom.
- 985c605: Images and links in the team's support replies show as images and links, and the conversation list no longer shows their markdown.
- 6797631: A unit's action menu now groups its actions, with Delete unit set apart at the bottom.

## 0.190.0

### Minor Changes

- d2cf1b1: An ability alert now belongs to you rather than one roster: set it once and every unit with that ability, in any of your rosters, alerts in battle.
- f27470e: Keep a unit's custom name in its saved loadout.
- 6156b2f: Save a unit and the characters attached to it as one attached unit, and add it to another roster already attached.
- 57f0a01: Allies in a 2v1 or 2v2 battle or league each keep their list's Warlord and choose whose leads their side.
- d37e254: Your Warlord now has a crown beside its name in the roster list.
- fa1701c: A list with a unit that can be Warlord is flagged unless it names exactly one, as the core rules require; untick Warlord under Format restrictions to play without one.

### Patch Changes

- 7e3291d: The attach menu offers only pairings the roster then accepts.
- 5757cb4: A battle action that fails because the connection dropped now asks you to check your connection, instead of showing a raw browser error.
- fba81aa: The unit picker finds units by keywords your detachment gives them, such as Ogryns, Bullgryns and Ratlings by Abhuman in Abhuman Auxiliaries.
- b86c07e: Embarked units and boarding choices show custom unit names so you can tell similar squads apart.
- b383ca2: Importing an official-app list no longer reports a Space Marine character's Chainsword as unplaced.
- b383ca2: Importing an official-app list now gives a Death Korps medi-pack or Simulacrum Imperialis to the model that carries it, instead of reporting it as unplaced.
- b383ca2: Importing an official-app list no longer reports Death Riders' Savage claws as unplaced.
- 2bb6216: Ratlings, Tzaangors and the Ironclad Dreadnought can take every optional piece of wargear their datasheet allows together, instead of only one.
- fba81aa: In King of the Colosseum, the unit picker allows two of a unit your detachment makes Battleline, such as Gretchin in Runt Swarm.
- 0a67118: You can build rosters and compare loadouts on older browsers.
- 9d03c28: Each Bullgryn, Troupe Player, and Corsair Cloud Dancer can now take its own wargear instead of the whole squad sharing one choice.
- fba81aa: The unit picker lists units under the section your detachment moves them to, such as Gretchin under Battleline in Runt Swarm.
- d37e254: Adding a unit that must be your Warlord now takes the role from your current Warlord instead of leaving you with two.
- 9c76bd1: Changing the size of a squad whose models carry different wargear now keeps your picks, giving added models their standard wargear and removing standard-equipped models first.
- 55fbffb: You can retry drawing secondary missions after a failed battle action.
- 7e3291d: Removing a character from a simulated unit keeps a Loyal Protector with the Command Squad it joined.

## 0.189.0

### Minor Changes

- a56ca27: Attached units sit on their bodyguard's shelf, with the bodyguard first and its leaders and support indented under it, instead of together on an Attached units shelf. Each shelf's heading shows what its units cost.

### Patch Changes

- b90a70b: Rosters, battles, battle actions and visibility changes made through an AI assistant are now counted the same way as those made on the site.
- fa4c778: Imports read official-app points grouped with an apostrophe, as Swiss German exports write them.
- 8a55c07: Screen readers name each attached unit's outline after the unit the others joined, instead of calling every one "Attached unit".
- 5033dad: Failed sign-ins and sign-ups record why they failed, such as a wrong password, rate limiting, or a dropped connection, so those problems can be told apart.
- 3ff8c88: Battles that finish by playing out their final round are now counted as finished, not only those ended early.
- a821bd2: Battle analytics identify each battle by its internal id, so a battle's start and finish can be matched up.
- 99d4f05: Datasheet pages offer Add to roster as its own button, beside the Add to menu for favourites and the collection.
- b1a3e56: An earlier address of a datasheet page, with or without the id suffix a same-named datasheet adds, now redirects to its current page instead of showing not found.
- e767992: A datasheet page keeps its address when its book also lists another faction's copy of a datasheet with the same name, such as Deathwatch's Watch Master beside the Agents of the Imperium one.
- 703b537: Keep a battle army's Destroyed shelf open while you bring units back and lose them again, instead of closing it each time it empties.
- a56ca27: A leader or support unit's menu offers Detach from unit.
- 13968b5: The Discord links point to the new invite.
- fb794e1: Holding a More or Fewer count button keeps stepping until you let go or reach the limit.
- d834ba9: A league page now says what happens next at each stage, from sharing the invite link to revealing rosters and starting the next event, for the organizer and for players in it.
- 14b34a9: The assistant help page explains "This app is no longer registered", and the connection pages all point back to your assistant.
- 02d3875: When an AI app's connection request has expired or the app is no longer registered, the consent page says so and asks you to start again from the app, and other loading failures show the usual error page instead of claiming the request expired.
- bdd2c65: Pasting a New Recruit share link explains that the list's exported text is needed instead.
- 0e7e914: Count visits to missing pages, including links opened straight to one, grouped by the kind of address.
- 7819354: Keep pages responsive while the offline reference downloads in the background: the download is now unpacked and saved off the main thread, so taps and typing no longer wait up to a second behind it.
- 44c1622: Simulator survivor, weapon and wound counts, and counted mission scores, can be picked directly from the number between their buttons.
- b861bb0: The browser console no longer logs a message on every live-update connection.
- 1928ca4: Going back while choosing a roster for a battle closes the roster list instead of leaving the battle.
- 30be48d: The `simulate_combat` assistant tool now answers matchups it cannot estimate with a normal result that names each refused phase and why, keeping errors for unknown units, illegal sizes or attachments, and unavailable data.
- 41c92fb: A tab left open across an update now loads the new version when you move to another page or when a page fails, instead of showing an error that Try again could not clear.
- eb29a60: Signed-out tabs keep one live-update connection instead of reconnecting with a new identity every four minutes.
- 80c4c21: Comparing a variant with its base no longer counts a unit as changed just because units before its transport moved, and does count a unit that now starts in a different transport.
- ac969bf: Pages and the army builder stay fast right after an update, instead of loading slowly for the first few minutes.

## 0.188.3

### Patch Changes

- 855bafa: Long unit names, such as Militarum Tempestus Command Squad, now wrap in the unit editor on small phones instead of running off the screen.

## 0.188.2

### Patch Changes

- 43ad719: The email telling you we replied now looks like Praetorium, with a button that opens the conversation.
- de203c6: The email telling you we replied now says who replied and which of your messages it is about, and that replying to the email itself does not reach us.

## 0.188.1

### Patch Changes

- f4a096e: Twelve Chapter Approved terrain layouts now join the footprints the publisher's diagrams mark as one terrain area, including Purge the Foe / Reconnaissance Layout B.
- 07bd36b: The eye marking two footprints joined into one terrain area no longer hides under the objective marker on central objective terrain.

## 0.188.0

### Minor Changes

- a536821: When we reply to your feedback, we email you a link to the conversation, once per run of replies.

### Patch Changes

- e60e18f: A link to one of your feedback conversations opens it over the Support page.
- c761fc3: A reply you send no longer shows twice for a moment while it is delivered.
- e60e18f: The account button now marks a reply to your feedback when you are signed in, rather than only after you opened the conversation.

## 0.187.0

### Minor Changes

- 5d266fb: Photos of the other builds your models can also be, such as a magnetised Leman Russ set up as a Demolisher, are filed under that build and show on its datasheet, while staying with the one collection entry.
- 51e0ba6: Mark what else your collection's models can be, such as every build of a magnetised Leman Russ, and a roster's Your collection section counts each model once wherever it goes.
- 6ea1cc4: Terrain layouts mark footprints that join into one terrain area with an eye, as the publisher's diagrams do, and explain it in the legend.

## 0.186.0

### Minor Changes

- 6bd9051: Feedback now opens a support panel over the page you are on, where our replies appear and you can answer them. Open it again from the account menu, the More tab or the Support page. Signed in, your conversations follow you to every device.

## 0.185.0

### Minor Changes

- 34b6bf9: Embark units in transports from the roster cards; each transport lists who starts inside it, and battle setup starts them there, which you can still change. An attached unit embarks, and takes another Leader or Support unit, from the foot of its outline. A change that stops a unit fitting takes that unit out, and its card or outline says why.

## 0.184.5

### Patch Changes

- a87cc47: Nork Deddog, Ogryn Bodyguard and Regimental Attachés can embark in any transport their Command Squad can, with a Loyal Protector taking up the space of 3 models.

## 0.184.4

### Patch Changes

- 6d3e8b8: The agent combat tool and simulator links can field a unit that joins an attached unit, such as Nork Deddog with the Cadian Command Squad leading Cadian Shock Troops.

## 0.184.3

### Patch Changes

- f6fc73c: An Inquisitor leading a unit can embark in any transport its bodyguard can, as Authority of the Inquisition allows.

## 0.184.2

### Patch Changes

- 2617042: An invulnerable save no longer shows as a granted ability.
- 2617042: Abilities a datasheet links from its army's shared list now apply, such as Psychic Hood, Fulgrim's Daemonic Speed and the Norn Emissary's Unnatural Resistance.
- 2617042: Nork Deddog and Ogryn Bodyguard give Feel No Pain 4+ to the Officer in their Command Squad while they stand.

## 0.184.1

### Patch Changes

- 1ece916: Discord announcements show what's changed once an update is live.
- 1ece916: The Discord invite opens the welcome channel when you join the community.

## 0.184.0

### Minor Changes

- 68c83e8: Shelve attached units together in the roster builder, each outlined with its total points and the bodyguard's custom name. Untick Group attached units in the roster menu to keep role shelves.

### Patch Changes

- 68c83e8: Group the roster menu's actions under Play, Setup, Copies and access, Share and Display headings.

## 0.183.3

### Patch Changes

- 19a5750: Leaders whose attachment data names unit types no longer offer single-model characters as bodyguards, such as a Runtherd leading Grotmas Gitz.

## 0.183.2

### Patch Changes

- 58df806: Nork Deddog and Ogryn Bodyguard count as part of the unit their Command Squad leads, so the simulator and reserves see one unit.

## 0.183.1

### Patch Changes

- a0579d7: The combat simulator accepts an Inquisitor leading Tempestus Scions in Bridgehead Strike.

## 0.183.0

### Minor Changes

- 68a78e5: Terrain layouts outline the pieces of one terrain area together, so they are no longer confused with separate pieces that touch.

## 0.182.4

### Patch Changes

- 4db3c94: A unit now has every keyword of its models, so datasheets such as Chaplain Grimaldus, Marneus Calgar and Canis Rex show Character, Vehicle and other model keywords, and keyword rules and attachments respect them.

## 0.182.3

### Patch Changes

- 8bdecc7: Let a Skitarii Rangers or Vanguard specialist take the place of a galvanic-rifle or radium-carbine squadmate, so the squad stays at ten models, each specialist can be added or removed on its own, and lists with a transuranic arquebus or omnispex import.

## 0.182.2

### Patch Changes

- 091533e: A Militarum Tempestus Command Squad can take its regimental standard and master vox again.
- 091533e: Weapon buttons for a group a specialist has shrunk change the weapon pressed instead of another one.
- 091533e: A specialist taking a squadmate's place, such as a Tempestus Scion with a medi-pack or regimental standard, takes that squadmate's weapon with it, so a Militarum Tempestus Command Squad with a plasma gun and meltagun stays legal.

## 0.182.1

### Patch Changes

- 86f7e86: Crucible Champion of the Chapter and Librarius Adept no longer offer Character units as bodyguards.

## 0.182.0

### Minor Changes

- 218332d: Give units in a roster an optional custom name, shown above the datasheet name to everyone who can read the roster.

## 0.181.3

### Patch Changes

- 81fd67d: Datasheet pages list the Command Squads an Ogryn Bodyguard or Nork Deddog can join, and other attachments that only the catalogue's unit links record.

## 0.181.2

### Patch Changes

- 4999dc2: Inquisitors can lead units that a detachment makes Imperium Battleline Infantry, such as Tempestus Scions under Bridgehead Strike.
- 4999dc2: Bridgehead Strike makes Tempestus Scions Battleline when a Militarum Tempestus Officer is the Warlord.
- 4999dc2: Detachments that double a unit limit, such as Bridgehead Strike for Tempestus Scions, double it in the builder.

## 0.181.1

### Patch Changes

- 39298a4: Ogryn Bodyguard and Nork Deddog can join a Command Squad.

## 0.181.0

### Minor Changes

- ca5f8b3: Profiles show results against each opponent.
- ca5f8b3: Profiles show each stratagem's win rate and name the best and worst stratagems used in three or more battles.
- ca5f8b3: Anyone can see a player's performance over time on their profile.
- ca5f8b3: Profile stratagem and secondary mission tables show the top ten, with Show all for the rest.

### Patch Changes

- ca5f8b3: A stratagem or secondary mission no longer appears twice on a profile after a data update renamed it.

## 0.180.0

### Minor Changes

- 7c6579e: Every battle is public: the Battle privacy setting is gone, and anyone can find and watch a battle.
- 7c6579e: Every collection is public: the Show collection on profile setting is gone.
- 7c6579e: The Text size setting is gone; use your browser or device zoom to read larger.

### Patch Changes

- 7c6579e: Account settings show sign-in methods and two-factor authentication in one panel, and connected assistants such as Claude, ChatGPT, Codex and Gemini with their logos.

## 0.179.5

### Patch Changes

- 00d30e8: The Praetorium plugin adds skills for building a roster, comparing two units and tracking a battle, so assistants follow Praetorium's steps for each.
- 1bd7432: Connected apps on your profile links to the steps for connecting Claude, ChatGPT or Gemini.
- 3e477d5: Importing a list keeps a pistol or melee swap that sits inside a chosen loadout, such as two Death Korps Watchmasters with plasma pistols and power weapons.
- 3e477d5: Importing a list gives a Krieg Command Squad veteran its stated power weapon when the Lord Commissar swaps his default power weapon for a power fist, and warns when a stated weapon is dropped even if a wargear group shares its name.
- 390e892: A Death Korps Watchmaster can swap their laspistol for a bolt or plasma pistol and their chainsword for a power weapon, and search finds Death Korps of Krieg by those weapons.
- 874b18d: An AI assistant that saves a roster gets its Praetorium link to share.

## 0.179.4

### Patch Changes

- edabe2c: AI assistants treat Praetorium's roster and battle changes as able to reach other players, since rosters and battles can be public.

## 0.179.3

### Patch Changes

- b50724c: Connect an assistant links to Praetorium in Claude's connector directory, gives step-by-step setup for ChatGPT and Gemini, and shows the Connect to Praetorium page; the account docs show Connected apps.
- 1cb69a0: The simulator link an AI assistant gets from a combat simulation is a full praetorium.gg address, so it opens from the chat.
- 0071b2a: AI assistants and connector directories show each Praetorium tool by its readable name, such as "List my saved rosters", instead of its internal one.

## 0.179.2

### Patch Changes

- e4ce5d5: The roster editor and faction datasheet lists offer close matches for a misspelt unit name, as global search does.
- e4ce5d5: The roster editor and faction datasheet lists find units by what their abilities do, as global search does.
- 430060e: The docs explain what search matches and how to search Praetorium from your browser's address bar.

## 0.179.1

### Patch Changes

- 34c77d5: The privacy policy and the account deletion confirmation name GitHub alongside Apple, Google and Discord as sign-in providers.

## 0.179.0

### Minor Changes

- f0ae1df: Player guides are now docs: short pages on building and importing lists, the combat simulator, battles and AI assistants, with screenshots that outline the control each step names, a troubleshooting page per area, and a search on the docs page that finds problems by their symptom. Old guide links redirect.

### Patch Changes

- a0058b1: The desktop footer no longer repeats Send feedback; it stays in the account menu and on the Support page.
- b6a9dc5: The Support page leads with the docs search and each area's troubleshooting page, and account and app help now lives in the docs.

## 0.178.1

### Patch Changes

- 5a88c2c: The app keeps the logo on screen while Praetorium opens, on the same background as the header and tab bar, instead of switching to a small spinner.
- e9c5292: Scrolling in the iPhone app keeps its momentum like Safari instead of stopping early.
- 0f9c500: More leads with the combat simulator, missions, rules and leagues as large tiles, with the rest grouped below.

## 0.178.0

### Minor Changes

- 011f38f: The force dispositions page shows how many detachments and armies can field each disposition.

### Patch Changes

- 72114bf: Official-app imports keep a Relic Greataxe, a multi-melta Eradicator, a Thunderwolf Cavalry Pack Leader and a Wulfen Death Totem that the catalogue names differently.
- 72114bf: Importing text from the official app reads every weapon when the app lists several under one bullet, instead of asking you to place them by hand.
- 72114bf: Official-app text copied without its title line now imports instead of being refused as an unsupported export.
- 86cc1fd: Search shows your recent searches and the page list in one scrolling list instead of two.

## 0.177.0

### Minor Changes

- 3f79de8: The header shows every section, including Factions, Missions, Force dispositions and Rules, in one bar on wide screens and a second row on narrower ones, and stays at the top while you scroll.
- c39412a: Photos on player profiles open in a viewer instead of a new tab, and every photo viewer steps to the previous or next photo with its arrows or the arrow keys.

### Patch Changes

- 3f79de8: The header and the phone tab bar are darker, and the search box stands out from them.
- b520550: Pages no longer show a banner asking where rules text comes from; choose sources from any rule that has no text yet.
- 3f79de8: Search on phones opens as a panel near the top of the screen instead of covering the whole page.
- c39412a: Collections on player profiles use the same faction sections and datasheet cards as your own collection, with owned, built and painted counts for every datasheet.

## 0.176.0

### Minor Changes

- 79400bb: In 2v1 and 2v2 league events, comparing revealed rosters can now field both lists of a pair together, starting with your team against your opponent's.
- 79400bb: The simulator's Rosters comparison now lists your friends' public rosters and friends' revealed league lists alongside your own.
- 79400bb: Simulate on a unit of another player's roster or revealed league list now opens the combat simulator with that unit defending, so you can attack it with one of your own rosters.
- 79400bb: The combat simulator's roster picker now lists friends' rosters from revealed league events.
- 79400bb: The combat simulator shows whose roster each side comes from, with the player's avatar, on unit cards, recent simulations and roster comparisons.

### Patch Changes

- 3628925: A unit's equipped weapons now include weapons its chosen wargear options supply, such as a Defiler's two excruciator cannons.
- 79400bb: The roster comparison is easier to read: phases switch with tabs, a bar tracks a running comparison, cells shade by result, best matchups are outlined, a pair's units are grouped under each player, and units that can't attack explain why once.
- 79400bb: The simulator's Calculation uses section now lists both sides' active rules and buffs, chosen weapon options and left-out weapons, not just manual modifiers.
- 79400bb: Reopening a simulator link with a roster side no longer says the roster is unavailable while it loads.
- 79400bb: The simulator's Rules & buffs and Manual modifiers headings now open from anywhere on their row.
- 79400bb: A Support unit that isn't attached to a Bodyguard unit is now flagged as illegal in rosters, and the simulator asks you to attach it before calculating its attacks.

## 0.175.5

### Patch Changes

- 2b0f0b7: Rules text that once arrived broken no longer stays missing on that device.
- 2b0f0b7: When rules text can't load from its community source, each rule now says so and offers Try again instead of showing a dash.

## 0.175.4

### Patch Changes

- 2f5dceb: Import Salamanders rosters containing Deathwatch Support alongside Forgefather's Seekers without losing either detachment.

## 0.175.3

### Patch Changes

- a6fd686: Loadout optimization keeps working after a fresh reference download.

## 0.175.2

### Patch Changes

- 207b249: A faction's datasheet list no longer sometimes takes many seconds to open.

## 0.175.1

### Patch Changes

- e8733a1: Each rule on a rules page now offers to load its text where you are reading, the same way datasheets do, instead of one notice at the top of the page.
- e8733a1: The question about where rules text comes from now appears only on pages that show rules text, such as factions, rules, missions, rosters, battles and the simulator.

## 0.175.0

### Minor Changes

- 9b118e3: Optimizing a squad with a very large choice of weapons, such as Plague Marines, Legionaries or Chaos Terminators, now finishes in seconds instead of running for minutes and giving up. Such squads have too many loadouts to compare them all, so the simulator improves the loadout step by step from several starting points and says so.

### Patch Changes

- e541595: Building and changing units is faster, which speeds up loadout optimizing by about a quarter.
- 9b118e3: Optimizing a unit no longer fails when only some of its loadouts use rules the simulator cannot estimate, such as Einhyr Hearthguard's; those loadouts are left out and the simulator says so.

## 0.174.4

### Patch Changes

- e9f37be: Optimizing a unit's loadout in the combat simulator is faster again: in a full army it takes about a third of the time it did.
- e9f37be: Comparing two whole rosters in the combat simulator gets its units ready several times sooner.

## 0.174.3

### Patch Changes

- 2f0ac37: Import New Recruit chapter rosters with their faction, disposition, attached units, and allied datasheets intact.

## 0.174.2

### Patch Changes

- 60d176d: Optimizing a unit's loadout in the combat simulator finishes about a third sooner.

## 0.174.1

### Patch Changes

- b886786: Lists exported from the official app in another language, such as German, now import with their units, attachments, Warlord and enhancements.
- b886786: An imported list whose force disposition is not recognised takes its detachment's disposition, or asks you to choose one in setup.

## 0.174.0

### Minor Changes

- 5b0d920: Add Max actions for built and painted collection counts, and preserve newer collection edits, profile changes and simulator roster selections while requests finish.

## 0.173.3

### Patch Changes

- dc23723: Collection and wishlist cards take less space, suggestions fill available slots, and uploaded photos load faster from smaller previews.

## 0.173.2

### Patch Changes

- c4f77e5: Collection factions show owned, built, and painted totals with compact datasheet cards on desktop and phones.
- c4f77e5: Wishlist suggestions no longer recommend models already in your collection.

## 0.173.1

### Patch Changes

- 4f3a0fe: Spread each army's collection across the page width instead of one narrow column.
- dce0223: Show From your battles above the wishlist on the collection page.
- 49d43be: Stop suggesting collection datasheets from armies whose every roster is archived.

## 0.173.0

### Minor Changes

- b475841: Suggest wishlist datasheets that other players' public rosters field in your armies and none of your own rosters use.

### Patch Changes

- b475841: Show a collection datasheet's owned, built and painted counts directly beneath its name.
- b475841: Open a datasheet from its name in the collection's From your battles suggestions.
- b475841: Show faction marks and points in the collection and wishlist datasheet pickers, matching the simulator's unit picker.

## 0.172.1

### Patch Changes

- 3b2a3cf: Move Simulator to third in desktop navigation and match its page background to the other pages.

## 0.172.0

### Minor Changes

- ed4557d: After league rosters are revealed, choose to make your original saved roster public for other players to discover and copy.

## 0.171.0

### Minor Changes

- 39134a4: Show Factions, Missions, Force dispositions and Rules in a row beneath the desktop header instead of a Reference menu, and keep every section link visible at narrow desktop widths instead of behind a menu button.

## 0.170.0

### Minor Changes

- 73fd3fa: Simulate a unit from one of your saved rosters or a friend's public roster, with its detachment, enhancements and attachments, against any unit in the combat simulator.

### Patch Changes

- 73fd3fa: Call recent matchups recent simulations, and show only the newest three on the home page with a link to the rest in the simulator.

## 0.169.4

### Patch Changes

- 0ef0a11: Keep live updates connected for visitors, recover pages that fail to load, and keep search, unit pickers and faction references responsive. Resolve Brood Brother Auxilia rules and options consistently.

## 0.169.3

### Patch Changes

- 5c5f02c: Roster text exports use a single readable layout for copying or downloading.

  Official-app roster imports preserve support attachments alongside leaders.

## 0.169.0

### Minor Changes

- 5364dfe: Start a roster with a faction already chosen from its faction page, and open a new roster from any mission pack or matchup page.

## 0.168.0

### Minor Changes

- 9b5923c: A new player guide shows how to add Praetorium to an AI assistant and look up units, points and matchups with links back to the source.

## 0.167.1

### Patch Changes

- a3e7e50: Keep Skorpekh and Ophydian Destroyers within their 3–6 model limit when resizing a unit.

## 0.167.0

### Minor Changes

- 0ef1ab4: See the total number of models alongside the unit count in the roster editor.

## 0.166.0

### Minor Changes

- adc4033: Use the Optimize dropdown to build a unit for ranged or melee combat in the simulator.

## 0.165.3

### Patch Changes

- e976019: Fix roster imports missing units with typographic hyphens, model names, paired weapons and upgrades marked as one per army.

## 0.165.2

### Patch Changes

- 309327d: Roster cards and loadouts count every copy of a weapon that a model carries twice, such as the two hand flamers of a Sanctifier.

## 0.165.1

### Patch Changes

- 0e20317: Keep squads the data fixes at one size, such as Wyches, Kabalite Warriors and Strike Teams, at that size instead of offering other model counts, so a list without model counts imports them at full strength.

## 0.165.0

### Minor Changes

- 9566d5e: Start a battle from a saved roster's menu, and the battle opens with that roster already on your side.

## 0.164.2

### Patch Changes

- 39dd32b: Offer Sanctifiers their simulacrum imperialis and two-hand-flamer Sanctifiers, each in place of a hand-flamer Sanctifier, so the squad stays at nine models and lists that include them import.

## 0.164.1

### Patch Changes

- 81b6a09: Wrap profile, roster, battle and update tabs onto a second line on narrow phones and at larger text sizes instead of widening the page.

## 0.164.0

### Minor Changes

- 541ad35: After a guest game, the guest can create an account, starting with the name they played under, to add the battle to their record and the leaderboard, and send the host a friend request.
- d5bf2fa: Track a real battle against an opponent without an account by seating them as a guest; the game counts in your record but not on the leaderboard.
- 541ad35: A guest can scan the host's QR code or open their link to choose their own army and play their side on their own device, without an account, seeing the other side's actions as they happen.
- d8cf26b: Without an account, the rosters page and builder look and work like a signed-in player's, keeping one roster on your device; starting another asks you to sign up, and your roster moves into the new account.

### Patch Changes

- f106f1f: Battle setup no longer says mission data is unavailable for a side that has not chosen its army yet.

## 0.163.0

### Minor Changes

- 90b7fb4: The roster builder shows how many points are left, or how far over the limit the roster is, beside its points total.

### Patch Changes

- 90b7fb4: On a phone, the roster builder's points and buttons fit on one line before you sign in.

## 0.162.1

### Patch Changes

- fc910ff: Give mission cards more scrolling space in mobile scoring prompts, including at larger text sizes.

## 0.162.0

### Minor Changes

- edf4557: Recent combat simulator matchups are saved to your account and follow you to other devices; they are no longer kept on a device for signed-out visitors.

### Patch Changes

- edf4557: Recent matchups show as a compact row of cards with each army’s mark and its attached leaders, and adding a leader updates a matchup’s card instead of adding another.

## 0.161.2

### Patch Changes

- 3d553fb: ListForge, Warmind and WTC-style exports separate detachments with commas so Warmind reads both, and ListForge exports mark enhancements so ListForge applies them.
- 7d165b0: Importing a Warmind list no longer reports wargear the unit already holds under its datacard name: Drazhar's Executioner's demiklaives, Lady Malys's blade and razor fan, and the Hand of the Archon's "Splinter Pistol and 1 Razorflail".
- 3d553fb: ListForge WTC lists that name their faction by keyword, such as Chaos Daemons, Chaos Space Marines and Space Marines lists, now import.
- 3d553fb: ListForge lists with allied units import without reporting the allies heading as a line it could not read.
- 3d553fb: An imported unit takes the model count its text names, so a Piranha carrying two carbines no longer imports as two Piranhas.
- 2ccbfcc: A list that names every model in a squad imports exactly those models. Plague Marines with plague spewers and Chaos Bikers with meltaguns lost their specialists to the default models.
- 2ccbfcc: ListForge imports give each model the wargear listed under it. A Hekatrix's blast pistol and power weapon, and a Stealth Shas'vre's burst cannon, were swapped for the squad's weapons.
- 3d553fb: Lists Warmind exports in ListForge or official app layout import with both detachments, their battle size, disposition and wargear.
- b2bc5cb: Upgrades a unit may take more than once outside any group can now be chosen: Incubi and Aspect Shrine Tokens, a Bastion's heavy bolters and Scarab Occult Terminators' Hellfyre missile racks. Imported lists with an Incubi Shrine Token keep it.
- f797af1: A Piranha can carry both of its seeker missiles. Asking for two on one Piranha, or six across three, kept only one each.
- f797af1: Stealth Shas'ui with fusion blasters can be added after a squadmate takes a homing beacon. The beacon left no body free, so the fusion blasters didn't appear.
- 4f188ee: Specialists can join squads that never change size or whose minimum shrinks to make room: a Pathfinder Team's rail rifles and grenade launcher, and a five-model Intercessor Squad's grenade launcher. Choosing them did nothing, and imports reported them as missing.
- aa3c02c: A squad grown past its minimum adds its default models, so a 10-model Terminator Assault Squad starts with lightning claws instead of five storm shields, and swapping in storm shields charges for each one. Its price had come out 25 points under the Munitorum Field Manual.
- 7d819c9: A Trygon with its Character upgrade can take Trygon Prime in Subterranean Assault, in the builder and when importing a list. Options that the rest of the unit opens are now offered, such as the Slaanesh weapons of a Daemonic Charioteer with Daemon of Excess, the Desolation Sergeant's vengor launcher and the Hesyr's concussion gauntlet.

## 0.161.1

### Patch Changes

- 14bec30: The homepage shows up to three played games, three friends' games, and three public games.

  Live games stand out with filled green status badges and dark text.

## 0.161.0

### Minor Changes

- c172dff: Browse armies from finished public battles on the Rosters page's Played tab, see who played each one and under which rules version, and duplicate one to edit and simulate.
- 15bb37f: Played armies show their battle result the way battle cards do, with the score, the factions they faced, and a link to the battle.
- 2f4ee7e: Save a configured unit as a loadout and add it from beneath its datasheet in the picker of another roster of the same army, which points out any choice its rules version, detachment or limits do not allow. Rename or delete a saved loadout from its menu in the picker.

## 0.160.1

### Patch Changes

- 036bf2b: The Discord community invite no longer expires.

## 0.160.0

### Minor Changes

- 9fa6e13: Open the Discord community and GitHub repository from icon links beside Search in the app header, or join Discord from Support.

## 0.159.1

### Patch Changes

- a6b3cf6: Importing a list keeps a weapon that brings its own model, such as a Terminator Squad's cyclone missile launcher, and the import review now names any listed wargear the imported unit ended up without.
- e2202b9: Wargear chosen for several models in a squad now costs points for every model holding it, so Deathwatch Terminators with storm shields price at 210 instead of 195.
- e2202b9: Squads whose models each carry several weapons, such as XV9 Hazard Battlesuits, no longer show a false "needs at least" warning at larger sizes.

## 0.159.0

### Minor Changes

- c159027: Export rosters as ListForge, Warmind, and WTC-style text.
- 8329719: Import rosters pasted from ListForge, Warmind, and WTC-style tournament lists.

## 0.158.0

### Minor Changes

- d26b3b9: Try an editable combat simulator example and reopen recent standalone matchups from the simulator or home page on this device.

### Patch Changes

- fce5392: A weapon chosen inside a model option, such as a Terminator's cyclone missile launcher, is charged once instead of twice.

## 0.157.5

### Patch Changes

- 6c492db: An option taken by several identical models shows its per-model price instead of a fraction of it.
- 6c492db: Wargear options whose cost sits on the weapons they hold, such as Leman Russ sponson pairs, Knight Despoiler arms and Forgefiend cannons, are charged once instead of twice.

## 0.157.4

### Patch Changes

- ab66405: Screen readers now announce failures to copy a roster link, leave an impersonated account, share a battle invite or load the unit picker.
- ab66405: Assistant tool and onboarding tour failures now show in the error colour.
- ab66405: A faction link with a malformed rules version now opens the faction's current rules instead of an error page.
- ab66405: Combat simulator failures now show in red, so they stand apart from prompts to choose models or weapons.
- ab66405: A text size chosen in one tab now applies to your other open tabs straight away, not only once you open the settings there.

## 0.157.3

### Patch Changes

- feea201: Keep selectors working after browser translation.

## 0.157.2

### Patch Changes

- 6dcd5a4: Screen readers now announce failures in account security, sign-in, sharing settings, battle setup and creation, friend invites and notifications as soon as they appear.
- 6dcd5a4: Copying recovery codes or a collection CSV now says when the browser refuses the copy instead of failing silently.
- 6dcd5a4: Friend invite links now show a titled preview card when shared.
- 6dcd5a4: A league list refused for marking three or more Warlords names them as "A, B and C" instead of "A, B, and C".
- 6dcd5a4: Battle setup names three or more waiting players as "A, B and C" instead of "A and B and C".
- 6dcd5a4: Switching a roster between building and viewing, and remembering open panes and tabs, no longer breaks when the browser blocks storage.

## 0.157.1

### Patch Changes

- 9b7facd: Every place where rules text isn't loaded now has a Choose sources link.
- 9b7facd: Rules text prompts and the sources banner no longer flash the wrong state while a page loads.

## 0.157.0

### Minor Changes

- 8fc51b8: Datasheet abilities, enhancements and other rules text show once you turn BSData on, with one prompt per page naming the source until you do.
- 073f2e4: Choose which community sources load rules text on your device in one dialog, opened from any page that is missing text, and change it later on the Data sources page.
- a851682: Stratagems, detachment and army rules, and datasheet wording from Game Datacards load in your browser once you turn Game Datacards on, wherever they appear.
- 9a7faaf: Core rules pages show rule numbers and titles, and load the rules text from Game Datacards in your browser once you turn Game Datacards on.

## 0.156.1

### Patch Changes

- 9e02e74: A battle link opened right after it's shared now opens the battle once it's ready, instead of staying on "Nothing here".

## 0.156.0

### Minor Changes

- 57e2654: Search lists the results you opened recently before you type, and you can remove any of them or clear the list.

### Patch Changes

- 5b3e162: A painted count entered right after changing the built count is no longer reset to zero.
- 94653bd: Loadout optimisation is up to ten times faster, finishes for large squads such as Plague Marines, shows its progress from the start, and no longer slows down the service for other players.
- 57e2654: Datasheets, rules and other reference pages open straight from your downloaded reference while it is up to date.
- 790bce3: The roster builder prices units and opens datasheets on your device while your downloaded rules are up to date.
- 57e2654: Search shows results as you type once the reference has downloaded, instead of waiting for the server.
- 57e2654: The offline download is smaller and its pages and search work before the rest finishes; older rules versions download only when one of your rosters uses them.

## 0.155.2

### Patch Changes

- b846272: Importing a squad that lists no specialist no longer gives it vox-casters or other specialists it did not take.
- b846272: Importing an enhancement whose own name ends in "(Upgrade)", such as Furious Assault, places it again.

## 0.155.1

### Patch Changes

- 479ba00: Pasted New Recruit lists keep their attached units, joined to their bodyguards, instead of dropping them.
- 479ba00: Imported squads keep the specialists and weapons the list names, such as a vox-caster, a weapons team or a hull lascannon beside sponson heavy bolters.
- 479ba00: Pasted New Recruit lists read their force disposition, enhancements marked as upgrades, renamed Warlord entries and models named without their loadout.
- 479ba00: Enhancements limited to one model in a unit, such as Bombast-class Vox-array on a Tempestor Prime, are offered to that unit.
- 479ba00: Squads such as Cadian Shock Troops, Heavy Intercessors and Outriders can take the specialist model their datasheet offers, which takes the place of a default trooper.

## 0.155.0

### Minor Changes

- e73c5f8: The Friends tab on Rosters lists your friends' public rosters, ready to open or duplicate.
- e73c5f8: Rosters has Mine, Friends and Public tabs like Battles, replacing the separate Discover armies page. Old Discover armies links open the Public tab with their filters.
- cf1dc1e: Friends' and public rosters can be sorted by update, creation, name or battle size, like your own.

### Patch Changes

- cf1dc1e: The Battles tabs read Mine, Friends and Public, matching Rosters.
- 83a9371: Rosters lent to you show the same card as your own, with detachment, points, legality and last update, in your rosters and when choosing an army for a battle.
- e73c5f8: Public rosters no longer list your own rosters; they stay under Mine.

## 0.154.0

### Minor Changes

- 655b1bb: Count how many of each datasheet's models are built and painted on the Collection page.
- 655b1bb: Export your collection as CSV and import one after reviewing which rows match, differ or are skipped.
- 655b1bb: Keep a wishlist of models to buy on the Collection page; it shows on your profile with your collection.
- 655b1bb: Saved rosters have a Your collection section showing which models you are short of, or still need to build or paint.

## 0.153.0

### Patch Changes

- 1d11aa9: The player photo viewer keeps its photo, like and actions on one screen on phones, and datasheet galleries show larger photos.

## 0.152.1

### Patch Changes

- 3a64684: The account menu and its page are called Account settings, and each settings section is one heading with one short line.
- 3a64684: Battle errors read as sentences, and setup and scoring prompts repeat themselves less.
- e47292f: The battle log names the player who chose to attack, not the one who took the first turn.
- c8028b9: The battle phase rail shows every phase name in full.
- 3a64684: Battle setup opens with both sides facing off, puts each step in its own panel without pinned bars, names each side once, and ends with Start battle.
- c8028b9: Battle setup steps drop the extra panel around their choice cards, and spectators see victory and command points at full size.
- 3a64684: Roster setup offers a custom points total as a battle size choice, naming whose limits it plays by, instead of a separate budget field.
- 5d2253d: Buttons and fields look the same on every device, and chosen setup options show their highlighted border instead of only a ring.
- 3a64684: Data updates list each faction as a flat row instead of a card inside a card.
- 7537003: A force disposition's page lists each faction once instead of repeating it for every rules version.
- 3a64684: Removing a friend asks first and names the friends-only battles and lent rosters that go with it.
- 5c8b383: Battle cards on a league page mark your seat and show Won or Lost, as they do on Battles.
- 3a64684: Once every roster is sealed, a league's next-action card offers Reveal all rosters, and an open event lists its entrants once.
- 3a64684: Leagues call a sealed army a roster and use the same Battle format label as new battles.
- b1e6416: A mission matchup's header names the primary mission each side plays and jumps to it, and each side's missions and actions carry its disposition colour.
- b1e6416: Terrain layout cards on a mission matchup fill their row, with each layout's name beside its letter.
- 3a64684: The compact header menu lists the reference pages directly instead of opening a second menu.
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
- e86e975: Battle setup records each side's stratagems and primary once instead of writing the same entry twice.
- 3a64684: Sign-up uses one name for creating an account, and Home welcomes a new player instead of welcoming them back.
- 204b1f4: Creating an account asks for your name instead of naming you after part of your email address.
- 35e5e44: Rosters compared in the combat simulator show their faction instead of loading it forever, and weapon choices are named.
- 3a64684: Discarding unsynced changes is marked as destructive, says why it needs a connection, and sign-out explains when it is waiting on them.
- 3a64684: A unit lost in battle is marked Destroyed, so it no longer reads like a battle result.

## 0.152.0

### Minor Changes

- f624534: On a phone, Home has its own tab beside Rosters, Battles and Factions, and Missions moves into More.

### Patch Changes

- f624534: On a phone, the page footer keeps only the privacy policy, terms and data sources, since More lists the rest.
- f624534: More lists its pages as compact rows grouped into Reference, Play, Account and Help, and adds player guides, your profile and support.

## 0.151.6

### Patch Changes

- a821bf6: A unit's datasheet in the army dialog now matches the roster editor's, with its detachment rules, keywords, attachments, and model photos.
- a821bf6: The army dialog's header takes two short lines instead of three, and on a phone an open datasheet has a back button in it that returns to the list.

## 0.151.5

### Patch Changes

- 3175a1a: Screen readers announce button-styled links, such as Build a roster, View list, and Edit roster, as links instead of buttons.
- a069131: Live battles and lists pick up again on their own after a dropped connection or when you come back to the app, without waiting to reconnect.
- 84b39f0: Outlined link buttons, such as Create an account, keep their border on devices set to a light appearance.

## 0.151.4

### Patch Changes

- 2531165: The army dialog's datasheet pane shows just the datasheet, edge to edge, without repeating the unit's card; on a phone it fills the dialog and the close button returns to the list.

## 0.151.3

### Patch Changes

- 85f7fb0: Cancelling the file picker after choosing to add a unit photo in the roster no longer leaves the loadout pane blank.
- 18148ef: Photo prompts invite you to show off your own models instead of warning you to add only photos you took.

## 0.151.2

### Patch Changes

- e144650: A unit's datasheet in the battle army dialog opens beside the list on wide screens, and in its own view with previous and next on phones, instead of unfolding inside the list.
- e144650: Recording wounds, models, or a lost unit no longer fills the battle log or takes Undo away from the last action.
- e144650: Casualty buttons stay usable while a change saves, so a squad can be tapped down several models at once.

## 0.151.1

### Patch Changes

- f639d83: A detachment page's force disposition chips link to that disposition's page.
- f639d83: A detachment page's header no longer repeats the faction name, which the breadcrumb already shows.

## 0.150.0

### Minor Changes

- 1548f27: A reported photo is hidden from everyone but its owner until an administrator reviews it.

### Patch Changes

- 1548f27: Collection photos and profile pictures are checked for content that does not belong on the service. The privacy policy now covers collection photos.

## 0.149.0

### Minor Changes

- f5349aa: Add up to six photos of your models to each datasheet by dropping them on, or clicking, the photo area of a datasheet's Player photos, the roster builder's unit pane or your Collection. Adding a photo puts the datasheet in your collection.

### Patch Changes

- 8746440: Datasheets and the roster builder no longer show the base size as a characteristic box; datasheet pages list it under Unit configuration, now including units whose base size came only from their profile.
- f5349aa: Removing a collection photo now asks for confirmation, and removing a datasheet from your collection says how many photos go with it.

## 0.148.0

### Minor Changes

- 8845886: Like other players' photos. The most liked lead a datasheet's Player photos and stand in for your own in the roster builder.
- daceddc: Add a photo of your own models to each datasheet in your collection. It shows on your Collection page and, while your collection is shared, on your profile.
- daceddc: Datasheet pages show Player photos from shared collections, and the roster builder shows your own photo of the selected unit, or a shared one when you have none. Report a photo that should not be there from its viewer.

## 0.147.6

### Patch Changes

- 02b2c33: A long unit name under From your battles on the Collection page no longer widens the page on phones.
- 02b2c33: Points badges on a faction's datasheet list now line up in one column.

## 0.147.5

### Patch Changes

- 31ca9cc: On iPhone and Android, Back now returns from a screen opened on the homepage or the More screen to the screen that opened it.

## 0.147.4

### Patch Changes

- b42f3e4: Compact Praetorium text still imports after its "Exported with Praetorium.gg" footer has been removed.
- b42f3e4: Imported army text finds the detachment when it comes after the battle size, so its enhancements are placed.
- b42f3e4: Army text with a "Warhammer 40,000" line above the faction imports under the right faction.
- b42f3e4: Imported army text reads "• 5 models" lines as squad sizes and skips a closing "TOTAL ARMY POINTS" line.
- b42f3e4: Imported army text keeps working when its title has a note after the points, such as "(600 Points; Cult Icon to add in builder)".

## 0.147.3

### Patch Changes

- 1dbe41c: The battle list drops a battle that was deleted while you were away instead of showing it until a reload.
- 1dbe41c: Editing a roster straight after opening it from a link saves instead of reporting that it changed on another device.
- 154ae55: Scrubbing a battle replay shows the scoreboard for the event you are on, not an outdated one.
- 1dbe41c: Signing out while a page is loading reloads it for the signed-out view instead of showing an error.

## 0.147.2

### Patch Changes

- 7efc667: On iPhone, swipe from the left edge to go back from a detail screen to the screen that opened it in the same tab.

## 0.147.1

### Patch Changes

- 1296537: An exchange code made from the roster library carries the roster's current points, not a price the library had cached.

## 0.147.0

### Minor Changes

- 78065fe: Archive a roster instead of deleting it. Archived rosters move to a collapsible section at the bottom of your roster library, stay off Home and out of the battle, league and simulator roster choosers, and come back with Unarchive.
- 78065fe: The game journal is gone, and its saved games and events are deleted.

### Patch Changes

- 7aba302: Battle rows label a conceded or early finish as "Conceded" or "Finished early".
- 7aba302: Battle rows show their battlefield as soon as the page appears instead of adding it a moment later.
- 087891e: Home no longer shows a Getting started checklist; a new account's Home leads with its rosters.
- 7aba302: The roster library shows only its loading placeholders, without a separate loading line above them.

## 0.146.1

### Patch Changes

- c47f5bf: The Support page opens the feedback form in place, with the public issue tracker kept as the public alternative.

## 0.146.0

### Minor Changes

- 93bf720: Send feedback, with an optional screenshot, from any page without leaving it.

### Patch Changes

- 9c99942: A roster chooser with no list for the battle size offers to change the battle size.
- 4e15ed2: A wargear count that cannot go higher says why, and every lit add button changes the loadout.
- 8dc4616: A detachment address under a faction that borrows it opens the printing faction's page instead of nothing.
- fb1107e: The compact roster export wraps inside its box on a phone instead of running past it.
- b527577: Cthonian Beserks can take twin concussion gauntlets and mole launchers.
- 8dc4616: The favourite heart on a faction's datasheet list has a full-size touch target, so tapping it no longer opens the datasheet.
- 4e15ed2: Clicking a detachment card while setting up a roster selects it; its reference opens from the reference icon.
- 8ad6cae: Error pages explain the problem in plain words and offer to try again, or to reload when a release has replaced the page's code.
- b527577: Wolf Guard Headtakers keep their Hunting Wolves instead of reporting a saved choice as unavailable.
- fdfb98d: Imported lists keep the equipment nested under each model, plural Enhancements labels and the full model count of each squad.
- b527577: The Deathwatch Indomitor Kill Team starts legal at 10 models.
- 62d1742: A list that fails to import is sent to us in an automatic report so the importer can be fixed for it.
- 20fd45c: Sealing a league roster says what is wrong with its Warlord and links to editing the list.
- 8c40173: Releases no longer show a What's new banner; the What's new page still lists every change.
- 8300c50: Older rosters open straight into the builder instead of briefly saying their army book was replaced, and a failed army read offers Try again.
- 3a6d780: The simulator's Optimize names the rule that stopped it instead of reporting unsupported rules in general.
- 9c99942: Choosing a roster over its points limit for a battle explains why and links to editing it.
- 4e15ed2: A unit holding a choice the current rules no longer offer can reset just that choice.
- 4e15ed2: Opening a saved roster shows its outline while army data loads instead of flashing that the data is unavailable.
- 4e15ed2: Sharing a roster shows its progress beside the header and copies the link once per click.
- 3a6d780: The simulator's unit picker says units are still loading instead of finding no matches.
- 8ad6cae: A bottom tab forgets a page that no longer exists instead of reopening it.
- 3e0e703: A roster that has not synced yet opens in a new tab or after a reload instead of showing nothing here.

## 0.145.0

### Minor Changes

- d39a0b5: MFM 1.6 is the current rules, with its points for every faction. Rosters on MFM 1.5 follow it.

### Patch Changes

- d39a0b5: The Adeptus Custodes codex is part of the current rules with official MFM 1.6 points, Leader lists and unit limits, and Custodes preview rosters move to it unchanged.
- d39a0b5: Custodes rosters built on the index stay on MFM 1.5 and offer to convert to the codex.
- 019ece9: Converting a roster no longer offers rules versions that fold into another, where the conversion would have changed nothing.
- d39a0b5: Upgrades the Munitorum Field Manual marks as one per army take their MFM points.
- d39a0b5: Links to a faction's rules under an earlier MFM version open the matching archived rules, or the current rules when none are kept, instead of a missing page.

## 0.144.7

### Patch Changes

- f8e4911: Show your record and leaderboard place on the home page with the rest of the page, instead of after it loads.

## 0.144.6

### Patch Changes

- 1359ab9: Open Home after signing in to the mobile app, instead of showing "Something went wrong".

## 0.144.5

### Patch Changes

- a72d79f: Keep a full league's lists sealed until someone reveals them, instead of opening them when the last list is sealed.

## 0.144.4

### Patch Changes

- 71407ac: Seat the only possible league matchup when starting a 1v1, 2v1 or 2v2 battle.
- 71407ac: Pick the only two league entrants left to pair by default.
- 71407ac: Let league entrants open their own sealed list before the reveal.
- 71407ac: End league entrant rows with the solo and allied size toggle, after the view and remove icons.

## 0.144.3

### Patch Changes

- 49f8fa9: Open rosters in the mobile app without waiting for saved battles and rosters to finish refreshing.

## 0.144.2

### Patch Changes

- c219e75: Stop re-pricing an open roster a few seconds after the page loads.

## 0.144.1

### Patch Changes

- ae6366f: Leave a battle page as soon as its battle is deleted, instead of waiting for the next refresh.
- 3bd45a8: Price rosters faster by reusing the units a change didn't touch.
- 4015934: Update how many copies of each unit you can add faster while you edit a roster.
- ae6366f: Refresh your data once when live updates connect, instead of reloading the same screens several times.
- 5c38f17: Serve reference pages faster to visitors who are not signed in.
- 8a5e4b9: Editing a roster no longer reloads the whole page's data after each change, so edits settle faster.

## 0.144.0

### Minor Changes

- c17890e: The battles page lists your own games, your friends' games or every public game, one whole list at a time, and the home page links to each.
- c17890e: Your home page names the latest data updates to the armies in your rosters, and how many of your lists an update has changed.
- c17890e: Battles show as compact fixture cards on the home page, the battles page, profiles and leagues, with every player at the table, their armies and the score between them.
- c17890e: New players see a Getting started checklist on the home page that ticks off each step as they go.
- c17890e: Your home page shows your record, win rate, current streak and leaderboard place under the greeting.
- c17890e: Profiles show recent form, the army a player uses most and a clearer service record, and open on rosters for players who only build lists.

### Patch Changes

- 14179d1: The button that starts a new list now reads Create roster.
- c17890e: The home page leads with your lists when you have no games, and only shows your record once you have played.
- fb2d3b5: What's new and the update notice only list changes you can see in the app.

## 0.143.8

### Patch Changes

- 3f96e16: Mission choices such as Burden of Trust guards, A Tempting Target and Punishment are now optional: skip them and keep playing, or record them later from the mission card.
- 3f96e16: Tempting Target objectives are picked with one tap each, and its confirmations, like Consecrate's, are a single switch.

## 0.143.7

### Patch Changes

- 899acbe: Swiping on a battle prompt on a phone no longer scrolls the battle page behind it.
- 899acbe: Starting a battle opens the first turn at the top of the page instead of where setup was scrolled to.
- 899acbe: Dialog actions stay at the bottom of the screen on phones, even before the dialog has anything to show.

## 0.143.6

### Patch Changes

- 94a93a9: Battle actions and your opponent's moves appear faster.
- 94a93a9: Open pages no longer reload in the background every few minutes, and an open battle no longer reloads when someone moves in another battle.
- 94a93a9: Watching someone else's battle keeps it up to date every five seconds.

## 0.143.5

## 0.143.4

## 0.143.3

### Patch Changes

- dd6a2de: A battle with a saved change waiting for review keeps following live play and accepting actions while connected, instead of freezing until a reload.

## 0.143.2

### Patch Changes

- aef5bc2: Units in reserves or embarked can now be set up on the battlefield during a battle from the army roster, so the combat simulator can target them.
- 7c413f5: Changing two profile defaults or battle sharing choices in quick succession no longer snaps the second one back to its old value.

## 0.143.1

### Patch Changes

- 2e1bf41: Battle actions keep working after a site update without reloading the page, instead of freezing the battle.

## 0.143.0

### Minor Changes

- 3659518: Battlefield maps shade each side's territory as well as its deployment zone.

### Patch Changes

- f38c2bf: Offer the Custodes preview stratagems In Auramite Clad, Vigil Unending, Superhuman Focus, and Gilded Champion in battle.
- d9a3ed8: Show every stratagem in battle, including those for the other player's turn, when asked for the ones not playable now.

## 0.142.0

### Minor Changes

- 7e2de05: Set battle alerts for your detachment rules from the new Detachment rules row on any unit's datasheet in the roster builder.

## 0.141.20

### Patch Changes

- af8c4aa: Datasheets that already print their transport rule as a Transport ability no longer repeat it in a separate Transport section.

## 0.141.19

### Patch Changes

- cdc4f06: Impulsors, Land Raider Redeemers and the other Space Marine, Black Templars, Deathwatch and Orks transports whose datacards print the rule as an ability or in bold now accept embarked units, instead of refusing them for having no known model capacity.
- cdc4f06: Transports now hold passengers to their printed rule: only the keywords it names can embark, excluded units such as Terminators in a Rhino are refused, larger models take their printed space, and extra allowances such as a Ghost Ark's character slot count separately. Battles created before this keep counting one space per model.

## 0.141.18

### Patch Changes

- ff8423e: Choosing an option for a weapon group that was previously counted now takes effect instead of keeping the old counts.
- ff8423e: Resizing a squad with chosen loadouts now grows its default loadout and shrinks it first, so the squad keeps every model's weapons and is priced at its new size.
- ff8423e: Arming a heavy weapon scout or a special weapon marine, or putting that weapon down again, now saves the squadmate it replaces or returns, so later weapon changes on that squad take effect.

## 0.141.17

### Patch Changes

- a836312: Rosters on the superseded Space Marines codex versions move to the current MFM 1.5 rules, with the official codex points, and follow its later updates.
- a836312: A list saved after the app moved to newer rules is no longer read on older rules because of the gear it holds.
- a836312: Fixes, codexes and dated MFM builds now update the current rules version instead of adding a new one, and rules versions are named after their MFM version.

## 0.141.16

### Patch Changes

- eef80b9: The first eligible character added to a roster becomes its Warlord, and deleting the Warlord passes it to the next one added.

## 0.141.15

### Patch Changes

- e4d1f60: Roster setup marks a detachment unavailable, and says why, when it would break a one-per-army limit with one already chosen, such as a second Custodes Shield Host or Necron Dynasty.
- de14ff2: A roster no longer reports "a saved choice is no longer available" for weapon choices remembered under a loadout the player switched away from.

## 0.141.14

## 0.141.13

### Patch Changes

- 0f4ba22: Faction pages and the unit picker no longer pause for seconds after a site update.

## 0.141.12

### Patch Changes

- 86dc6f4: Opening an older rules version's faction pages no longer slows other pages down.

## 0.141.11

## 0.141.10

### Patch Changes

- 81e94fa: Growing Cadian Shock Troops to 20 models keeps their special weapons and no longer flags them as an unavailable saved choice.

## 0.141.9

### Patch Changes

- d8314f4: Keep the oldest remaining list at the head of a variant group whose original was deleted, so a new variant no longer takes its place.
- d8314f4: Save a new variant of a roster whose original was deleted instead of holding it for review as a roster you do not own.

## 0.141.8

### Patch Changes

- 413958b: Printing a fielded battle roster waits for its army data, so the print no longer comes out empty while the faction is still loading.

## 0.141.7

### Patch Changes

- f796e88: Show fixed weapons in roster loadouts when squad size is selected through unit composition.

## 0.141.6

## 0.141.5

## 0.141.4

## 0.141.3

### Patch Changes

- 7854363: Restore stratagem text and counts on detachment references when battle timing is unsupported.

## 0.141.2

### Patch Changes

- 98579f8: Count attached Leaders and their squads as one unit on league roster cards.
- 97cd75a: Restore chapter-specific Space Marine detachments on faction reference pages.

## 0.141.1

### Patch Changes

- 67779fc: Show both Hunter and standard melta weapon profiles in Eradicator roster loadouts.

## 0.141.0

### Minor Changes

- b73ddab: Find detachments by rule, enhancement, upgrade, and stratagem names and effects, including common advance-and-charge and fight-on-death phrasing, with every match reachable by scrolling.

  Prevent simulator breakdown values from overflowing on narrow phones.

## 0.140.2

### Patch Changes

- bd95765: Show an allied side's Force Disposition once in battle setup, and lead a league pair's status with the card they still need to choose.

## 0.140.1

### Patch Changes

- 9c2925b: Restore older saved leagues, rosters and favourites without losing saved changes.

## 0.140.0

### Minor Changes

- c0f2b27: Let an allied side in battle setup play any Force Disposition either list's detachments offer, not only the ones the lists chose.
- c0f2b27: Pair the allies in a 2v1 league so each pair plays together, and start a battle by choosing one side of the table.
- c0f2b27: Choose an allied pair's Force Disposition in a 2v1 or doubles league before the lists are revealed, from every card either list's detachments offer; league battles then play it without asking again.

## 0.139.1

### Patch Changes

- baacc68: Refresh Space Marines points and charge partial squads at the larger squad price.

## 0.139.0

### Minor Changes

- 854d4ec: Search Praetorium from your browser with live results on a dedicated search page.

  Find units by ability effects, including gaining command points.

## 0.138.0

### Minor Changes

- fa3ddb5: Let a league's owner name friends as admins who can start events, change settings and manage players, while only the owner can delete the league.
- fa3ddb5: Show each revealed league list as the roster library's card, one per line, with the player and icon actions to open it or simulate against it.
- fa3ddb5: Show everyone in a league whose list is sealed, and let anyone playing reveal the lists once every one is in, with the event naming who revealed it.
- fa3ddb5: Show a results table on every revealed league, ranked by wins, then draws, then victory points, and tell each duel player who they still have to play.
- fa3ddb5: Open every sealed list automatically once a league with a player limit is full and the last list is sealed. A player limit no longer has to be filled before the organizer can reveal.

### Patch Changes

- fa3ddb5: Start new leagues with automatic entry, since the private link already decides who can join.
- fa3ddb5: Tidy league cards and pages: one status in place of rows of chips, a status card with a step checklist in the side column, and a lighter readiness panel.
- fa3ddb5: Simplify the league settings dialog to its name, format, points and whether you play, with everything else under More options.
- fa3ddb5: Open the list chooser straight after joining a duel league, start a list from it at the league's size, and link back from the builder to seal it.
- fa3ddb5: Explain a revealed league to readers who are not in it, with a way to start their own.
- fa3ddb5: Say league rather than event where a page, notification or error means the whole league, and number events only once a league has more than one.
- fa3ddb5: Use a calculator icon for the combat simulator and every simulate action.

## 0.137.1

### Patch Changes

- 38d2754: The iPhone app reloads less often when opening saved reference data or editing a roster.

## 0.137.0

### Minor Changes

- 23cea62: Allow league rosters to use preview rules alongside released and archived rules.

## 0.136.3

## 0.136.2

### Patch Changes

- cc91bca: Restore the Land Raider Redeemer's Wrath of the Machine Spirit ability in the current Space Marines rules.

## 0.136.0

### Minor Changes

- b818909: Choose a larger text size on your profile; it applies on this device straight away and on every page load.

## 0.135.1

### Patch Changes

- dd42e3d: Open an app tab you have not visited yet at its top instead of at the previous tab's scroll position.
- dd42e3d: Keep battle setup working on a device that is online while Praetorium is unreachable, saving choices to sync later instead of failing.

## 0.135.0

### Minor Changes

- d09af4a: Keep a private game journal of games played away from Praetorium, grouped by event, with totals that never count toward ratings.

## 0.134.0

### Minor Changes

- 6d7064e: Lend a saved roster to a friend, who can view it and field it in their own battles without editing it.

### Patch Changes

- 6d7064e: Open a roster you were just given access to without a stale "Nothing here" page.

## 0.133.9

### Patch Changes

- bc7201b: Show average kills without the target's model limit, so attackers that both usually destroy a small unit can still be compared.

## 0.133.8

### Patch Changes

- 6333ccd: Highlight roster changes and legality problems while collapsing unchanged units in setup reviews.
- 6333ccd: Make app releases and army data updates easier to browse with clearer panels, shared navigation and highlighted changes.

## 0.133.6

### Patch Changes

- e7504a0: Speed up unit and roster simulations.

## 0.133.4

### Patch Changes

- d5ac3fb: Show Teams Event Companion 20–0 battle points beside victory points on finished battles.

## 0.133.3

### Patch Changes

- 0c2f450: Show which roster a copy came from while its source stays readable.
- 0c2f450: Simulate any roster you can read, including other players' public armies.

## 0.133.2

### Patch Changes

- d87e059: Correct what support, home and agent pages say about guest import, offline use and the mobile app.
- ee535bf: Keep the original roster when converting rules versions by saving the conversion as a variant.
- ddfc019: Keep benchmark model edits responsive and pin matchup table headings while scrolling.
- ee535bf: Filter the roster library by older rules or changes from a data update.
- ddfc019: Open saved rosters when league checks fail, explain changes that cannot sync, and keep normal saves quiet for 10 seconds.
- fce9854: Show what changed after an update, with a What's new page listing recent app changes.

## 0.133.1

### Patch Changes

- 58f5242: Show each unit's points before and after in the rules-version conversion review.
- 4b50468: Mark saved rosters that use older rules or changed in a data update.

## 0.133.0

### Minor Changes

- 0919d17: Simulate roster loadouts against customizable benchmarks, revealed league rosters, and live battle survivors to identify effective targets.

## 0.132.5

### Patch Changes

- 3074fb2: Keep battle simulator choices when casualties are recorded while it is open.

## 0.132.2

### Patch Changes

- 73d5fe3: Include compulsory detachment upgrades in Add units prices.
- 73d5fe3: Remove collection actions from roster unit menus.

## 0.132.1

### Patch Changes

- 63eca38: Update current Space Marines rules to the merged BSData codex and retain the earlier rules for saved rosters.

## 0.132.0

### Minor Changes

- db71d3c: Show collections on profiles by default and move Show collection on profile to the account settings.
- db71d3c: Start new rosters, copies and imports public for players who have not chosen a default visibility.

### Patch Changes

- 43c3a83: Show Attach unit and Attach to unit only when a unit can attach now, so a unit with a full Leader slot and no Support slot, such as Skorpekh Destroyers led by a Skorpekh Lord, no longer offers one.
- 3e114ee: Show friends' and public games below your own on the battles page when signed in.
- 8bf64cd: Discarding saved changes now completes while another screen is syncing them, and shows why if it cannot.
- f1bcbfd: Let the Discover armies page scroll, so long lists reach Show more armies.
- 92cb559: Edits in the iOS app, such as typing a unit note, no longer get stuck waiting to sync when several saves happen at once.
- ce1db4f: Remove the privacy and setup notes from the Start a battle dialog.

## 0.131.2

### Patch Changes

- 9311dc1: Send saved battle and roster changes straight away after a page reloads mid-sync, instead of waiting up to a minute.

## 0.131.1

### Patch Changes

- 275f4e2: Fold the desktop navigation into its menu button when enlarged text would push Reference, Search and Account off the screen.
- 275f4e2: Keep the account menu and other menus inside the screen with enlarged text.
- 275f4e2: Wrap the End phase button's label instead of clipping it with enlarged text.
- 275f4e2: Keep the battle scoreboard's scores clear of the phase title with enlarged text.
- 275f4e2: Keep the simulator's result figures and breakdown apart with enlarged text.
- 275f4e2: Keep weapon profile headings apart with enlarged text.

## 0.131.0

### Minor Changes

- 2356c10: Track a battle manually: keep score, command points, rounds, the timer and battle notes without mission cards or scoring automation.

### Patch Changes

- 8c68320: Find leaders, support and bodyguards from a unit's attach menu, which can add a new unit already attached, instead of from the unit picker.
- 010c4a7: Remove the in-app report form; report problems on the public GitHub tracker.

## 0.130.0

### Minor Changes

- b64427a: Discover armies other players made public, filter them by faction, detachment and rules version, see who built each one and whether it is legal, and duplicate one into your rosters to edit. Making a roster private or unlisted takes it out of the list straight away.

## 0.129.1

### Patch Changes

- f885102: Remove unit nicknames and keep unit notes private to their owner.

## 0.129.0

### Minor Changes

- 7d36375: Set a custom points budget for a roster while its battle size still sets detachment points, enhancement and unit limits.

## 0.128.1

### Patch Changes

- b09c4b1: Return to the page you were reading after signing in from the account menu.
- b09c4b1: Label link and invite actions Copy in the browser, where they copy to the clipboard.
- b09c4b1: Keep the loadout model count controls on screen with enlarged text.
- b09c4b1: Keep unit picker rows readable and their Add buttons reachable with enlarged text.
- b09c4b1: Keep battle reserve counts on screen with enlarged text.
- b09c4b1: Keep simulator unit choices usable with enlarged text.
- b09c4b1: Stop phone section tab labels overlapping with enlarged text.

## 0.128.0

### Minor Changes

- 51a7f9b: Record a missed stratagem, command point or score for an earlier phase. It keeps that phase's limits and is marked as recorded late in battle events and replay.

## 0.127.0

### Minor Changes

- b849af7: Name units and keep private notes on them in your rosters. Nicknames appear beside the datasheet name in copies, variants, text exports, exchange codes, printed packs and battles; notes stay yours unless you share them with people who can open the roster.

## 0.126.0

### Minor Changes

- f1be99d: Lock a finished roster against edits, and duplicate it or create a variant when you want to try changes.

### Patch Changes

- 17be14d: Record Locate and Deny markers, Sensor Sweep removals and Consecrate objectives during battles.

## 0.125.1

### Patch Changes

- 90d0529: Clarify catalogue status dates and account requirements for public tools.
- 90d0529: Clarify roster creation actions with the Create variant label.

## 0.125.0

### Minor Changes

- a1db385: Share a roster as an exchange code or QR code that another player can review and import as their own copy.

## 0.124.2

### Patch Changes

- 0dbc837: Preserve valid weapon choices through attached-unit edits, explain calculation context, and retry failed loadout comparisons.

## 0.124.1

### Patch Changes

- 4d7609d: Explain roster link sharing before publication and clarify private access, frozen roster retention, sealed league access and account deletion.

## 0.124.0

### Minor Changes

- 6a812f0: Stabilize collection and favourite saves, keep roster Add controls responsive, simplify picker guidance, add numeric model counts and a Collection profile tab grouped by faction, and reduce logo hover rotation to 45°.

## 0.123.0

### Minor Changes

- 6aaa456: Record mission unit and objective choices during battles, retain their history through casualties and undo, and track Beacon choices manually.

## 0.122.0

### Minor Changes

- d5cc723: Add a datasheet to a roster, your favourites or your collection, and set its model count, from one Add to button on its page.
- d5cc723: Track your collection on a new Collection page: add datasheets, count their models, and add units you have fielded in battles.
- d5cc723: Heart datasheets as favourites to list them first and filter by them in the unit picker; hearts no longer mark collection ownership.
- d5cc723: Remove the roster's Physical collection dialog; model counts now live on the Collection page.

### Patch Changes

- 37c06fb: Keep datasheets you hearted before favourites existed as favourites, and start everyone's collection empty.

## 0.121.1

### Patch Changes

- 95ff466: Explain weapon, ability, and keyword matches in faction datasheet searches. Identify rules versions in reference roster choices and retain preview or archived unit labels in the simulator.

## 0.121.0

### Minor Changes

- 5033f6d: Find compatible leaders and bodyguards, explain roster limits, and open mission matchups from the builder.

## 0.120.0

### Minor Changes

- f0bc522: Review and explicitly publish public support reports, then follow their GitHub status and replies in the app.

## 0.119.1

### Patch Changes

- 4001ecd: Settle supported final mission awards after both final turns, preserve their battle cap without applying the round cap, and enforce New Orders once per battle.

## 0.119.0

### Minor Changes

- b2d8844: Preview roster points, removed selections and legality before confirming army setup changes.

## 0.118.0

### Minor Changes

- c591b8d: Record physical model quantities and compare shared equipped stock with roster requirements.

### Patch Changes

- c95d74c: Restore faction icons for battles saved with previous roster rules.

## 0.117.0

### Minor Changes

- 81f8352: Print saved and guest rosters with their selected loadouts, attachments, army rules, and stratagems.

  Keep margins around native print pages and treat closing the iOS print sheet as cancellation.

### Patch Changes

- 97828e0: Remove duplicate equipped weapon profiles and show the correct profiles and equipment counts for weapon bundle choices.
- f2f18ec: Keep private league battles out of spectator views and explain who can read saved and frozen armies.

## 0.116.0

### Minor Changes

- fa2ed15: Offer readable and compact roster text downloads and review model counts, missing entries and original points before importing.

## 0.115.10

### Patch Changes

- 30a4af4: Keep the sync banner from flashing during quick online saves.

## 0.115.9

### Patch Changes

- b5b6d3c: Show provisional Custodes codex Leader and Support attachments, base sizes, and Anathema Psykana army-selection rules in the reference and roster builder.

## 0.115.8

### Patch Changes

- da40372: Explain unit-copy pricing tiers on datasheets when the points source omits labels.

## 0.115.7

### Patch Changes

- a36a090: Identify rules versions by release name and date, remove duplicates, show their status as chips with distinct archived and preview markers, and give each version a readable URL with redirects from existing links.

  Keep simultaneous connected battle setup choices from blocking later actions with an offline sync conflict.

## 0.115.6

### Patch Changes

- 9d245fd: Keep faction pages visible during saved-data updates.

## 0.115.4

### Patch Changes

- f8a58bb: Preserve saved roster loadouts, points, and removed choices on their original rules, with a visible notice and optional conversion to current rules.

## 0.115.3

### Patch Changes

- dac6baa: Show dialogs full screen on phones and give them consistent widths on larger screens.
- dac6baa: Keep dialog titles and the Close and Minimize buttons in place while the dialog scrolls.

## 0.115.2

### Patch Changes

- 6c425dc: Retain community source attribution for authored preview points and faction reference content.
- 6c425dc: Keep equipment choices when resizing fixed squad compositions and remove the duplicate composition control.
- 6c425dc: Keep checked unit limits visible in the picker while repricing equipment and model-count edits.
- 6c425dc: Mark rules versions on faction logos with accessible tooltips, retain faction colors, and switch versions from the reference header and compact faction-card menus. Group roster setup selectors in one row, give versions readable faction URLs and let players explicitly convert existing rosters while retaining unavailable choices for correction. Preserve archived rules sources and recorded battle version labels.

## 0.115.1

### Patch Changes

- d4b2883: Preserve finished battle replays and saved tour completion.

## 0.115.0

### Minor Changes

- 3323840: Invite an opponent from the New battle dialog when you have no friends yet, instead of finding only practice opponents there.

## 0.114.0

### Minor Changes

- 83970e5: Save rosters, battles, preferences, and queued actions offline and synchronize them when connectivity returns.

### Patch Changes

- ff70bb7: Wait for queued player commands to synchronize before automatically settling a connected battle turn.

## 0.113.0

### Minor Changes

- a2a5e64: Choose preview codex rules per faction while preserving released rules, saved lists, and codex history.

## 0.112.3

### Patch Changes

- 3d5e691: Show Insane Bravery in the Command phase, including in saved battles.

## 0.112.2

### Patch Changes

- 8980206: Correct mirrored terrain walls and roofs, use layout-specific objectives, and place terrain letters beside their matching parts.

## 0.112.0

### Minor Changes

- 00d7a78: Import a first army before signing up, clarify roster setup and limits, add friend invite QR codes, improve dates and printed lists, and add practical guides to preparing for a first game, army roles and scoring.

### Patch Changes

- 00d7a78: Keep Home signed in after email authentication when multiple application tabs are open.
- a6289ef: Give player guides illustrated overviews, image previews and compact reading sections, with shorter advice for first games, army roles and scoring.

## 0.111.6

### Patch Changes

- 1a91197: Show Titanicus Traitoris army rules from BSData when Game Datacards has no faction file.

## 0.111.2

### Patch Changes

- 5b1a6bf: Handle Watch background updates and adapt the battle clock to the dimmed display.

## 0.111.1

### Patch Changes

- 99bfc6c: Clarify unavailable battle setup sections, highlight the viewed section, and keep secondary choices and unit lists visible.

## 0.111.0

### Minor Changes

- 3060d4a: Add an Apple Watch battle companion for scores, objectives, and personal reminders.

## 0.110.0

### Minor Changes

- 9101ae3: Add a datasheet to a roster or open it in the simulator from its reference page.
- 9101ae3: Start a roster from a detachment page with that detachment already chosen.
- abac057: Set up a battle on one page, with defaults folded away and a bar showing what is left before Start battle.

### Patch Changes

- ff88cac: Add illustrated worked examples to player guides.

## 0.109.0

### Minor Changes

- a3d1e83: Invite spectators who have not played yet to build an army or start their own battle.

### Patch Changes

- 75a3327: Keep a roster built without an account on this device across tabs, reloads and sign-in, and ask before saving one found after signing in later.
- 2073e6e: Limit The Sanguinor, Chaos Spawn and Khorne Lord of Skulls to the copies their datasheets allow.
- 2fcac78: Restore live updates, search, and offline downloads in Firefox before 124 and Safari before 17.4.
- f3cac0a: Pick a squad's model count directly from its number in the roster editor and simulator instead of stepping one model at a time.
- 3335099: Disable reserve and transport choices the battle would refuse, and show why beside each one.

## 0.108.1

### Patch Changes

- 7443cdb: Use BSData's Space Marines codex for every Space Marines chapter, with its unit limits.
- 7443cdb: Keep Space Marines lists saved on the provisional codex, moving their units, detachments, matching options and Warlord to the current data.
- 7443cdb: Offer Invader ATVs to Space Marines lists again.
- 032d75f: Offer Ceramite Sentinels only to Imperial Fists lists.
- 7443cdb: Give Sammael and Suboden Khan the Mobile keyword their datasheets print.

## 0.108.0

### Minor Changes

- 934efb5: Add public player guides.

## 0.107.6

### Patch Changes

- a362534: Give fixed-count units wider selectors and show roster selection first in battle setup.
- a362534: Restore secondary mission details in battles saved before the catalogue ID update.
- 081e683: Open secondary mission pages from links shared before the October data update.

## 0.107.2

### Patch Changes

- c31baa3: Load the current application on connected launches to avoid an immediate refresh prompt.

## 0.107.1

### Patch Changes

- 24ccff3: Unlock allied units from the current roster, explain exhausted limits, and preserve guest drafts through saving.

## 0.107.0

### Minor Changes

- 07a4313: Choose from all saved rosters and infer an even battle format from their saved sizes, while preserving league presets.

## 0.106.0

### Minor Changes

- b65ab69: Add leaders and support to combat simulations with their weapons, wounds, supported abilities and loadout odds, and optimize the whole unit’s equipment.

## 0.104.0

### Minor Changes

- 20303de: Add round alerts, first-round restrictions, any-phase triggers, and reminders for abilities used while destroyed.

## 0.103.0

### Minor Changes

- 242518f: Save application data automatically so Home, rosters, battles and the complete public reference open immediately on the web and in the installed iPhone app. Keep the normal interface and refresh saved data in the background without resetting navigation. Clear private saved data on sign-out and account changes.

## 0.102.3

### Patch Changes

- d83eaed: Simplify the web release notice to a compact message and manual refresh action above mobile navigation.

## 0.102.2

### Patch Changes

- 1848932: Offer an optional refresh when a new release is ready.

## 0.102.1

### Patch Changes

- 7dc5c2f: Match the iOS status and home-indicator backgrounds to the application bars.

## 0.102.0

### Minor Changes

- 8df0ad9: Show the chosen battlefield in older battles and open its map from the battlefield name in trackers and replays.

## 0.101.1

### Patch Changes

- e7237da: Restore missing weapon and granted ability rule tooltips across datasheets.

## 0.101.0

### Minor Changes

- 8f17481: Show aligned mission scores with current-round emphasis, compact completed missions, and a remaining-deck reference.

### Patch Changes

- 19ed05e: Show published battlefield names on battle cards and remove the repeated completed label.

## 0.100.0

### Minor Changes

- 3500c10: Browse public battles without signing in.

## 0.99.0

### Minor Changes

- 4012673: Expand the getting started guide with combat simulation, army tools, and battle setup and play.

## 0.98.5

### Patch Changes

- bb5c2bf: Restore selectable thunder hammers and storm shields for Terminator Assault Squads.

## 0.98.4

### Patch Changes

- 9c982a6: Fix loadout optimization for squads with mixed exclusive weapon choices.

## 0.98.3

### Patch Changes

- 4a0745f: Clarify supported features and distinguish signed-out homepage sections with subtle color accents.
- c4be00a: Prompt for standard secondary mission payouts, including Cleanse and Centre Ground, at the end of the turn.

## 0.98.0

### Minor Changes

- 18cc39d: Show combined shooting and melee losses and the exact chance to destroy the target.

### Patch Changes

- a719dab: Lead with the combined combat result even when a phase has no enabled attacks, group phase details, buffs, and manual modifiers, and offer progressive loadout optimization against the selected defender. Clarify which outcome makes a loadout best, show finer small kill chances, and remove the simulator’s Mathhammer label.
- bb098fb: Keep battle feeds readable when a page is missing during refresh.

## 0.97.1

### Patch Changes

- 8bd0dfe: Omit the comma in the home greeting when a sign-in provider supplies no name.
- 8bd0dfe: Make the account-creation switch easier to find with a compact outlined button.

## 0.97.0

### Minor Changes

- 8292689: Calculate combat odds exactly instead of sampling them, so estimates appear instantly and match on every device.
- 69f7097: Show each weapon option's and profile's odds against the selected defender in the simulator's loadout editor, with the strongest option of each choice marked.
- 6ed424c: Keep the simulator's units, loadouts, and modifiers in its link, so a reload or a shared link reopens the same calculation.

## 0.96.3

### Patch Changes

- 7579a8c: Match equipped weapons to their source profiles and preserve unit-level equipment through combat simulation.

## 0.96.2

### Patch Changes

- bf0c3bb: Combine battle army inspection, loadouts, and casualty controls in one view, fill the phone screen with army and combat dialogs, and export only the chosen force disposition.

## 0.96.1

### Patch Changes

- 04e1966: Restore enlarged battlefield maps and add terrain placement arrows, objective labels, and Colosseum setup measurements.

## 0.96.0

### Minor Changes

- aeb846f: Redraw the logo, favicon and app icons as the King of the Colosseum arena seen from above.

## 0.95.0

### Minor Changes

- f519799: Show each datasheet's recent points changes on its page, with a link to the rest of its faction's data updates.
- f519799: Unfurl shared datasheet and detachment links with their own card, naming the unit's faction and points.

## 0.94.0

### Minor Changes

- 58256ae: Restyle Praetorium as a plotting table: slate surfaces, field-green actions, red and blue sides that stay distinct for colour-blind players, Chakra Petch headings over Sofia Sans interface text, and scores set as plotted figures.

### Patch Changes

- 464f490: Stop the desktop header from scrolling sideways just above 1000 pixels wide by showing the Praetorium name from 1100 pixels.
- 7ff15b2: Shorten the Force dispositions tile on the More page to Dispositions.

## 0.93.1

### Patch Changes

- 43b2470: Show two equally tall battle cards per row on desktop.

## 0.93.0

### Minor Changes

- 190844f: Show a supporter badge on the profile of a player whose linked GitHub account publicly sponsors the project.
- 60b99eb: Lead visitors from the home page to the builder without an account, list everything that is free, and offer importing from New Recruit or BattleBase.

### Patch Changes

- 60b99eb: Link GitHub Sponsors from the home page, and open the sign-up form from its account buttons.

## 0.91.0

### Minor Changes

- 86317ad: Let players minimize battle dialogs to inspect the tracker without losing their choices.

## 0.90.1

### Patch Changes

- fdfa5af: Preload complete battle replays and enable phone timeline dragging.

## 0.90.0

### Minor Changes

- 3b1abc3: Show how long each phase and turn took beside the battle events that end them.
- 3b1abc3: Show how long each side has taken on its latest turn and the current phase, with a shared pause for breaks and a round-by-round and phase-by-phase review once the battle is finished.

## 0.89.1

### Patch Changes

- e084a67: Share the Strategic Reserves points allowance across allied armies.

## 0.89.0

### Minor Changes

- 065036b: Support eleventh-edition Space Marines catalogue data and detachment migration.

## 0.88.1

### Patch Changes

- 4eea507: Show which units can take each detachment unit upgrade.

## 0.88.0

### Minor Changes

- cd533c7: Add friends to an open league event directly, without waiting for them to ask to join.
- cd533c7: Choose a new league's battle format and points when creating it, and enter yourself as a player straight away so you can seal your list.
- cd533c7: Show a league event on one page for everyone, with the organizer's controls beside the entrants instead of on a separate Organize tab.
- cd533c7: Edit a league's settings and its current event's format in one form, saved together.

### Patch Changes

- cd533c7: Pick a league's earlier events from a one-line menu in the header instead of a row of buttons.
- cd533c7: Show a league's invite link as one card that copies or shares it.

## 0.87.0

### Minor Changes

- 16ffcde: Show the battle timeline while watching a live battle, so spectators can scrub back to earlier events.

### Patch Changes

- 16ffcde: Open a finished battle as its replay.
- 08e6b25: Remove Finish early; a battle now ends after its last turn or by concession.

## 0.86.2

### Patch Changes

- 5864c5a: Keep the battle replay timeline above the tabs in the mobile app.

## 0.86.1

### Patch Changes

- 30b5faf: Show roster variants, their changes, points and legality when choosing a roster for a battle or a league.

## 0.86.0

### Minor Changes

- 2996eee: Create roster variants that are numbered, grouped under their base list, show what they change, and switch from the roster editor.

### Patch Changes

- 2996eee: Keep optional rules and a borrowed detachment when duplicating a roster from the library, and start the copy at the default visibility.
- 2996eee: Show a roster's points beside its name on phones, with its visibility in the details line.

## 0.85.0

### Minor Changes

- 9e01f2a: Improve mission browsing, roster context, and battle setup.

## 0.84.0

### Minor Changes

- 1a6a7b9: Add a page for each force disposition, listing its primary missions against every opposing disposition and the detachments that offer it, linked from the roster header and the mission pack table.

## 0.83.0

### Minor Changes

- 3d25ea6: Choose the visibility and battle size new rosters and battles start with from your profile.

## 0.82.3

### Patch Changes

- b8eac43: Mark rosters with too many copies of a unit as illegal and block adding more copies.

## 0.82.1

### Patch Changes

- e0bba17: Keep a unit that was just added to a saved roster, instead of briefly removing it and saving the roster without it.
- 4fccda4: Keep players signed in while they turn on an authenticator app, so the recovery codes stay on screen until they are saved.

## 0.82.0

### Minor Changes

- 34bcdd5: List each faction's points and datasheet changes on its own data updates page, linked from the faction page.
- 8e76de6: Rank the leaderboard and profile places by a rating that weighs who each player beat and rates allies as one side.
- b639f0a: Replay finished battles event by event on a fixed timeline and show monthly personal performance by detachment, mission, and battle size.

### Patch Changes

- 9598ca4: Show each player's average victory points a battle on the leaderboard instead of their total.

## 0.81.0

### Minor Changes

- f5e5b73: Show each player a single next step for a league event, with their progress from joining to playing.
- f5e5b73: Split a league event into an Organize tab for its organizer and an Event tab for players, with a reveal checklist that names who is still holding the reveal up.
- f5e5b73: Accept waiting league requests together, let turned-away players back in, and pair doubles teams by ticking two players.

### Patch Changes

- f5e5b73: Change a league event's format and player limit together, and set up the next event, without leaving the league page.
- f5e5b73: Name league formats the same way on league cards and event pages, and open revealed league rosters in the same tab.
- f5e5b73: Ask for a second press before sealing a league roster.

## 0.80.1

### Patch Changes

- 8ca93d2: Save automatic roster names.

## 0.80.0

### Minor Changes

- 4d79f6f: Show an update warning when a saved roster differs from its sealed league roster.

## 0.79.3

### Patch Changes

- c975332: Show recently updated rosters first, keep finished games in the main home column, show active practice games to their player, and remove the duplicate data updates link from the home roster shelf.

## 0.79.2

### Patch Changes

- 51082af: Make faction and roster navigation faster.

## 0.79.1

### Patch Changes

- 05ab5e5: Reduce document delays on home, battle, profile, leaderboard, and roster pages.

## 0.79.0

### Minor Changes

- 84d76b2: Show battle dates, let players reject friend requests, and keep routine roster legality out of home-page actions.
- 84d76b2: Let players exclude individual weapons and apply shared or phase-specific combat modifiers without duplicate imported units in the simulator.

## 0.78.2

### Patch Changes

- 715f374: Keep the home page's game shelves close together when the activity column is taller.

## 0.78.1

### Patch Changes

- 2b2d695: Keep roster sorting responsive and guest builders within the mobile viewport.

## 0.78.0

### Minor Changes

- b8c2801: Try the roster builder without an account and sign up to save the list.

### Patch Changes

- 7382101: Keep the roster library in the order you last sorted it.

## 0.77.0

### Minor Changes

- 61dd47e: Redesign the home page: a signed-in dashboard with what is waiting on you, your rosters and recent results, and a landing page for visitors.

### Patch Changes

- 7b2de63: Keep practice games from emptying the public and friends battle lists on the home page.

## 0.76.1

### Patch Changes

- bcf1aa8: Capitalize weapon profile modes, show each configured unit alert, and restrict roster section collapsing to chevron controls.

## 0.76.0

### Minor Changes

- 8d19840: Simulate attacks against units whose models have different defences, with a choosable allocation order.
- 9c9eb4d: Add characteristic, critical, ability and defender adjustments to the combat simulator conditions.
- 8d19840: Keep combat simulator results in view while adjusting rules and conditions.
- 8d19840: Pick a combat simulator unit from one search grouped by faction.

### Patch Changes

- 61bda9e: Show weapons whose profiles the catalogue links rather than writes out, such as the Celestian Sacresants' bolt pistols.
- 8d19840: Reopen a unit search at the current selection.
- 8d19840: Keep combat simulator conditions as extras that never override a unit's own rules.
- 8d19840: Show every combat simulator condition as a visible choice in one shooting and melee table.
- 8d19840: Move the combat simulator swap button beside the Attacker heading so it stays still when pressed.

## 0.75.0

### Minor Changes

- 1381249: Browse data updates as collapsible rows that open onto every change, with a link to each faction's changes.

## 0.74.0

### Minor Changes

- 0cdcef0: Flag saved lists that are over their limit or not legal under the current army data, and name the data changes that reached each one since it was saved.
- 0cdcef0: See what each army data update changed on the new Data updates page.
- 5a19ddb: Show a scoreboard or summary card when a watchable battle, shared list, or player profile link is pasted into a chat.
- 9088a58: Send mobile notifications when someone starts a battle with you, answers a friend request, or accepts, reveals, or unseals your league entry.

## 0.73.0

### Minor Changes

- 789a9e1: Show the stratagems, command points, secondary cards, primary missions and opposing armies behind a player's record on their profile.

## 0.72.0

### Minor Changes

- d3a487b: Compare unit loadouts in a shared combat simulator from the public page, roster editor, and battles, with buffs, live casualties, and damage and kill probabilities.

## 0.71.2

### Patch Changes

- 55518cf: Show independently customizable weapons as separate roster loadout controls.
- 802a1d4: Prioritize rosters in mobile navigation and make onboarding an optional profile item.

## 0.70.1

### Patch Changes

- d2c0f9a: Omit narrative flavour text from stratagem descriptions.

## 0.70.0

### Minor Changes

- 4292f78: Add a resumable getting-started guide that walks you through roster building, battles, leagues, the game reference and the community pages, and counts the tasks you have already done.

### Patch Changes

- ad7460b: Open your profile from the account menu, and reach battles, rosters and leagues from the main navigation instead.
- ad7460b: Choose who can watch your battles from a Privacy box beside the rest of your profile settings.

## 0.69.0

### Minor Changes

- 3b506de: Invite a new player with a one-time link that connects you as friends after they join.

### Patch Changes

- cc2e7bf: Keep roster loadout and model counters accurate during consecutive presses.

## 0.67.2

### Patch Changes

- 13f59e8: Let either player choose both sides' secondary missions, keep optional paired missions when drawn, and leave mobile navigation available during battle prompts.

## 0.67.1

### Patch Changes

- c7711a2: Allow end-of-turn scoring to record every active mission together.

## 0.66.7

### Patch Changes

- 332b8dd: Show full detachment names on the phone faction page, with their chips beneath.
- d2405c7: Find players on the friends page by typing a name, instead of listing every account on the instance.
- 332b8dd: Remove the duplicate "Secondary mission" label from the mission card dialog.
- 332b8dd: Say when a faction has no units to pick instead of claiming to still be loading.
- 6af4c07: Give every dialog, menu, page header and small label the same treatment across the interface.
- 332b8dd: Draw every tooltip as the same small raised panel.

## 0.66.6

### Patch Changes

- 866dc1d: Show the correct terrain reference labels on affected battlefield maps.

## 0.66.5

### Patch Changes

- 7c2f3e1: Open a feedback or other external link in an in-app browser when the device has no external handler, instead of showing a dead-end alert.

## 0.66.4

### Patch Changes

- ad52c7b: Open shared rule links at the rule they name on small screens.

## 0.66.3

### Patch Changes

- a6d8e8f: Keep mobile web navigation available while viewing a roster unit.

## 0.66.1

### Patch Changes

- 9ff3c7b: Retry automatic mission card preparation after another device updates battle setup.
- 23a659b: Use shared mobile utility and navigation bars with remembered tabs and a dedicated More page.

## 0.66.0

### Minor Changes

- ec3e442: Add configurable multi-phase reminders for roster rules and active mission actions, with scoped dismissals and battle controls.

## 0.64.4

### Patch Changes

- aa42b17: Keep the unit sidebar visible in an owner's roster View mode.

## 0.64.3

### Patch Changes

- 9756548: Count a character inside the unit it joined in the roster header, matching the library.

## 0.64.2

### Patch Changes

- cca1d67: Draw the table a detachment rule rolls on instead of printing its markup.

## 0.64.1

### Patch Changes

- 83a9386: Show the unit composition and model count correctly on datasheets whose source writes the composition as an HTML list.
- 83a9386: Read the underline the catalogue writes around a word in an ability instead of printing the tag.

## 0.64.0

### Minor Changes

- 300e815: Read every roster on one screen: a fielded list keeps its points total, unit count, actions and full datasheet link, and View mode now shows an owner exactly what another reader sees.

## 0.63.4

### Patch Changes

- 21f3076: Simplify model loadouts with default wargear first, stable visible weapon profiles, source instructions, formatted rule tooltips, and clearer controls that preserve required weapons.

## 0.63.3

### Patch Changes

- 39fb1e3: Fix missing primary mission scoring text and secondary objective cards after the rules source renamed its card file.

## 0.63.2

### Patch Changes

- f202add: Show the wargear a model carries alongside the single item its loadout group offers, such as a Pathfinder Shas'ui's pulse carbine and pistol.
- f202add: Count a paired loadout once on a unit card, so a Boyz mob shows one Nob's weapons rather than two.
- f202add: Count the weapon an ordinary squad member carries when their squadmates swapped theirs, so a Tactical Squad shows ten boltguns rather than one.

## 0.63.1

### Patch Changes

- f7e8607: Show each Agile Manoeuvre under the Aeldari Battle Focus ability with its trigger and effect.
- f7e8607: Offer the enhancements a detachment gates on the model carrying them, such as the Aeldari Warhost's.

## 0.63.0

### Minor Changes

- 6ef4d10: Let league allies read each other's sealed lists before the event reveals.

### Patch Changes

- 6ef4d10: Recede the league organizer's remove control to a muted icon.

## 0.62.0

### Minor Changes

- 57b9b2c: Share unlisted roster links from the roster screen.

### Patch Changes

- 6ffde79: Correct terrain setup rulers to use the intended corners and whole-inch labels.
- 3f2b45e: Show mission card instructions, including which units can be chosen when a card is drawn.
- a099830: Remove a special weapon without arming a squadmate with it: the model goes back to the squad's ordinary loadout.
- f9413c6: Fade the roster header's faction line where it holds a detachment too wide to show, so a narrow screen shows there is more to scroll to.

## 0.61.8

### Patch Changes

- ea93795: Keep detachment-only abilities off standalone datasheets.

## 0.61.7

### Patch Changes

- e97c341: Open a mission immediately while its terrain layouts load.

## 0.61.6

### Patch Changes

- 7b62124: Enforce the Strategic Reserves points limit during battle setup.

## 0.61.5

### Patch Changes

- 588e0e9: Show end-of-battle mission payouts without battle-round or turn qualifiers.

## 0.61.4

### Patch Changes

- 8eaf278: Keep available wargear abilities on standalone datasheets.

## 0.61.3

### Patch Changes

- affb854: Keep optional wargear abilities visible on public datasheet reference pages.
- affb854: Show dense terrain in green and light terrain in yellow across battlefield layouts.
- affb854: Correct battlefield objective markers and include all supplied terrain placement measurements.

## 0.61.2

### Patch Changes

- 330d2d0: Keep wound-management controls stable while casualty changes save.
- 42a1a6c: Separate detachment-specific datasheet abilities from intrinsic abilities and show them under their detachments.
- 158383f: Show only selected wargear abilities and apply their granted abilities to unit profiles.

## 0.61.1

### Patch Changes

- 059bd9c: Let either player continue battle setup without waiting for the other player to open the secondaries screen.

## 0.61.0

### Minor Changes

- 25ba448: Say why a roster import could not match a name: the faction a datasheet actually belongs to, the closest name the catalogue does have, the detachment an enhancement comes from, and the squad sizes a datasheet fields.
- 25ba448: Import the rest of a roster when one of its units names a datasheet the faction does not have, instead of refusing the whole list. The units that will not arrive are named with the rest of what could not be placed, in the dialog that asks before the list is saved.
- 25ba448: Remove `.ros` and `.rosz` roster file import. Roster import now reads Praetorium, BattleBase and New Recruit text exports only.

## 0.60.2

### Patch Changes

- 776207b: Report a roster that holds more enhancements than its battle size allows, two at Incursion and four at Strike Force.

## 0.60.1

### Patch Changes

- 1f4f9a8: Limit an Incursion roster to two of each datasheet, and four of a Battleline or Dedicated Transport, instead of the Strike Force allowance.
- 1f4f9a8: Report how many of a datasheet a roster may hold for units the catalogue composes itself, which covers most datasheets.

## 0.60.0

### Minor Changes

- 0bc3cc9: Let a league organizer unseal one revealed roster so that entrant can submit a corrected list.

## 0.59.0

### Minor Changes

- 35d19a5: Name the choices a roster import cannot give a unit — equipment, enhancements, Warlord, squad size and attachments — and ask before saving, instead of quietly leaving the datasheet's own build in their place.

## 0.58.1

### Patch Changes

- b328da1: Allow separate loadout slots to select the same weapon without violating their individual limits.

## 0.58.0

### Minor Changes

- 9a82453: Use native application bars around the complete responsive battle, roster, catalogue, rules, and league interface.

## 0.57.2

### Patch Changes

- 1de9c64: Show player avatars on the leaderboard and in player choices.

## 0.57.1

### Patch Changes

- 41f675d: Fix a loadout option that could not be put back once a composite weapon replaced it.

## 0.57.0

### Minor Changes

- 2200221: Add a leaderboard of players, ranked by wins and win rate, with a table per faction ranking the players who field it.
- 2200221: Open every player's profile to anyone, with their leaderboard rank, a service record of how they play, and the battles a reader may watch them in.
- 2200221: Add a public roster option, which lists a saved list on its owner's profile as well as behind its link.

## 0.56.0

### Minor Changes

- ea994d7: Read the core rules, Chapter Approved, the event companion and Combat Patrol, browsable by section and searchable by rule name or number.

## 0.55.0

### Minor Changes

- a83f758: Search detachments by name or force disposition when creating or editing a roster.
- a83f758: Name a list from what is in it — `HL 1K - C'tan & Hexmark` — instead of repeating the faction and detachment shown beside it, and never overwrite a name you typed.

### Patch Changes

- a83f758: Build the required weapon choices nested deep inside a datasheet, so Firestrike Servo-Turrets, Devastator Squads and Sentinels arrive armed and legal.
- a83f758: Say that a Judiciar must be attached to a Bodyguard unit instead of reporting an unanswerable shortfall.
- a83f758: Field the full squad when a datasheet reserves a sergeant, so a Terminator Squad arrives with five models rather than four.
- a83f758: Take the cheapest option for a mandatory wargear choice, so a Leman Russ, Ravager or Achilles Ridgerunner starts at its Munitorum base cost.

## 0.54.0

### Minor Changes

- deb571d: End a battle on the winner's name, picture and score, with confetti on the winning players' own devices.
- deb571d: Ask only who can see and join a new league, and set its battle format and points on the league page until the first roster is sealed.

### Patch Changes

- deb571d: Score the battle ready bonus as the battle begins, the way the current rules pay it.
- deb571d: Delete a battle from the home page, without opening it first.
- deb571d: Drop the note repeating that a finished battle is finished.
- deb571d: Show a detachment enhancement's ability on a datasheet only once the enhancement is taken.
- deb571d: Accept the organizer into their own league without asking them to approve themselves.
- deb571d: Draw the league event list as buttons with their status beside them, and say what a league page means in the words a player uses.
- deb571d: Let a league organizer change visibility and joining after players have joined, accepting the waiting requests when joining becomes automatic.
- deb571d: Keep the application's Back action and the iOS back gesture inside the open tab, and offer neither at the bottom of one.
- deb571d: Open every battle from one New battle button, and say clearly when a league event is waiting for that matchup.
- deb571d: Shorten the battle events panel so the rest of the battle facts stay in view.

## 0.53.8

### Patch Changes

- 06262a1: Show unconditional weapon abilities granted by a detachment on eligible units.

## 0.53.7

### Patch Changes

- cc1cf40: Keep the unit picker available when opening saved 500-point King of the Colosseum rosters.
- cc1cf40: Count attached datasheets as one unit in roster summaries.

## 0.53.6

### Patch Changes

- 72f16b4: Keep loadout choices available when another current selection temporarily closes them.

## 0.53.5

### Patch Changes

- 8d8b7af: Allow squads to take their full special weapon allowance.

## 0.53.4

### Patch Changes

- 9def47d: Allow squad-size rules to increase the number of special weapons available.

## 0.53.3

### Patch Changes

- fa1ab0c: Show every available detachment rule, including keyword definitions.

## 0.53.2

### Patch Changes

- 289dd2a: Show each officer's Orders limit and eligible units on its datasheet.

## 0.53.1

### Patch Changes

- 1e9dca9: Allow bodyguard units to accept every Leader permitted by their catalogue.

## 0.53.0

### Minor Changes

- a9609f9: Let spectators read battle missions, allow seated players to record another player's concession, and keep shared rosters stable while they load.

## 0.52.1

### Patch Changes

- 003bdba: Offer a Mark of Chaos only in the detachment that grants one, and require it there.

## 0.52.0

### Minor Changes

- 676107c: Show the action each mission asks a unit to perform, named by the side that may perform it.

## 0.51.3

### Patch Changes

- 75aa8be: Put stratagems first on stacked battle panels and tuck resolved secondary missions behind a reveal control.

## 0.51.2

### Patch Changes

- c7e4628: Hold a Wolf Scouts import to the six or twelve models the datasheet offers.

## 0.51.1

### Patch Changes

- 64cf604: Keep long roster names, army rows and battle cards inside the screen on a phone.
- d28ae30: Return to the roster, not the screen before it, when a tab reopens a unit.

## 0.51.0

### Minor Changes

- 21e9c10: Split the signed-in home page into your live games, the games you have played, your friends' games and everybody else's, in that order.

## 0.50.7

### Patch Changes

- 988fbcc: Keep battle controls reachable, preserve native tabs, enlarge mobile dialog actions, and recover stale live battles.

## 0.50.6

### Patch Changes

- 351694f: Keep shared battle setup stable when both players act together.

## 0.50.5

### Patch Changes

- cc572e7: Keep mobile rosters with switched-off format restrictions inside the screen.

## 0.50.4

### Patch Changes

- ce6d6c3: Show each core stratagem only once when sources punctuate its name differently.

## 0.50.3

### Patch Changes

- de2c4d4: Keep undo available in every live battle action dialog.

## 0.50.2

### Patch Changes

- fa61429: Show clear battlefield and replacement-draw names in battle logs, count attached datasheets as one unit, and keep unit panes within phone screens.

## 0.50.0

### Minor Changes

- 1da2457: Return each application tab to the screen you left it on, so moving between a roster and a datasheet keeps both in place.

### Patch Changes

- fb8d39f: Keep the application tabs reachable while a unit is open in the roster editor, instead of covering them.

## 0.49.1

### Patch Changes

- 512b657: Open a link that asks for a new tab in the application itself rather than in a window stacked on top of it.
- d760b77: Stop iOS zooming the page, and pushing the header and tabs off screen, when you tap a search or text field.

## 0.48.1

### Patch Changes

- 986a8cf: Show the correct characteristics for roster units with optional models.

## 0.48.0

### Minor Changes

- 9a95d8d: Add native phone and tablet navigation, keep back actions in a stable location, and prevent signed-in players from returning to sign-in.

## 0.47.3

### Patch Changes

- 48417c5: Wrap every featured battle player name onto its own line on narrow screens.

## 0.47.2

### Patch Changes

- 97299b6: Make homepage capability cards fully clickable and speak directly to players.

## 0.47.1

### Patch Changes

- 0b4cce9: Keep catalogue datasheets and rules aligned when upstream names differ.

## 0.47.0

### Minor Changes

- 9acb549: Show player avatars, factions, faction marks, and detachments on battle cards, and keep practice games off the home page.

## 0.46.0

### Minor Changes

- 0ed0f4e: Show live activity on the home page: your own table, your friends' battles, and every battle anyone may watch, newest first and including finished ones so you can watch a game or read back through it. Choose who can watch your battles from your profile.
- 0ed0f4e: Every battle now names its whole table when it is created. Battle links no longer offer an open seat to join, so a link only ever opens a battle to read or watch.
- e256c5c: Colour every battle by the stage it is at, open player profiles to anybody, and land on the home page after signing in.

## 0.45.0

### Minor Changes

- 18344cd: Add optional rules, chosen from their own dialog: homebrew a battle size can be played with, off unless a roster picks it. King of the Colosseum offers a borrowed disposition, which spends the detachment points its own detachment leaves unspent to play another detachment's Force Disposition — the disposition alone, never that detachment's rules, enhancements or stratagems.
- 18344cd: Offer King of the Colosseum at one 600-point size, named without a size suffix. Lists already saved at 500 points keep their King of the Colosseum construction rules and play as before.

### Patch Changes

- 18344cd: Report a King of the Colosseum unit at the Toughness cap as unverifiable when an enhancement or attached leader could raise it, instead of accepting a list the format forbids.

## 0.44.0

### Minor Changes

- 3333692: Override a battle size's army construction restrictions per roster, so a King of the Colosseum list can be built with Epic Heroes or any other restriction switched off.
- 3333692: Warn before a roster that has switched off any of its battle size's restrictions is brought to a battle or sealed into a league, and show what it waives to everyone at the table.

### Patch Changes

- 8c2b62e: Show each weapon keyword only once when a detachment grants one it already has.
- 3333692: Remove the picker's Hide allies filter; allied datasheets already sit at the bottom of the book.

## 0.43.12

### Patch Changes

- ade1c36: Add a public data source and licence notice.

## 0.43.11

### Patch Changes

- d2a94e6: Open datasheets and other new-window actions from the mobile application.

## 0.43.10

### Patch Changes

- d968a60: Finish native sign-in immediately after returning from the provider.

## 0.43.9

### Patch Changes

- e9c37b3: Fix signing in from the app.

## 0.43.8

### Patch Changes

- 0950173: Fix signing in from the app.

## 0.43.7

### Patch Changes

- 3d14898: Refresh the signed-in mobile interface after authentication finishes.

## 0.43.6

### Patch Changes

- b0c82d4: Refresh the mobile interface when social sign-in completes.

## 0.43.4

### Patch Changes

- 383c42c: Refresh the mobile interface immediately after social sign-in.

## 0.43.3

### Patch Changes

- ee2dd54: Fix social sign-in from the app.

## 0.43.2

### Patch Changes

- c81ee21: Finish native sign-in after returning from the provider.

## 0.43.1

### Patch Changes

- 8d31b7d: Allow Apple and Google sign-in to finish when returning from the native system authentication session.

## 0.43.0

### Minor Changes

- 6abc485: Add store-ready iOS and Android applications with native battle integrations and Sign in with Apple.

## 0.42.8

### Patch Changes

- 36370bd: Use consistent mission addition markers and preserve chosen specialist loadouts when another specialist is added.

## 0.42.7

### Patch Changes

- 02c441c: Allow Plague Surgeons to lead Plague Marines and cap specialist loadouts by the selected squad size.

## 0.42.6

### Patch Changes

- e0b7c9f: Highlight only the weapon keyword added by a roster rule.

## 0.42.5

### Patch Changes

- fc89e76: Clarify alternative and additional mission objectives and omit mission flavor text.

## 0.42.4

### Patch Changes

- ce0deae: Fix secondary mission redraws, New Orders, turn undo, and command-point grants.

## 0.42.3

### Patch Changes

- 4e3ba47: List current detachments and enhancements from Game Datacards.

## 0.42.2

### Patch Changes

- ac307bd: Recover native social sign-in safely after the web renderer or application restarts.

## 0.42.1

### Patch Changes

- 0736263: Restore exact battlefield terrain from the current Battlemaster references.

## 0.42.0

### Minor Changes

- deeec32: Open shared Praetorium links in the mobile app and refresh battles after returning to it.

### Patch Changes

- e002f8e: Use Game Datacards points and force dispositions for army construction.

## 0.41.3

### Patch Changes

- a91e28a: Keep mandatory wargear and unit size intact when equipping independent model upgrades.

## 0.41.2

### Patch Changes

- cafae13: Show squad champion wargear correctly, keep loadout edits responsive while pricing, and link same-named datasheets to their own factions.

## 0.41.1

### Patch Changes

- db56725: Show stable skeletons while page data loads and keep touched rule tooltips open.

## 0.41.0

### Minor Changes

- ea4c473: Complete native social sign-in and let players delete their accounts.

## 0.40.4

### Patch Changes

- 392b01a: Collapse a weapon's firing modes and casing variants to one search result, so a match chip names the weapon you searched.

## 0.40.3

### Patch Changes

- add6272: Speed up roster pricing so the list builder responds faster on each edit.

## 0.40.2

### Patch Changes

- 1adb870: Keep faction datasheet navigation from briefly showing an error.

## 0.40.1

### Patch Changes

- b4f5a0d: Allow size-limited specialist weapons and hide unselected detachment upgrades.

## 0.40.0

### Minor Changes

- 519669f: Duplicate another player's shared roster into your private rosters.
- 0efb506: Import Praetorium Games Workshop roster text and preserve repeated unit attachments.

### Patch Changes

- 05350f6: Fix pre-battle rules, command-point feedback, reliable mission scoring prompts, round progression, mission details, casualty controls, and weapon readability.

## 0.39.7

### Patch Changes

- 2abd934: Hold the loadout's counters while a price is still being worked out, so a quick second press cannot divide a squad the roster no longer holds.
- 2abd934: Find a datasheet by any weapon it can take, and stop listing its detachment's enhancements as if they were its abilities.

## 0.39.6

### Patch Changes

- 8a39608: Name stratagems as their cards print them instead of title-casing the rules dataset's capitals.

## 0.39.5

### Patch Changes

- 3047147: Draw every weapon and model card from the community catalogue alone, so a loadout no longer lists a weapon twice, under another faction's name, or with a stale spelling from a second dataset.
- 3047147: Read every rule description from Game Datacards, matched by name to the rules dataset, and give every Codex chapter its army rules.
- 3047147: Allow a faction's own datasheets through an army rule that bans another codex's version of them, such as a Black Templars Impulsor.
- aeaeea7: Stop listing a model's default weapon set beside the alternative that replaced it, so a Cadian sergeant with a bolt pistol no longer also shows a laspistol.

## 0.39.4

### Patch Changes

- 251038b: Show battle actions for revealed leagues created before event formats were stored.
- 247c2e1: Validate Warlords when entrants seal league rosters and place roster actions before event history.

## 0.39.3

### Patch Changes

- 9823cbd: Direct eligible league matchups through their event before starting a casual battle.
- eea3629: Share every live mission prompt across seated devices.

## 0.39.2

### Patch Changes

- 7f0b23c: Let battle spectators open player profiles, faction and detachment references, and frozen rosters.

## 0.39.1

### Patch Changes

- fc305e5: Show both sides during secondary setup and settle mandatory tactical cards without waiting for another device.

## 0.39.0

### Minor Changes

- 75c4333: Let every league add another event after revealing the current one.
- 6af78a7: Let players select the exact tactical secondary missions they draw.

### Patch Changes

- 46c2dea: Restore missing tactical draws and primary scoring prompts in running battles.
- d1eb804: List a character and the unit they joined as one unit when setting reserves, and hold them back together.
- 10769b1: Open rule tooltips when tapped on a touch device.

## 0.38.4

### Patch Changes

- c46226c: Move battle setup forward with one button in the corner of the page instead of arrows on the section rail.

## 0.38.3

### Patch Changes

- c8a3e77: Highlight detachment and roster links in battle views.

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

- 319b35d: Fix profile picture upload on iOS.

## 0.34.13

### Patch Changes

- b39db79: Allow champions to equip every legal wargear replacement and additive upgrade.

## 0.34.12

### Patch Changes

- 92c6746: Show profile pictures consistently and link league player names to their profiles.

## 0.34.11

### Patch Changes

- 458c226: Speed up navigation and keep roster workspaces stable while loading.

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

## 0.34.5

### Patch Changes

- 84d349f: Show every equipped weapon when configuring a unit's wargear.
- 1765553: Keep long books responsive in the unit picker, the roster column, and faction datasheet lists.

## 0.34.4

### Patch Changes

- 221e6a7: Keep composite roster loadouts reversible and show every weapon profile they contain.

## 0.34.0

### Minor Changes

- 5baafe7: Run recurring league events with fresh registration and sealed rosters.

## 0.33.6

### Patch Changes

- 4c53471: Load the battle list a page at a time, ordered by most recent activity, so it stays fast however many battles an account has played.

## 0.33.5

### Patch Changes

- 5d029ad: Make faction pages, search, and the library markedly faster.
- 32e5b9d: Show squad-wide wargear quantities correctly in roster previews.
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
- 8cdf33e: Keep broad datasheet searches responsive.
- b35a558: Restore Leader and Support keywords to faction datasheets.

## 0.26.0

### Minor Changes

- 84c9de5: Add email verification and password recovery, use a clearer sign-in URL, and explain social authentication failures.

## 0.25.0

### Minor Changes

- 14e63da: Add linked Google and Discord sign-in, password management, and authenticator two-factor authentication.

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

- ee858c0: Fix uploading a profile picture eventually causing errors.

## 0.21.12

### Patch Changes

- 981c0b6: Fix roster units listing in the order they were added instead of alphabetically.

## 0.21.11

### Patch Changes

- a3d448f: Fix favourited datasheets sometimes never appearing after a hard refresh of a faction's datasheets page.
- a3d448f: Stop blocking a scoring selection once the round or battle VP cap is reached — it now stays a warning, and only the overage is left uncounted, so the rest of that turn's legitimate scoring can still go through.
- a3d448f: Make discarding tactical secondaries at the end of a turn optional, letting a player choose which cards, if any, to give up instead of forcing every active card into the discard pile.
- a3d448f: Fix undoing a tactical draw from several turns back auto-dealing a fresh hand instead of pausing, which made it impossible to rewind past that point.

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

## 0.18.3

### Patch Changes

- 3694c7a: Open datasheets reliably in large rosters.

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

- 3ecf75b: Open battles and the battles list faster.
- 3ecf75b: Keep offering players to connect with once you have many friends, instead of running out of suggestions.
- 3ecf75b: Show every roster's points as the library loads.

## 0.16.8

### Patch Changes

- 70ba273: Keep the faction list working.
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
