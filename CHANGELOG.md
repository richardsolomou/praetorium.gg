# praetorium

## 0.266.5 (2026-11-18)

### Patch Changes

- e18b76e: [rosters] Combat Shields on Vanguard Veterans with Jump Packs are one choice for the whole squad, and every model can take one.

## 0.266.4 (2026-11-18)

### Patch Changes

- dc0eae4: [reference] An ability granted by another rule shows under its own name instead of the name of an unrelated rule on the datasheet, such as Feel No Pain on Broadsides showing as For The Greater Good.
- dc0eae4: [rosters] A unit with a Marker Drone no longer shows its whole rule as a core ability.
- dc0eae4: [reference] A Feel No Pain that only works against some attacks shows as a short chip with an asterisk, and its tooltip says which attacks.
- dc0eae4: [reference] Transports no longer show their transport capacity as a core ability.

## 0.266.3 (2026-11-18)

### Patch Changes

- 5252934: [reference] Faction pages open faster on your first visit.
- 5252934: [app] Background preparation for offline play waits for idle time and a good connection.
- 0f871a7: [rosters] Public rosters and saved lists load faster when their points and legality need checking.
- 0f871a7: [rosters] Played armies load faster when their points and legality need checking.
- 0f871a7: [rosters] Opening a saved roster loads its editor and variant details together.
- 0f871a7: [simulator] Roster grades take less time to calculate.
- 0f871a7: [battles] Battle history and player profiles load faster.
- 0f871a7: [battles] Player rankings and achievements load faster when their results are up to date.
- 20a98cd: [rosters] The unit picker opens faster when you build a roster with a different battle size or detachment.
- 5252934: [app] The first screen loads with less work before it responds.

## 0.266.2 (2026-11-18)

### Patch Changes

- 737e601: [rosters] A tournament list taken to more than one event shows once, at its newest placing, so filtering no longer leaves another faction's list behind.

## 0.266.1 (2026-11-18)

### Patch Changes

- 0d6d9c1: [app] Reduce the JavaScript every page downloads by loading only the PostHog extensions Praetorium uses.

## 0.266.0 (2026-11-18)

### Minor Changes

- 83421d1: [rosters] If you build a list without an account, the home page and faction pages now link back to it.
- 83421d1: [reference] The end of each faction and datasheet page now offers to start a list with that faction or unit already filled in.

### Patch Changes

- 83421d1: [battles] You can end a practice battle early at its current score from Battle options.
- 83421d1: [battles] Games you haven't played for a few days ask you to resume them, and the home page counts the ones left for two weeks.
- 5707899: [battles] Faction emblems on the round and final score screens are no longer cut off on wider screens.
- 902591c: [app] Creating an account now lists what a free account gives you.

## 0.265.6 (2026-11-18)

### Patch Changes

- 04cb62d: [reference] A faction's datasheet list hides Legends and Crucible datasheets until you turn them on, and remembers your choice for every faction.

## 0.265.5 (2026-11-18)

### Patch Changes

- c93e45e: [reference] Saved reference pages decode in the background, so opening one no longer holds up the page.
- 3c4efef: [simulator] Taps on the simulator's model steppers and Try an example respond at once, with the results following a moment later.

## 0.265.4 (2026-11-18)

### Patch Changes

- 5f38c29: [app] Opening a roster straight after the app starts no longer shows an older copy that an edit could save over.

## 0.265.3 (2026-11-18)

### Patch Changes

- ab280c9: [app] After an update, the app loads faster because your device keeps the parts that did not change instead of downloading everything again.
- bf56c14: [app] Moving between pages and tapping buttons responds faster on phones.
- 4fea09b: [reference] Datasheet, detachment and faction pages open faster on devices that keep the reference saved for offline use.
- c55a9a9: [simulator] Changing a unit's models or options in the simulator responds faster.
- 44dccb3: [rosters] The unit picker opens faster, including the first time you open a roster after an update.
- 7f9c514: [rosters] Opening a unit in a roster responds faster, most noticeably on phones.
- 34e75ae: [app] Pages open faster, especially on phones, because each one downloads about 30% less code before it can respond.
- 8aa6a79: [rosters] A tournament list opens straight away instead of being imported again each time it is read.

## 0.265.2 (2026-11-18)

### Patch Changes

- 92dd8ca: [rosters] New Recruit share links import a Knight Despoiler, or any single-model datasheet, that swaps wargear for a bundle such as a gatling cannon and flamer.

## 0.265.1 (2026-11-17)

### Patch Changes

- 87b4048: [rosters] Long folder names wrap onto a second line instead of cutting off, which on phones happened after a few letters.
- a20bfee: [rosters] The roster library has one New folder button instead of a second tile among the folders.
- a20bfee: [rosters] The roster count above your library includes rosters filed in folders, and inside a folder it counts everything in it.
- a20bfee: [rosters] Selecting rosters ends from a close button on the selection bar, which stays in view as you scroll.

## 0.265.0 (2026-11-17)

### Minor Changes

- d2ba52e: [rosters] A Top four filter in the unit picker shows only the units many of your faction's top-four tournament lists take.
- 6748c5f: [rosters] A finished battle, a hidden-list game and a league with sealed lists now ask whether to make the list you played public.

### Patch Changes

- d2ba52e: [rosters] The favourites, collection and top-four filter icons show their tooltip on hover again.
- d2ba52e: [rosters] The unit picker's Format restrictions menu keeps its usual colour and shows a dot when something is switched off.
- d2ba52e: [rosters] The unit picker's trophy now sits left of the heart, so the hearts line up from row to row.
- 6748c5f: [rosters] No thanks to sharing a list is remembered for that list everywhere, instead of only in the tournament where you said it.
- d2ba52e: [rosters] A roster's header lists its faction, detachments and Force Disposition first, then its battle size, units and models.
- 6748c5f: [rosters] The sharing prompt explains what sharing a list gets you rather than who can already see it.
- d2ba52e: [rosters] Switched-off format restrictions are listed on hover of a warning triangle beside the roster's points, instead of in a box under the list.

## 0.264.3 (2026-11-17)

### Patch Changes

- 77c21fc: [rosters] Roster grades no longer mark a list down hard for falling a few percent short of its faction's typical damage or durability when that faction's tournament lists are all much alike.

## 0.264.2 (2026-11-17)

### Patch Changes

- 282e0f4: [rosters] Picking an in-battle option that gives a unit Stealth, such as Muted Servomotors, now lists Stealth among the unit's core abilities.
- cec481a: [rosters] Picking an in-battle option, such as a Doctrina Imperative, no longer hides which weapon abilities wargear like an Omnispex added.
- cec481a: [rosters] Weapon abilities gained from an in-battle pick, such as a Doctrina Imperative, are now highlighted like other added abilities.

## 0.264.1 (2026-11-17)

### Patch Changes

- b471702: [rosters] Picking a squad size from the number between − and + now works on iPhone.

## 0.264.0 (2026-11-17)

### Minor Changes

- 310e370: [rosters] A unit's datasheet in the roster and in a battle's units now lists the rules it chooses between during the battle, such as Doctrina Imperatives, Battle Protocols and Orders, and shows its profiles with the option you pick.

### Patch Changes

- 485ed81: [rosters] An enhancement some units can't take, such as Cognitive Reinforcement for a Cybernetica Datasmith, is no longer hidden from every other character in a list that includes one, and the simulator applies it.
- 467eed6: [simulator] The simulator now applies the weapon ability you pick for a rule such as Technosorcerous Augmentations, which it ignored when the army data already gave part of that rule.

## 0.263.0 (2026-11-17)

### Minor Changes

- 48ca31a: [rosters] Your rosters can now go in folders, and folders inside folders: open one like a folder on your computer, drag a roster or folder onto another to move it, and search or filter across every folder at once.
- 48ca31a: [rosters] Each of your rosters now says how often you have played it, how those games went and when you last did, and you can filter or group your rosters by whether you have played them.

## 0.262.2 (2026-11-17)

### Patch Changes

- 3838bd7: [assistant] Assistants can compare every enhancement a unit's characters can take against a target, within the points a list has spare.
- 3838bd7: [assistant] Assistants are told about free wargear a list leaves out.
- 3838bd7: [assistant] Assistants check what a leader or support character adds before suggesting you cut it, and ask how your list plans to win before chasing board presence.
- 3838bd7: [assistant] An assistant grading a list sees what each leader or support character adds to the damage of the unit it joins.
- 3838bd7: [assistant] Saving a list back through an assistant keeps its automatic title.
- 3838bd7: [assistant] An assistant opening your own private list by its link is pointed to the right tool.
- c1c5ef2: [assistant] Assistants can find units by what their abilities do, such as which keep an objective under your control.
- 3838bd7: [simulator] The simulator now calculates Total Obliteration, Battle Protocols, Robotic Bodyguard and Noospheric Transference, and knows Sanctified Ordnance changes no attack.
- c1c5ef2: [simulator] Doctrina Imperatives apply in full to Battleline units in the simulator, so Conqueror and Cognitive Reinforcement now count their armour penetration.

## 0.262.1 (2026-11-17)

### Patch Changes

- a1f7199: [rosters] After you duplicate a roster or create a variant, a message confirms you're now editing the new list.
- 4c0110e: [events] A league that seals lists now shows who has sealed one on the League tab, with your own list's name under yours.

## 0.262.0 (2026-11-17)

### Minor Changes

- 42f2f90: [reference] Data updates now marks each change as a points change, an addition or a removal, and you can filter them by kind and section and collapse updates you've read.
- 18f4e4f: [app] What's new groups each day's changes by part of the app, and you can filter it to the areas you use or to new features only, and collapse days you've read.

## 0.261.6 (2026-11-17)

### Patch Changes

- bad2aa3: [events] The Groups page now lists the groups with the most recent game first.
- bad2aa3: [events] Tournaments now list the soonest one first, with undated tournaments after them and finished ones last, on the home page and the Tournaments page.

## 0.261.5 (2026-11-17)

### Patch Changes

- f0988d3: [rosters] Imported lists that leave out an optional default, such as a Battle Sisters Squad's special or heavy weapon Sister with nothing chosen, now open and save instead of failing.
- f0988d3: [rosters] Imported lists with a title longer than 80 characters now open and save, with the title cut to fit, instead of failing.

## 0.261.4 (2026-11-17)

### Patch Changes

- 37e6f1f: [rosters] A roster unit's datasheet now shows each model profile its leader or specialist changes, such as both the Kabalite Warriors and the Sybarite, instead of only one of them.
- 37e6f1f: [simulator] Combat simulation and roster grades now keep a Subductor Squad's 4+ invulnerable save on its Arbites when only the Cyber-mastiff lacks it, and give an Imperial Navy Breachers squad's heavy-shotgun model the invulnerable save of its endurant shield.

## 0.261.3 (2026-11-17)

### Patch Changes

- 6c49d4a: [assistant] The assistant now simulates conditional detachment rules in the state that triggers them instead of dismissing them.
- a546f52: [assistant] The assistant now takes free optional wargear, such as an icon or an extra weapon, that adds to a unit without replacing anything.
- b2636a1: [assistant] The assistant now optimizes every unit's wargear, ignores detachment points when a list takes one detachment, and compares detachments by simulation rather than by grade.
- b93a33c: [assistant] The assistant now explains each tournament staple it leaves out of a list, even at battle sizes with no tournament lists, and tests one change at a time.
- 55739c4: [simulator] The simulator now offers stratagems used in the Command phase whose effect lasts into the Shooting or Fight phase, such as Machine Spirit Resurgent, and lists the ones it can't calculate yet.
- 7357f26: [simulator] The combat simulator now offers the Hallowed Martyrs detachment rule, and a below-strength bonus that applies "as well" now adds to the first bonus instead of replacing it.
- 685704c: [simulator] Roster grades and combat simulation now measure squads that mix wargear models sharing one profile, such as Wolf Guard Terminators with an assault cannon or Vanguard Veterans with a plasma pistol, instead of leaving their durability uncalculated.
- c514e79: [simulator] Optimize no longer drops wargear you've paid for when another loadout only matches it.
- 01b2fca: [simulator] Optimize now takes free optional wargear, such as the Rubric Marines' Icon of Flame, when leaving it off does no better.
- 0792d52: [simulator] The simulator applies Sensational Performance from Court of the Phoenician when a unit has charged, and other detachment rules that give every unit of a keyword an ability to use when it fights.
- b4e3cb1: [simulator] Cognitive Reinforcement, Omnicogitator, Cantic Thrallnet and other rules that make both Doctrina Imperatives active now apply the Protector and Conqueror Imperatives together, whichever one the round selects.
- b4e3cb1: [simulator] The simulator, loadout optimizer, roster comparison and roster grades apply an enhancement's own rules again, such as Logis's +1 to hit, instead of ignoring every enhancement that doesn't just change a characteristic.
- 0792d52: [simulator] The simulator applies enhancements and abilities that help only models with a keyword, such as Lord of the Rubricae, or only weapons with one, such as Empyric Onslaught, along with the Adeptus Custodes Salvus ka'tah.
- 0792d52: [simulator] Rules the simulator can't calculate yet, such as Flow of Magic and Noctilith Mantle, are listed as not calculated instead of left out without a word.
- 685704c: [simulator] Roster grades and combat simulation now measure squads whose models take their profile from the unit, such as Rubric Marines and Servitor Battleclades, instead of leaving their durability uncalculated.
- 7357f26: [simulator] The combat simulator now lists 31 more detachment rules it cannot calculate, such as Iron Fortitude and Eye of the Hunt, instead of leaving them out silently.

## 0.261.2 (2026-11-17)

### Patch Changes

- 56e219f: [rosters] The Space Marines Lieutenant with Combi-weapon can now be your Warlord.
- 56e219f: [rosters] The Ynnari Archon can now be your Warlord.

## 0.261.1 (2026-11-16)

### Patch Changes

- 73eb265: [app] When Praetorium updates while you have it open, you now see a notice asking you to refresh instead of the page failing.

## 0.261.0 (2026-11-16)

### Minor Changes

- 6f8cae5: [rosters] Tournament lists now include top-four lists from Mini Headquarters events, alongside those from 40k Stats.

## 0.260.1 (2026-11-16)

### Patch Changes

- 0b98f2a: [assistant] The assistant's roster check now lists the restrictions Praetorium couldn't check, as the builder does.
- 0b98f2a: [battles] King of the Colosseum no longer flags a Toughness 9 unit for its attached leader or enhancement: only the datasheet's own Toughness counts.
- 0b98f2a: [rosters] An enhancement that gives its bearer's unit a keyword, such as Martial Signatum Amplificator, now gives it instead of warning that a rule couldn't be checked.

## 0.260.0 (2026-11-16)

### Minor Changes

- 00f9c62: [assistant] AI assistants can now browse the battles and rosters players have made public, without an account.

## 0.259.0 (2026-11-16)

### Minor Changes

- baaf4e7: [rosters] Lists from Mini Headquarters now import, in its own layout and in the sectioned layout French events publish.

### Patch Changes

- baaf4e7: [rosters] Translated lists now match names that differ from the official app's only in accents, plurals or word order.
- baaf4e7: [rosters] WTC-style lists that price units in points, as "10x Skitarii Rangers (85 points)", now import those units and their models.

## 0.258.0 (2026-11-16)

### Minor Changes

- d19e038: [assistant] Assistants connected to Praetorium can now read a faction's winning tournament lists, see how often each unit appears in them, and open one as a draft to grade.
- d19e038: [rosters] Roster grades now show how much of a list is in the units its army's winning tournament lists field, and which of those it leaves out.

### Patch Changes

- d19e038: [assistant] Assistants now build and grade lists from winning tournament lists, give every unit a job, and no longer present a high grade as a sign that a list is competitive.
- a7027d9: [assistant] Assistants connected to Praetorium without signing in keep working after they try a tool that needs an account.
- d19e038: [rosters] The roster grades guide now says what the grades predict in tournament games and what they don't.

## 0.257.12 (2026-11-16)

### Patch Changes

- c6e1f9b: [app] Pages no longer slow down for a quarter of an hour after each army data update; the Tournament lists tab fills in over about an hour instead.
- c6e1f9b: [rosters] Editing a roster on a computer whose clock runs fast no longer stops with a "Saved changes" review of edits you just made.

## 0.257.11 (2026-11-16)

### Patch Changes

- 72414a3: [app] Signing out and back in no longer briefly shows "Something went wrong" with "The account on this device changed".
- 72414a3: [app] A page that has to reload while you sign in no longer shows "Something went wrong" after a few quick sign-ins.

## 0.257.10 (2026-11-16)

### Patch Changes

- a829e8f: [app] A new Apps page lists the iPhone and Android apps and every AI assistant Praetorium works in, linked from Home, More and the site footer.
- f2ba353: [app] More help pages now show where to go and what to press, with up-to-date pictures of each screen.
- a829e8f: [app] The site footer's links are shorter: Privacy, Terms and Sources.
- f2ba353: [battles] The battle setup help now lists the steps the setup page actually shows.

## 0.257.9 (2026-11-16)

### Patch Changes

- 087cfa2: [battles] A player's panel in a battle no longer squeezes its stratagems beside its missions on laptop-sized screens, where their names overlapped the CP buttons.

## 0.257.8 (2026-11-16)

### Patch Changes

- 4f41bfc: [simulator] Loadout searches score loadouts on three worker threads at once, so a search on a large unit takes about 40% less time.

## 0.257.7 (2026-11-16)

### Patch Changes

- 3e3f7be: [simulator] Loadout searches reuse attack counts and rule-name matching across loadouts, so they finish sooner.

## 0.257.6 (2026-11-16)

### Patch Changes

- 3eee9c5: [rosters] Black Templars Initiates who swap their bolt rifle for a chainsword or power fist keep their close combat weapon.
- b7e8632: [events] Organizers are told they can press a player's name to check them in before round 1.
- 9a54bfb: [battles] Entering a score for a game nobody started no longer tells its players that a battle was created.
- 21349b7: [rosters] The text export warns when it leaves out a detachment or option that the current data no longer offers.
- f22837e: [events] A played battle's and a revealed tournament or hidden-list game's roster pages show the points and units each list was fielded with, instead of repricing it with today's data.
- f22837e: [battles] A unit opened from a played battle's list shows its datasheet for the rules version it was played under, or the loadout the list recorded when that version is gone, instead of an error.
- c607bd1: [events] A finished Swiss tournament no longer says earlier results lock when the next round is paired.
- 678e323: [app] A friend invite link that stops working no longer says it expired, since friend invites don't expire.
- fcfeca4: [rosters] Importing an official-app list now gives a Kroot Farstalker the Pech’ra it lists.
- ea999b8: [events] A league bye no longer counts as a win in the league table.
- 26e2e8f: [events] Group organizers can press Enter score on a league fixture to record a game that wasn't tracked in Praetorium.
- a10dbc1: [events] The league tab says only tracked games count on the leaderboard, since an entered score doesn't.
- 0dba824: [rosters] Importing ListForge short text now reads Sicarian Ruststalkers carrying a transonic razor and chordclaw.
- 8441f2f: [rosters] Importing ListForge short text no longer fails when a unit is listed without wargear.
- 4034769: [rosters] Importing an official-app list from before the 11 November data update now reads the Nightforged Battery it spells "(Upgarde)".
- ac7aaa1: [events] Old links to the clubs and league docs open the groups and tournament docs.
- ac7aaa1: [battles] An old guest invite link opens its battle to watch.
- ac7aaa1: [app] Battle, roster, player, data update, import and journal links from earlier versions of Praetorium open the page that replaced them instead of a missing page.
- 4f9da52: [events] The tournament guide has a checklist for your first tournament, and the tournament and group guides explain correcting entered scores, check-in and overdue league games.
- b7e8632: [app] The Organizer achievement and assistant help now spell organizer the same way as the rest of Praetorium.
- aa7a04c: [events] Organizers can enter a corrected score on a reopened table from an earlier Swiss round.
- 267876d: [events] On a phone, a dropped player's name in tournament results no longer squeezes into a narrow column.
- 678e323: [reference] A datasheet link naming an entry the army data has since replaced opens the current datasheet.
- 7269bcc: [battles] Battles and tournament entries played with an army whose data source was later replaced show their faction again in feeds, leaderboards and events.
- 7cc7bf4: [rosters] The list check now flags a saved unit size or model count that a unit can no longer field, instead of quietly changing it.
- 19cf770: [rosters] Archiving, locking, sharing or tidying a roster no longer moves it off the rules version it was built for.
- 19cf770: [rosters] Saving a roster on the current rules no longer moves it onto an older rules version.
- cda58b0: [events] After the reveal, a Swiss tournament's organizer is told to check players in and pair round 1.
- 267876d: [events] On a phone, Swiss tables and league fixtures keep player names on whole lines instead of breaking them a letter at a time.
- b7e8632: [events] A new tournament's roster deadline note says a player without a sealed roster sits the tournament out.
- a0372ce: [events] A tournament's header says entry is closed once the rosters are revealed.
- b7e8632: [events] A new tournament's first step asks you to send the invite link to your players.
- 1e778d5: [events] Only a tournament's organizers can reveal its rosters, so a player sealing early no longer closes entry.
- 0f20d80: [reference] A new docs page says what data updates keep: your rosters, played battles, sealed lists, shared links and exchange codes.
- 9a590df: [rosters] Importing a list now reads Wolf Guard Headtakers’ Hunting Wolf models.

## 0.257.5 (2026-11-16)

### Patch Changes

- b64a702: [simulator] Loadout searches skip work the ranking never uses, so large units finish sooner or check more loadouts in the time allowed.

## 0.257.4 (2026-11-16)

### Patch Changes

- 32a724b: [reference] Dark faction emblems such as Raven Guard and Black Templars now have a thin edge so they stand out on the page.
- 32a724b: [battles] The faction emblems behind the scores between rounds now match each side's colour.

## 0.257.3 (2026-11-16)

### Patch Changes

- 9a5b41c: [assistant] An assistant that asks for several loadout searches or roster grades at once now has them queued instead of refused as busy.
- 9a5b41c: [simulator] Loadout searches score loadouts in batches, so they finish sooner and check more loadouts for large units.
- 1fc999b: [assistant] Assistants can look up a mission matchup without naming the mission pack; it uses the current one.

## 0.257.2 (2026-11-16)

### Patch Changes

- c6eea94: [assistant] MCP tools now accept optional `llm_model` and `conversation_id` arguments, and calls made with your sign-in count towards your account's usage profile, as the privacy policy describes.

## 0.257.1 (2026-11-16)

### Patch Changes

- 05e33b0: [rosters] Giving a Tankbusta the pulsa rokkit, or another specialist in a squad of fixed size, now swaps out one of its squadmates instead of adding a model.

## 0.257.0 (2026-11-16)

### Minor Changes

- 16336a7: [events] A league with every game played now says it's complete and names the winner on its tab, the group overview and Up next for you.
- 16336a7: [events] Organizers can start the next league from a complete one, with everyone who played still in the group already in.
- 16336a7: [events] Past leagues now show who won each one.

### Patch Changes

- 4ec2a46: [events] Starting the next league after one that sealed lists keeps sealing them, to the same points and house rules.

## 0.256.0 (2026-11-16)

### Minor Changes

- 1e6e0a3: [events] A group league can have every player seal one list before it starts, revealed when the league is published and used for every fixture.

### Patch Changes

- f9e1df6: [events] Sealing your first list into a hidden-list game now asks which Force Disposition it plays when the list offers several and names none.

## 0.255.1 (2026-11-16)

### Patch Changes

- 0249b4f: [events] A group's overview gives records as won, drawn, lost, like its tables.
- 0249b4f: [events] The leaderboard drops its Wins column, which the battles and win rate already give.
- 0249b4f: [events] League tables show how many games each player has played instead of strength of schedule.
- 0249b4f: [battles] A player's record against an army counts every rules version of it as one army, in the profile and the battle list's army filters.
- 0249b4f: [app] The service record no longer shows victory points per command point.

## 0.255.0 (2026-11-16)

### Minor Changes

- 87d033e: [battles] Every side whose list offers more than one Force Disposition now picks the one it plays at the Mission step of battle setup, not only allied sides.
- 87d033e: [events] Sealing a list for a tournament or hidden-list game asks a solo player which Force Disposition they play when the list offers several, and that card stays fixed for the event.

### Patch Changes

- 87d033e: [rosters] Lists no longer need a Force Disposition: a list whose detachments offer several keeps them all, so imported lists that name more than one are usable straight away.

## 0.254.1 (2026-11-16)

### Patch Changes

- 72200ec: [app] Home's app and assistant links are a panel at the top of the side column, beside your games.
- 72200ec: [app] Home marks each roster a data update changed, in place of its Army updates panel.
- 72200ec: [app] New players see a Get started checklist on Home: build a roster, play a battle and join a group.
- 72200ec: [app] Home lists your groups with your place in each, and the tournaments you've entered until their day of play is over.
- 72200ec: [app] Home's Your opponents panel shows your record against the players you've faced most, and each opens your record against that player.
- 72200ec: [app] Home's In progress section puts your live games together with league games you still have to play, rosters your events need, lists a data update changed and friend requests.
- 72200ec: [battles] Home shows public games only while they're being played.
- 72200ec: [app] Home lists your recent results and friends' games one line each, with each side's army and a win or loss mark on yours.
- 72200ec: [app] Home's greeting is shorter, with your record, win rate, rating trend, leaderboard place, form and recent armies on one line under it.
- 72200ec: [simulator] Recent simulations now live on the Simulator page only.

## 0.254.0 (2026-11-15)

### Minor Changes

- 54287c8: [battles] Open the list a player fielded from **Roster** under their name in a battle, even when their saved roster is private.
- 54287c8: [rosters] Searching Public, Friends and Played rosters now finds lists by faction and detachment, and played armies by the factions they faced, such as `vs Orks`.
- 54287c8: [simulator] Search other players' public rosters and played armies, or paste a roster link, to simulate rosters that aren't yours.

### Patch Changes

- 54287c8: [simulator] Simulate a list opened from a battle as it was played, and share that matchup by link, even when its saved roster is private.
- 54287c8: [battles] Rename a battle's **Army** button to **Units**, and leave points off the units it shows.
- 54287c8: [battles] Duplicate a list opened from a battle as it was fielded, and stop offering a link to its saved roster.
- 54287c8: [rosters] Save a loadout or report a problem from a unit on someone else's roster.

## 0.253.2 (2026-11-15)

### Patch Changes

- d340ec5: [battles] Mission choices such as Beacon and Burden of Trust name the leaders and support attached to each unit.

## 0.253.1 (2026-11-15)

### Patch Changes

- 95c8676: [battles] Collapse any battle setup step to its answer, and click the answer to open it again.
- 95c8676: [battles] Open a mission's card or the battlefield's measurements from a collapsed setup step.
- 95c8676: [battles] Settled battle setup steps start collapsed, and ticking one collapses it and moves to the next step still to settle.

## 0.253.0 (2026-11-15)

### Minor Changes

- 7e05c06: [app] In the phone app, every button, link and menu item now gives a light tap of feedback when pressed.

### Patch Changes

- 6bc5aa2: [battles] Every phone at a battle now shows the same presses on a scoring prompt, and any of them can carry on pressing before it's confirmed.
- 6bc5aa2: [battles] What you've pressed on a scoring prompt now stays when you leave the battle and come back.

## 0.252.2 (2026-11-15)

### Patch Changes

- 8ed3bae: [battles] On a slow connection, a battle now shows its phase button straight away, reading Connecting… until it can be pressed.
- 727fc94: [app] Two players whose colours would look the same to a colour-blind player are now given colours that look different.
- 216a8fa: [battles] A scoring prompt's confirm button now turns grey until every card is answered, instead of showing a faded side colour that looked pressable.
- 9ecbd3c: [app] Achieved and best marks are a deeper green, so they no longer look like buttons and the current selection.
- 80517ac: [app] Empty Notifications and Battles pages now look like the other empty pages.
- ee7e43e: [app] Missing battles, rosters, groups and rules now say what is missing and link back to the list they belong to.
- e539502: [app] On a slow connection, a thin green line under the header now shows a page is loading, and a roster that is still opening keeps the app header.
- ca7dc2d: [app] A page that fails to load now says whether you're offline, never shows internal error text, and offers a way back to the list it belongs to.
- 7ea46ce: [battles] On phones, messages now appear at the bottom of the screen above the tab bar and battle controls, instead of covering the scoreboard and dialog titles.
- 40c2279: [battles] A single battle reminder now puts Hide for… beside Dismiss.
- a0c100e: [battles] The round summary now lines up both sides' scores when only one side has Battle ready points.
- 1586b7b: [battles] On phones, each score on the battle scoreboard now shows its players' pictures or initials, so it doesn't rely on colour alone.
- 4f5e7e6: [battles] Scoring prompts have larger buttons on phones, and one press answers every card that scored nothing.
- 9e9dc8b: [battles] When Praetorium can't be reached during an update, battle actions and pages now say so plainly instead of showing a raw error page.
- 65a484b: [battles] Battle setup's remaining steps are now shown in plain text instead of the warning colour.
- 1620e31: [battles] On phones, your command points now sit beside the phase button and open the stratagems you can play now, with +1 CP, without scrolling.
- 4f3efae: [app] The supporter mark is a lighter gold, so it no longer reads as a warning.
- c120725: [battles] On phones, swipe sideways to move between your side, the battle and your opponent, and switch sides inside the stratagems panel without reaching for the tabs at the top.
- 8ee98c3: [reference] On the terrain board, mat positions are now square markers and edge distances arrows, so the two stay apart for colour-blind players.

## 0.252.1 (2026-11-15)

### Patch Changes

- 75761f4: [rosters] New Recruit lists exported with the official app's header now import with their faction, detachments and battle size.

## 0.252.0 (2026-11-15)

### Minor Changes

- 9e75bac: [battles] King of the Colosseum games can be played on the three Combat Patrol battlefields.
- 9e75bac: [battles] King of the Colosseum games can be played in the original Colosseum 1.0 as well as 2.0.

## 0.251.0 (2026-11-15)

### Minor Changes

- 4e8ed30: [app] The home page gives lists and games equal space, with the features most worth knowing about on each side.
- 4e8ed30: [battles] Until your first battle, **Start a battle** in a roster's menu says what tracking a game here does for you.

### Patch Changes

- 4e8ed30: [app] On your home page, **Build a roster** and **New battle** now sit side by side with equal weight.
- 4e8ed30: [rosters] **Try importing a list** on the home page now opens the import dialog straight away.

## 0.250.1 (2026-11-15)

### Patch Changes

- 42d9413: [battles] On a phone, a list opened from a battle prompt no longer hides its last options under the bottom tabs.
- 2e6e6cc: [app] The "Praetorium has been updated" notice has a Later button, since the new version loads on your next page anyway.

## 0.250.0 (2026-11-15)

### Minor Changes

- d8f5900: [app] Home now links to Praetorium in ChatGPT and Claude beside the app store badges.

## 0.249.1 (2026-11-15)

### Patch Changes

- 99d1b64: [battles] Undoing back into a phase shows that phase's battle alerts again.

## 0.249.0 (2026-11-15)

### Minor Changes

- e904ab4: [events] A group's Overview now shows how the group plays: games played, battles in play this week, its most played armies, the top of the leaderboard with recent form, the league's progress and table, compact recent results and head-to-head records.

## 0.248.1 (2026-11-15)

### Patch Changes

- 8a334f5: [battles] Battle setup on a phone uses the full screen width for each step, so side names, missions and layouts no longer squeeze or cut off.
- 8a334f5: [battles] The "Played by you" label on a battle's army card no longer breaks over two lines on a phone.

## 0.248.0 (2026-11-15)

### Minor Changes

- 5795991: [rosters] The unit picker marks units that many of your faction's top-four tournament lists take, and a datasheet's page shows how those lists take it.
- 5795991: [rosters] Filter the Tournament lists tab by the units a list fields.

### Patch Changes

- 5795991: [rosters] The Tournament lists tab keeps every tournament list that is still legal under today's points, not just the last 60 days.
- 5795991: [rosters] The Winning roster tab is now Tournament lists, and says its lists finished in the top four at tournaments outside Praetorium, as published by 40k Stats.
- e973928: [rosters] The Played tab under Rosters opens quickly the first time after an update, instead of taking a few seconds.

## 0.247.9 (2026-11-15)

### Patch Changes

- e88e3cb: [rosters] A Noxious Blightbringer can join Poxwalkers or Plague Marines that another Leader, such as Typhus, already leads.

## 0.247.8 (2026-11-15)

### Patch Changes

- c612eb6: [events] Tournament, hidden-list game and league organizers can set one chess clock limit for every battle, which players can't change in setup.

## 0.247.7 (2026-11-14)

### Patch Changes

- 4389f0e: [rosters] A unit's loadout lists every ranged weapon before its melee weapons, instead of putting default melee weapons ahead of chosen guns.

## 0.247.6 (2026-11-14)

### Patch Changes

- 15ab06a: [app] Live updates no longer drop out for a few seconds shortly after returning to Praetorium on a phone.

## 0.247.5 (2026-11-14)

### Patch Changes

- 652c1fc: [rosters] The roster editor no longer shows a Start a battle button; start one from the roster's menu in your library or from Battles.

## 0.247.4 (2026-11-14)

### Patch Changes

- 19326f7: [rosters] A list name typed straight after reopening a roster no longer reverts to the old name.

## 0.247.3 (2026-11-14)

### Patch Changes

- 8f7adae: [battles] Battles now says when it shows an older copy of your games because it could not refresh, and tries again, so a finished game no longer looks like it is still in progress.

## 0.247.2 (2026-11-14)

### Patch Changes

- c14456b: [rosters] Reloading right after editing a roster no longer shows its old points on the rosters page.
- 5c392be: [battles] Choosing a roster after you leave battle setup and come back now works the first time, instead of asking you to choose it again.

## 0.247.1 (2026-11-14)

### Patch Changes

- ad5a208: [app] Page tab bars on narrow screens scroll sideways instead of wrapping onto a second line.

  Opening a page on a tab that doesn't fit on screen scrolls its tab bar to show it.

## 0.247.0 (2026-11-14)

### Minor Changes

- 3be527d: [app] You can now get notifications in your browser for new battles, friend requests, and group and tournament updates.

## 0.246.3 (2026-11-14)

### Patch Changes

- 27a6d66: [battles] A mission card asks to turn on rules text once instead of in place of every condition and action.
- 27a6d66: [battles] The scoring prompt names each payout by its points, such as the lower or higher payout, until rules text is turned on, and asks to turn it on once instead of on every row.

## 0.246.2 (2026-11-14)

### Patch Changes

- c70f81d: [app] The Status page names the army data snapshot Praetorium serves instead of saying it was not recorded.

## 0.246.1 (2026-11-14)

### Patch Changes

- b62191c: [rosters] A Stormtalon Gunship starts with its skyhammer missile launcher and a Scout Bike Squad sergeant with a bolt pistol again.
- b62191c: [rosters] Saved lists keep the Space Marines Legends datasheets that left the Munitorum Field Manual, marked as no longer legal, instead of losing them.
- b62191c: [rosters] Scout Squads count one combat knife per model and the Astraeus both of its storm bolters again.
- b62191c: [rosters] Saved lists keep options the datasheets now offer under new entries, such as the Acothyst's weapons, the Kill Tank's rokkit launchas and the Vanguard Veterans' storm shields.
- b62191c: [rosters] Tarantula Sentry Battery lists keep their number of turrets.

## 0.246.0 (2026-11-14)

### Minor Changes

- 3cbfc22: [reference] With notifications on, the app now tells you when an army data update changes the points of a list you saved, and by how much.

### Patch Changes

- 1762c44: [app] The links at the foot of each page are easier to tap.
- 1762c44: [battles] A finished battle's losing side keeps its names and armies readable, with only its pictures and score faded.
- 1762c44: [battles] A battle setup step that isn't open yet keeps its explanation readable.
- 1762c44: [app] Voice control and screen readers now name battle cards, unit attach and embark menus, terrain layouts, the event invite link and the datasheet list by the words they show.
- 1762c44: [app] The sponsor link on the home page is underlined, so it stands out without relying on colour.

## 0.245.0 (2026-11-14)

### Minor Changes

- 2dcabf1: [battles] Until you have played your first battle, the places you start one now say what tracking it here does for you.

### Patch Changes

- 6abaaa9: [reference] Corrected keywords on 50 datasheets, such as Explosives in place of Grenades on many Space Marine units and Frame on large models.
- 6abaaa9: [reference] Corrected stat lines on 10 datasheets, such as the Apothecary Biologis's Objective Control and the Avenger Strike Fighter's Move.
- 6abaaa9: [reference] Corrected weapon profiles on 66 datasheets, such as kill team plasma incinerators, the Lieutenant's plasma pistol and the Land Raider Crusader's multi-melta.
- a2d42d0: [rosters] Legionaries with two different heavy or special weapons, such as a Havoc autocannon and a missile launcher, keep both when a list is imported or built.
- a2d42d0: [reference] Belial's datasheet now lists Terminator Assault Squad, and the Captain in Terminator Armour's lists Wolf Guard Terminators, among the units they can lead.

## 0.244.0 (2026-11-14)

### Minor Changes

- 25805bd: [reference] Faction and datasheet pages show a few recent finished games that field that faction.
- f708ffa: [rosters] Rosters has a Winning tab of recent top-four tournament lists that you can read in full and import as your own.

### Patch Changes

- f708ffa: [rosters] A list link opened on a roster tab other than Mine now opens its import review instead of closing it.

## 0.243.0 (2026-11-14)

### Minor Changes

- 76e198f: [battles] A battle can now run a chess clock: choose each side's time under **Chess clock** in setup, see the time each side has left on the scoreboard, and hand the clock to the other side for a reaction in your turn.
- 2a0c26c: [battles] In a running battle, **Threats** under an opponent's name lists their surviving units by Move plus longest ranged weapon, so you can see what reaches you without opening each datasheet.
- 3a4d05e: [events] League players with a game still to finish get a notification about a day before the round’s deadline.
- 8620afd: [app] A new Status page, linked from Support, shows whether Praetorium is working and which release, army data and rules versions it serves.
- d149cae: [reference] Choose **Something wrong?** on a datasheet, or in a roster unit's menu, to report a wrong points value or profile with the datasheet, faction and rules version already filled in.
- 8f1654b: [battles] Streamers can add a live score overlay for a battle to their stream: choose **Copy stream overlay link** in the battle options.

### Patch Changes

- b204c34: [rosters] Changing a roster to an archived rules version no longer fails with “That took too long” while the site is busy.
- 7d3ebe3: [rosters] The battle size list in roster setup is wide enough to show each size on one line.
- c89cbce: [app] When the connection drops during a load or a save, Praetorium now says so and asks you to try again when you are back online, instead of showing the browser's own message.
- b204c34: [rosters] Your rosters page shows a list’s current points straight after you edit it, instead of its total from before the edit.
- 5351f0b: [app] The results bar on a player's profile now shows draws as a thin line and losses as stripes, so players with red-green colour blindness can tell wins from losses.
- be31474: [reference] Rules text that couldn't load now loads again when you come back to its page, without pressing Try again.

## 0.242.0 (2026-11-14)

### Minor Changes

- 5921eb6: [events] You can now see your league round deadlines and tournament dates in your own calendar app: get a calendar link under Account settings.

### Patch Changes

- f14d6af: [rosters] **Build an army** on the home page now opens the roster setup straight away.
- f14d6af: [rosters] An empty Rosters page now offers to build a roster or import a list, and only mentions the one-roster limit without an account once you have one.
- f14d6af: [rosters] Without an account, the roster setup no longer shows an Access choice that read "Public" for a list only your device keeps.
- f14d6af: [rosters] Creating a roster no longer asks for a name: it is named from your army, and you can rename it in the builder.

## 0.241.6 (2026-11-14)

### Patch Changes

- 27dcb0f: [battles] The First turn step in battle setup now says which earlier step it waits on.

## 0.241.5 (2026-11-14)

### Patch Changes

- 3e61d7a: [battles] A battle card's score blends the colours of everyone on each side.

## 0.241.4 (2026-11-14)

### Patch Changes

- a95c0b0: [battles] Your draft on Battles can be deleted from its menu or with a right-click.
- a95c0b0: [battles] Until a battle starts, a place you play can go back to the invite link even after you chose its army.

## 0.241.3 (2026-11-14)

### Patch Changes

- 3988c2b: [battles] A new battle starts with Guided tracking already selected.
- bfa064a: [reference] Secondary mission pages have readable addresses named after the card, and older links still open them.
- 9b8b248: [battles] Battle setup no longer scrolls past the bottom of the page.
- ec19912: [battles] In a battle with more than one player on a side, each player keeps their own colour, and the side's score blends them.

## 0.241.2 (2026-11-14)

### Patch Changes

- 1e72e53: [events] A group page no longer shows an empty "Nothing waiting on you" card when there's nothing for you to do.

## 0.241.1 (2026-11-13)

### Patch Changes

- eef8e24: [reference] Missing rules text now offers to turn on external sources, and the source list shows which one it needs.

## 0.241.0 (2026-11-13)

### Minor Changes

- 62dfe24: [battles] At the end of each battle round, and when the battle ends, the battle shows both sides' scores, how they were made and what the round added.

## 0.240.3 (2026-11-13)

### Patch Changes

- e87b6b8: [reference] Datasheet abilities, wargear abilities, enhancements and core rules now load their words from Game Datacards wherever it prints them, and from BSData only where it does not.

## 0.240.2 (2026-11-13)

### Patch Changes

- 84c7132: [battles] The record line after a battle names your opponent in their colour.

## 0.240.1 (2026-11-13)

### Patch Changes

- 2cdfbb0: [battles] Playing both sides now makes every place yours, named after the army you choose, including any ally you add, instead of seating a practice opponent.
- 2cdfbb0: [battles] Add ally is now a dashed place under each side in battle setup, so it is easy to find.
- 2cdfbb0: [battles] An empty ally place in battle setup now offers the battle link, so the ally can join it.

## 0.240.0 (2026-11-13)

### Minor Changes

- a84d4ba: [battles] Every player now has their own colour, shown on their name everywhere and on their side in battles instead of red and blue. Choose yours under Player colour in account settings.

## 0.239.1 (2026-11-13)

### Patch Changes

- 43dc21b: [battles] Drawing secondaries, discarding a tactical hand, New Orders, Secret Mission handoffs and mission card choices now show in the colour of the player making the decision, like scoring does.

## 0.239.0 (2026-11-13)

### Minor Changes

- f439108: [app] A finished battle against someone who isn't your friend yet offers to add them, or to accept their request.
- f439108: [battles] A finished battle shows your record against your opponent, with a link to the full record against them.

## 0.238.3 (2026-11-13)

### Patch Changes

- 6072f76: [simulator] Optimizing a led unit inside a full army, such as Sternguard with a Lieutenant, finishes instead of stopping with "The full search could not finish."
- 6072f76: [simulator] The optimizer's progress bar moves steadily instead of sitting near 0% for most of the search.
- 6072f76: [simulator] The simulator no longer asks you to choose between two copies of a weapon ability that do the same against the target, such as Lethal Hits and Lethal Hits: Non-Monster/Vehicle against Infantry.

## 0.238.2 (2026-11-13)

### Patch Changes

- aafacb5: [simulator] Swapping attacker and defender in the simulator and back again now restores the modifiers you had set.

## 0.238.1 (2026-11-13)

### Patch Changes

- 3bfd526: [rosters] Importing a New Recruit share link now counts the models New Recruit groups under a loadout, such as Jakhals taken as "8 chainblades".

## 0.238.0 (2026-11-13)

### Minor Changes

- 3a56c18: [simulator] Rules & buffs in the simulator now groups each side's rules under Abilities, Detachment, Stratagems and Stats applied, and it opens with Manual modifiers on a tablet or computer.
- 3a56c18: [simulator] Weapon cards in the simulator now show the BS, WS, S, A, AP and D your manual modifiers give them.
- 3a56c18: [simulator] Manual modifiers in the simulator now stay on when you change the attacking or defending unit, so you can test the same situation against several targets.
- 3a56c18: [simulator] The simulator's example now shows Intercessors led by a Captain and supported by a Lieutenant against Lychguard and their Overlord, with a stratagem, an enhancement and half range in play.
- 3a56c18: [simulator] Hit, wound, critical, stat, Sustained Hits, invulnerable save and Feel No Pain modifiers in the simulator are now steppers: press − or +, pick a value, or tap the name to clear it.

### Patch Changes

- dd9252f: [app] Pages and docs about assistants now say they mean AI assistants such as Claude or ChatGPT.

## 0.237.0 (2026-11-13)

### Minor Changes

- 4fdda58: [app] A bell right of your account picture now lists your friend requests, new battles and group and tournament news on the website, and **More** › **Notifications** shows the same list in the app, read or unread on every device.

### Patch Changes

- d4abb97: [app] Answering a friend request, joining a battle you were invited to, sealing a list, or accepting or declining an entry or group request marks its notification read on every device.
- d4abb97: [app] The app clears notifications you've read elsewhere from your phone and keeps the number on its icon to your unread ones.
- d4abb97: [app] Tapping a push notification marks that notification read.

## 0.236.0 (2026-11-13)

### Minor Changes

- 2ba7867: [battles] Add an ally to either side of a battle from setup, rather than choosing one against two or doubles before it opens.
- 2ba7867: [battles] Battles offers to continue a draft you've started.
- 6a512cb: [assistant] Agents can start a battle with only you at the table and give you a link your opponent opens to join it with their account.
- 2ba7867: [battles] The battle link shows who invited you and the battle size, and joins you on the side you chose as soon as you're signed in.
- 2ba7867: [battles] New battle opens setup straight away, with just you at the table, and stays a draft out of your battles until everyone has joined with an army.
- 2ba7867: [battles] Choose, change and remove armies, and set Battle ready, on the cards at the top of battle setup instead of a separate Armies step.
- 2ba7867: [battles] Bring your opponent into a battle from setup by sharing a link or QR code, inviting a friend, or playing both sides yourself.

### Patch Changes

- 2ba7867: [battles] Whoever started a draft battle can remove a player who joined it, until everyone's army is in.
- 2ba7867: [battles] Battle setup keeps every step open, fading the ones you haven't reached yet.
- 2ba7867: [battles] Battle setup asks how you track the battle first, and says what Guided gives you.
- 2ba7867: [battles] Battle setup no longer sets points per army by hand: a pair facing one player shares its side's points, and doubles armies bring half each.

## 0.235.1 (2026-11-13)

### Patch Changes

- cefccee: [reference] Search reads what units' abilities do only while online, and the roster builder's unit picker no longer matches it.

## 0.235.0 (2026-11-13)

### Minor Changes

- 6d5131c: [battles] A battle's size now follows the lists from the first one chosen, with each side playing to its lists added together, so two 1,000-point allies make a 2,000-point side.
- 6d5131c: [battles] In a 2v1 battle the pair now always shares its side's points, so it plays 2,000 against 2,000 and the allies split their 2,000 however they agree.
- 6d5131c: [events] Solo vs pair tournaments and hidden-list games now always let the pair share its points, including games already set up.
- 6d5131c: [battles] A duel between lists built for different sizes is no longer blocked: the bigger list sets the size and setup says which side plays short.

## 0.234.0 (2026-11-13)

### Minor Changes

- a73bbd0: [events] Choosing or sealing a roster can now be searched, filtered by faction, detachment, battle size, legality and points, and sorted, as in your roster library.

### Patch Changes

- a73bbd0: [app] Pressing Escape in a search box inside a dialog clears the search instead of closing the dialog.

## 0.233.0 (2026-11-13)

### Minor Changes

- 6c0ab1c: [battles] Every seat in a new battle now belongs to an account, so each game counts for everyone who plays it; play both sides against a practice opponent to track a game on your own.

### Patch Changes

- 6c0ab1c: [battles] Battles you started against a guest before this change still open, replay and can be finished from your account.

## 0.232.7 (2026-11-13)

### Patch Changes

- ae07278: [rosters] Ability, wargear, and enhancement text loads again for devices that had not loaded it before.

## 0.232.6 (2026-11-12)

### Patch Changes

- b9af5c0: [simulator] The simulator's Cold Fervour adds +2 Strength to Destroyer Cult weapons once instead of twice, including a Cryptek with Murdermind.

## 0.232.5 (2026-11-12)

### Patch Changes

- fd9eb60: [rosters] Anathema Psykana units can now embark in the Anathema Psykana Rhino.

## 0.232.4 (2026-11-11)

### Patch Changes

- 75fb5d7: [simulator] Simulations you run from a roster, a battle or a roster comparison now appear in Recent simulations.
- 75fb5d7: [simulator] The simulator page no longer lists your battles in progress; simulate from the battle itself instead.

## 0.232.3 (2026-11-11)

### Patch Changes

- dcb3fe6: [assistant] When an assistant starts a tournament battle or reports a score for you, the approval now names your opponent and the round.
- dcb3fe6: [assistant] Assistants now record the end-of-game scoring after the last turn, so the battle finishes.
- dcb3fe6: [assistant] Assistants now refuse secondary missions that can't be taken fixed, instead of leaving the battle unable to start.
- dcb3fe6: [assistant] Assistants setting up a battle now drop the old pack's twist when you change mission pack, and clear the pack and layout when you switch to manual tracking.

## 0.232.2 (2026-11-11)

### Patch Changes

- e430dcd: [rosters] Each Templar Vow and Combat Doctrine now starts on its own line instead of running into the option before it.

## 0.232.1 (2026-11-11)

### Patch Changes

- e20120a: [rosters] Roster grades count each model's wounds and objective control correctly in units with different model types.

  Roster grades explain which damage gaps they check and which sources of protection they leave out.

- e20120a: [rosters] Roster grades distinguish charge reach and deployment from general mobility, show normal and recognised conditional movement separately, and account for slower attached models.
- 9630cfa: [reference] Weapon ability tooltips such as Indirect Fire, Assault and Stealth now show the core rule they point to, not just its number.
- e20120a: [rosters] Attached units display weapon abilities granted by their leader's unit-wide rules, including Alpha Warrior's Sustained Hits 1.
- e20120a: [rosters] Roster grades show recognised abilities that create extra units and their conditions separately from the score.

## 0.232.0 (2026-11-11)

### Minor Changes

- 79c51a7: [assistant] Assistants can now search your battles by result, army, opponent, mission pack and date.
- 79c51a7: [assistant] Assistants can now summarise a finished battle from its report, and delete a battle you created.
- 79c51a7: [assistant] Assistants can now set up a battle from start to first turn, see who you can play, and know what the battle needs next.
- 79c51a7: [assistant] Assistants connected to Praetorium can now check a list for problems without saving it.
- 79c51a7: [assistant] Assistants can now read the models in your collection to build lists from what you own.
- 79c51a7: [assistant] Assistants can now run every unit in your list against every unit in another, like the simulator's roster comparison.
- 79c51a7: [assistant] Assistants can now tell you what changed in each points and datasheet update.
- 79c51a7: [assistant] Connected AI assistants can now compare every detachment a faction can take before choosing one.
- 79c51a7: [assistant] Assistants connected to Praetorium can now grade a list the same way the roster builder does.
- 79c51a7: [assistant] Assistants can now bring in a list you paste from another app, and give you a list's text export or exchange code.
- 79c51a7: [assistant] Connected AI assistants now follow Praetorium's guides for building, grading and tuning a list, comparing units, answering rules questions and tracking battles.
- 79c51a7: [assistant] Assistants can now look up force dispositions and the missions, deployments and terrain for any pairing of them.
- 79c51a7: [assistant] Assistants can now find the best wargear for a unit against a target, the same way Optimize does on the simulator.
- 79c51a7: [assistant] Assistants can now read your groups, leagues, tournaments and hidden-list games, seal your list, check you in, start your table's battle and report its score.
- 79c51a7: [assistant] Connected AI assistants can now plan how your list plays against an opponent's army and mission.
- 79c51a7: [assistant] Assistants can now read your win rates and leaderboard places.
- 79c51a7: [assistant] Assistants can now copy, archive or delete your rosters.
- 79c51a7: [assistant] Assistants can now help you choose fixed or tactical secondary missions for a game.
- 79c51a7: [assistant] Assistants can now simulate a unit that has already lost models or wounds.
- 79c51a7: [assistant] Assistants can now simulate a unit with the wargear from your saved list, not just its default loadout.
- 79c51a7: [assistant] Assistants connected to Praetorium can now choose your Warlord, enhancements and wargear when they build a list.

### Patch Changes

- 79c51a7: [assistant] The assistant consent page and Connected apps now list everything an assistant's access covers.
- 2b6c0e5: [assistant] When an assistant copies a list or makes a variant of it, it now tells you whether the copy will be public.

## 0.231.11 (2026-11-11)

### Patch Changes

- 74760cf: [battles] The battlefield name in a battle now opens the full map with its measurement toggles, the same view as setup and the mission pages.
- 7bb067d: [simulator] After a battle ends, Simulate can pick destroyed units again, at full strength, to look back at a fight.
- 5f94110: [simulator] The simulator's model limit note no longer overlaps the leader row under it.
- ef22d33: [simulator] A roster unit's leaders and support units show as plain names in the simulator, since a saved roster fixes them.
- 5f94110: [simulator] The simulator's roster unit list shows a leader together with the unit it leads, as one choice.

## 0.231.10 (2026-11-11)

### Patch Changes

- 8b7cb6e: [rosters] New Recruit share links to Crusade lists import with their detachment and battle size, without flagging Order of Battle and Configuration as unknown units.

## 0.231.9 (2026-11-11)

### Patch Changes

- 644b2b0: [battles] Drawing Beacon now asks which unit is your beacon.
- 644b2b0: [battles] A Beacon card whose unit was destroyed now says so and is pre-selected for discard at the end of your turn.
- 0c0fd90: [battles] Triangulation, Gather Intel, Vital Link and Death Trap now ask where you placed operation markers at the end of your turn and keep them on the card.
- 0c0fd90: [battles] Surveil the Foe now asks which opposing operation markers you removed, and Sensor Sweep can remove a marker from any mission, not only Locate and Deny.
- 0c0fd90: [battles] Smoke and Mirrors now asks which objectives you decoyed at the end of your turn and keeps them on the card for the rest of the battle.

## 0.231.8 (2026-11-11)

### Patch Changes

- 0b1e6ad: [reference] Search shows the results named after what you typed first, so searching "cover" opens on the Benefit of Cover rule instead of datasheets that mention it.

## 0.231.7 (2026-11-11)

### Patch Changes

- e170817: [battles] Battle reminders now wait until you finish scoring, drawing secondaries or another open prompt, instead of covering it.

## 0.231.6 (2026-11-11)

### Patch Changes

- 02cd326: [battles] Clicking a folded battle setup step's answer opens that step to change it.
- 02cd326: [battles] Battle setup shows a Choose army button under each player with no army yet, so the list chooser is in reach on a phone without scrolling.

## 0.231.5 (2026-11-11)

### Patch Changes

- a19eb94: [rosters] The builder's Share menu item shows whether the roster is private, unlisted or public.
- a19eb94: [app] Action and right-click menus use the same roomier, sentence-case rows everywhere.
- a19eb94: [rosters] The roster menus group their actions under Play, Edit, Share and Copy, in the same order in the builder and on the Rosters page.

## 0.231.4 (2026-11-11)

### Patch Changes

- 62a5b15: [assistant] Assistants comparing units can give a character an enhancement from its detachment, such as a Feel No Pain.
- 62a5b15: [assistant] Assistants comparing units can name nearby units, such as a character, so their auras can apply to a unit they are not leading.
- 62a5b15: [assistant] Assistants comparing units now fight with the stronger of a model's melee weapons or weapon profiles against the defender, instead of the first one listed.
- 62a5b15: [rosters] Roster grades now count a unit's stronger weapon choice, so a Skorpekh Lord is graded with its hyperphase harvester rather than its flensing claw.
- 62a5b15: [assistant] Searching an army's units from an assistant now finds a unit whose name is misspelt.
- 62a5b15: [simulator] Comparing two rosters now scores each pairing with the weapon choice that does most against that target.
- 62a5b15: [simulator] The simulator now starts a model on the weapon or weapon mode that does most against the defender, instead of the first one listed.

## 0.231.3 (2026-11-11)

### Patch Changes

- cfa1278: [rosters] Roster grades colour each score by its grade, from green for an A to rust for a D, and mark each category with an icon.
- 24b9858: [rosters] Roster grades show Damage in its own column on wider screens, so the two columns come out about the same height.

## 0.231.2 (2026-11-11)

### Patch Changes

- 10eaf9f: [rosters] Damage grades count everything a unit can kill in a turn, so a unit that can take out several vehicles is no longer counted as one.
- 408f868: [rosters] Cheap screens and support units no longer lower a roster's damage and durability grades.
- 10eaf9f: [rosters] Roster grades follow a gentler curve: a typical tournament list scores about 70, and the strongest lists reach the 90s.
- 0c8cfba: [rosters] Roster grades mark a unit whose weapons or profile the simulator cannot read as not calculated, instead of counting it as dealing no damage or taking none.
- 408f868: [rosters] Roster grades compare a list with tournament lists of its own faction and battle size, so small lists and armies the simulator underrates are no longer marked down.

## 0.231.1 (2026-11-11)

### Patch Changes

- a989d64: [reference] Detachment pages for Creations of Bile, Renegade Warband, Fist of the God-Emperor, Medusa's Wrath, Shadowmark Talon and Skitarii Hunter Cohort no longer list their detachment rule twice.
- a989d64: [reference] Darkflight Pursuit no longer lists the Nightforged Battery upgrade twice.

## 0.231.0 (2026-11-11)

### Minor Changes

- cb33027: [rosters] Roster grades score a list out of 100 on board control, mobility, damage and durability against lists that place at tournaments, and name the gaps worth knowing about; open them from **Grade this roster** in the roster menu or on its card in your rosters.

## 0.230.3 (2026-11-11)

### Patch Changes

- b2843e3: [app] Battle and data update pages no longer download every faction's summary just to link to the armies already on screen.
- b1c4b9a: [rosters] Saved lists price and check legality faster, so the roster library and shared lists load sooner.
- 1cbf8ac: [events] A group's page opens faster when its battles have not changed since it was last read.
- 868b4f3: [rosters] The roster library no longer reprices lists it already priced when you change the sort or filter by legality or points.
- 3576c5c: [battles] Watched and finished battles open faster, since they no longer download the battlefield terrain until you open the map.

## 0.230.2 (2026-11-11)

### Patch Changes

- fdb7166: [rosters] A unit you can't add yet now names what unlocks it, such as "Add a Khorne Battleline unit to the roster first." for allied Daemons.

## 0.230.1 (2026-11-11)

### Patch Changes

- f92aa27: [reference] Detachment pages no longer list an enhancement or upgrade twice when sources print it with or without a qualifier such as (Psychic) or (one per army).
- f92aa27: [reference] Detachment pages no longer list core rules such as Lethal Hits or a misspelt second copy of the detachment's own rule.

## 0.230.0 (2026-11-11)

### Minor Changes

- f2d2833: [rosters] The filters on the Friends, Public and Played roster tabs now show how many lists each choice finds, including **0** for factions nobody has listed.

### Patch Changes

- f2d2833: [battles] Filtering played armies by **Against army** now also finds battles against that faction under an older rules version.

## 0.229.5 (2026-11-11)

### Patch Changes

- eb95ac8: [battles] Watching a battle being set up no longer asks you to choose an army for a guest's seat; it says the seat is waiting.
- a83c753: [reference] Rules, abilities, stratagems, enhancements and wargear options that the sources list with printed squares or dots now show those points as a bulleted list instead of one run-on paragraph.

## 0.229.4 (2026-11-11)

### Patch Changes

- 6229356: [battles] Watching a battle you are not playing in now follows each move as it happens, without reloading.

## 0.229.3 (2026-11-10)

### Patch Changes

- d5183ca: [battles] Battle setup's Format step now says the battle size comes after the armies, instead of "Determined by your rosters", until every list is in.
- cdbe543: [battles] Public and friends' games now list the most recently played first, and a battle nobody has started leaves them two days after its last change, until it begins.
- d5183ca: [battles] Watching a battle that has not started now shows its setup, with each side's choices so far, instead of an empty scoreboard.

## 0.229.2 (2026-11-10)

### Patch Changes

- 484111e: [events] Groups have a Battles tab listing every game played for the group, with filters, and Recent games links to it.
- 484111e: [battles] A player's Battles tab now lists every battle you may watch them in, with the same filters as the Battles page, and keeps the Record tab's filters when you switch to it.
- 484111e: [rosters] A player's Rosters tab can be searched, filtered by faction, detachment, battle size and points, and sorted.
- 484111e: [events] A tournament's battle list can be searched and filtered by status, army, player and more.

## 0.229.1 (2026-11-10)

### Patch Changes

- fb035f5: [app] Battle lists, group and tournament pages, player records, the home page and played armies load faster, and stay fast as more battles are played.

## 0.229.0 (2026-11-10)

### Minor Changes

- 0336f3a: [rosters] Your rosters can now be grouped by faction, detachment, or battle size, with the sort you chose kept inside each group, and each group can be folded away.

### Patch Changes

- 93cd269: [app] Changing a filter, the sort, or the search on the roster, battle and profile lists no longer jumps back to the top of the page.

## 0.228.11 (2026-11-10)

### Patch Changes

- 9e9d613: [app] Changing a filter on the battle lists, the public, friends' and played rosters, or a player's record now keeps the page on screen and says it is updating, instead of blanking the page while it loads.

## 0.228.10 (2026-11-10)

### Patch Changes

- 49f0b97: [app] Pages open faster on a first visit, because each page now downloads much less of the app before it starts.
- addadcc: [rosters] Your roster list no longer jumps when it finishes loading.

## 0.228.9 (2026-11-10)

### Patch Changes

- 193a637: [rosters] A leader now gets the defences of the bodyguards it leads, and the shooting + melee estimate ends them in melee when shooting destroys the bodyguards.

## 0.228.8 (2026-11-10)

### Patch Changes

- 1562d55: [events] Changing only a tournament's Swiss rounds or a duel's points total now saves.
- d71dc96: [events] The help pages now say exactly who can read a sealed roster and which battles count on the leaderboard.
- 946352a: [app] Try again on the app's could not load screen reopens the page you were on.
- a1d6e9e: [rosters] Fixed several cases where saving or using a roster could unexpectedly switch it to older rules.
- 946352a: [simulator] The simulator says once, not twice, when a unit could not load.

## 0.228.7 (2026-11-10)

### Patch Changes

- f038208: [simulator] The combat simulator now calculates Conversion weapons, such as the Brôkhyr Thunderkyn's SP conversion beamer, instead of refusing them.

## 0.228.6 (2026-11-10)

### Patch Changes

- 5065332: [rosters] Importing a New Recruit link no longer flags a combined weapon that newer data splits up, such as a Bolt Rifle w/ Grenade Launcher, when its parts were imported.

## 0.228.5 (2026-11-09)

### Patch Changes

- 438b328: [simulator] In the combat simulator, attack buffs written for a whole unit now reach every model in its attached unit, and a leader's unit-wide defences now protect its bodyguards.
- 438b328: [simulator] In the combat simulator, Trajann Valoris's Captain-General aura now re-rolls the attacks of the unit he leads and of nearby Adeptus Custodes units, not only his own.

## 0.228.4 (2026-11-09)

### Patch Changes

- bd45db6: [battles] Finished battles no longer show the Teams event scoring switch.

## 0.228.3 (2026-11-09)

### Patch Changes

- 222cc29: [simulator] Weapon cards in the combat simulator show the hit roll a shooting type's -1 leaves them needing, instead of the printed BS.

## 0.228.2 (2026-11-09)

### Patch Changes

- b3e2626: [rosters] Imported Sentinel Guard, Aquilon and Gyrfalcon Custodes squads no longer warn about their model names.
- b3e2626: [rosters] A pasted list with the setup lines above its units cut off now imports, working out the army from its units.

## 0.228.1 (2026-11-09)

### Patch Changes

- c6f7dcf: [events] Players are notified when an organizer sets or clears their battlefield, and organizers are prompted to set each round's.
- c6f7dcf: [events] Group organizers now see Set battlefield on a revealed hidden-list game.
- 385bda6: [rosters] Other sites can now send a list straight to Praetorium's import review.
- d0f590f: [events] Ending a group's league keeps its final table under Past leagues, so a group can run one after another.
- c6f7dcf: [events] Organizers can set the battlefield ahead of solo vs pair and doubles games, in groups and tournaments.
- 52c0a35: [events] A Swiss tournament table can record its final score without tracking the game.
- 42b95de: [events] Organizers can swap players between Swiss tables before their battles start.
- 42b95de: [events] Organizers can run a shared round clock for a Swiss tournament.
- 7dc3e04: [events] Swiss tournaments can check players in before round 1 and drop the no-shows.
- a624046: [events] Tournament organizers can break ties on strength of schedule before victory points.

## 0.228.0 (2026-11-09)

### Minor Changes

- fdf35f0: [simulator] Each unit in a battle has its own Simulate button, which starts the combat simulator with that unit.
- fdf35f0: [simulator] The combat simulator lists your battles in progress, so you can start from your units' current models and wounds.

### Patch Changes

- fdf35f0: [simulator] A model's Damaged rule switches on by itself in the combat simulator when its wounds in the battle are in range.

## 0.227.3 (2026-11-09)

### Patch Changes

- e943320: [simulator] Weapon odds beside loadout options follow the shooting type you've chosen in the combat simulator.
- e943320: [simulator] The combat simulator can work out shooting at a Monster or Vehicle that's engaged with your other units.
- e943320: [simulator] Weapons in the combat simulator show when a shooting type gives them -1 to hit.

## 0.227.2 (2026-11-09)

### Patch Changes

- 0f502aa: [events] Organizers can set or roll a tournament table's battlefield ahead of the game, and players can't change it.

## 0.227.1 (2026-11-09)

### Patch Changes

- deea622: [reference] Where rules text isn't loaded, the prompt now names the source to turn on, and the sources dialog marks it.

## 0.227.0 (2026-11-09)

### Minor Changes

- c5e943c: [simulator] The combat simulator can now work out assault shooting after advancing and close-quarters shooting while engaged.

## 0.226.8 (2026-11-09)

### Patch Changes

- e2fb05d: [rosters] Four-digit unit prices in the list builder stay on one line.

## 0.226.7 (2026-11-09)

### Patch Changes

- 14b7ec3: [app] When the app falls back to its saved offline copy, it now offers to reload once you're back online.

## 0.226.6 (2026-11-09)

### Patch Changes

- 09bbd77: [rosters] Allied units are sorted into their usual categories when you build a roster.
- 74609bc: [rosters] Pasting a Warscribe share link now tells you to copy the list as text.
- 09bbd77: [rosters] Chaos Questoris Knight Magaera is listed with the other Chaos Knights instead of as an ally.
- 92e1a7c: [battles] When you play a guest, you can paste their list while setting up the battle.
- 92e1a7c: [battles] A finished practice game now offers to start one against a real opponent.
- 92e1a7c: [battles] A manual battle against a guest can start without entering their army.
- 09bbd77: [simulator] The combat simulator no longer asks for a firing mode on a weapon the unit isn't shooting.

## 0.226.5 (2026-11-09)

### Patch Changes

- 842987c: [rosters] Importing a tournament list keeps each leader attached when the list writes "Leading:" on its own line.
- 842987c: [rosters] An imported list with an option left empty no longer asks you to reselect that unit's options.

## 0.226.4 (2026-11-09)

### Patch Changes

- 9aede33: [rosters] Importing an Ork squad reads its "Boss Nob" as the squad's Nob.
- 9aede33: [rosters] Importing a full squad that fields a second companion, such as twenty-two Neurogaunts, keeps every model.
- 9aede33: [rosters] Importing a Soul Grinder with no stated god keeps the unit and says which god it came in as.
- 9aede33: [rosters] Importing reads the official app's "Transdimensional isolator".

## 0.226.3 (2026-11-09)

### Patch Changes

- 0120225: [rosters] Chaos Daemons units are sorted into their usual categories when you build a roster, instead of being listed as allies.
- 0120225: [rosters] Imperial Knights and Chaos Knights units are sorted into their usual categories when you build a roster, instead of being listed as allies.

## 0.226.2 (2026-11-09)

### Patch Changes

- c26d77e: [reference] Detachment pages end with an offer to build a list with that detachment.

## 0.226.1 (2026-11-09)

### Patch Changes

- 22d224a: [app] Signing in with Google, Apple, Discord or GitHub in the app no longer sometimes fails and makes you start again.
- 7848270: [events] Group pages load faster for groups with many played battles.
- 05b968b: [rosters] Importing a Warscribe list keeps every weapon of a list of single models, and its squads' lone specialists.
- 9d88b50: [battles] A battle action that fails because the connection dropped now says to check your connection, instead of asking you to review an old sync conflict.
- 9d88b50: [battles] Drawing secondary missions at random no longer fails with "Your opponent got there first" when your opponent acts at the same moment.

## 0.226.0 (2026-11-09)

### Minor Changes

- 55539e2: [battles] Sort any battle list oldest first.
- 55539e2: [app] Saved filter views and pinned filters now follow your account across devices.
- 55539e2: [rosters] Filter every roster list by legality and by points.

### Patch Changes

- d69716a: [rosters] Importing keeps a comma inside a bracketed weapon note as one piece of wargear.
- d69716a: [rosters] Importing reads Warscribe's text exports.

## 0.225.3 (2026-11-09)

### Patch Changes

- 2d28d6c: [battles] Start a battle straight from a roster with a button beside its menu.

## 0.225.2 (2026-11-09)

### Patch Changes

- 9642b89: [events] Starting a battle no longer offers hidden-list games that are already over.

## 0.225.1 (2026-11-09)

### Patch Changes

- 8e439a5: [battles] Battle lists and group standings update as soon as a battle ends.
- 8e439a5: [rosters] Trying to add a unit to a full roster now tells you the roster is full.
- 8e439a5: [rosters] When pasted text is not a list we can read, the import now shows which exports work.
- 8e439a5: [rosters] The reason a plus button has stopped at its limit is now easier to see.
- 8e439a5: [rosters] The add units list now shows what your next copy of a unit will cost when later copies are priced differently.
- 8e439a5: [battles] Choosing a roster in battle setup now tells you when it did not save, at the top of the list where you can see it.
- 8e439a5: [battles] Starting a battle keeps the dialog open until the battle appears, so it no longer looks as if nothing happened.

## 0.225.0 (2026-11-09)

### Minor Changes

- d6d447f: [battles] Every Battles tab can now be searched and filtered by status, result, army matchup, opponent, battle size, game type, mission pack, deployment and date.
- d6d447f: [rosters] Every Rosters tab now has a search box and filters you can combine, including choosing several values or ruling one out.
- d6d447f: [battles] Save the filters you use most as a named view, and choose which filters stay in the bar on Battles and Rosters.

## 0.224.7 (2026-11-09)

### Patch Changes

- 8fa96e1: [rosters] Export text is back in the roster menus, so you can copy a list without opening Share first.
- 8fa96e1: [reference] Tapping anywhere on the "Rules text isn't loaded" line now opens the sources to choose from.

## 0.224.6 (2026-11-08)

### Patch Changes

- d71edc3: [reference] Alerts set on Adeptus Custodes upgrades before they moved to Unit upgrades keep working.

## 0.224.5 (2026-11-08)

### Patch Changes

- 170e0ec: [app] Pages no longer stall for a few seconds just after an update.
- a8abb30: [rosters] Every unit upgrade now appears in the builder the same way, including Adeptus Custodes and Space Marines upgrades that showed as plain wargear.

## 0.224.4 (2026-11-08)

### Patch Changes

- d6e19e0: [rosters] Resizing Jakhals between 10 and 20 models now keeps their mauler chainblades.
- 3762d1e: [simulator] The simulator's results bar now shows average damage without stopping at the target's total wounds, so attackers that all usually destroy it can be compared.

## 0.224.3 (2026-11-08)

### Patch Changes

- 03ba2c1: [rosters] Jakhals can now be fielded as a unit of 20, with both Dishonoured, in the roster builder and combat simulator.

## 0.224.2 (2026-11-08)

### Patch Changes

- 2709bed: [app] The site no longer freezes for about twenty seconds shortly after an update.

## 0.224.1 (2026-11-08)

### Patch Changes

- b0517ba: [app] Home no longer offers the mobile app to players who have opened it in the past month.

## 0.224.0 (2026-11-08)

### Minor Changes

- 6a53a7f: [app] The Achievements tab on a profile now shows the player's latest three medals at the top.

## 0.223.0 (2026-11-08)

### Minor Changes

- b4d1503: [battles] Select a stratagem's name in the battle events to read what it does.

### Patch Changes

- c2536ce: [battles] Recorded guard and consecration choices on a mission card now show each objective above its unit, so the list is easier to scan.

## 0.222.13 (2026-11-08)

### Patch Changes

- f6ada17: [simulator] Test targets no longer leaves whole rows uncalculated when the server is slow to load units.
- f6ada17: [app] Timed-out requests now say that they took too long instead of showing a browser error.

## 0.222.12 (2026-11-08)

### Patch Changes

- 51eeaad: [rosters] Twenty-model Khorne Berzerkers can now take all four eviscerators.
- 51eeaad: [rosters] Ten-model Purifier Squads, and other squads whose special weapon limit grows with size, can now take all the special weapons they are allowed.

## 0.222.11 (2026-11-08)

### Patch Changes

- a1c6663: [app] Your profile picture now lines up with the search button in the phone header.
- 5cfdb2d: [app] Friends has left the account menu, now that the navigation and the More page list it.
- e3497fb: [app] The App Store and Google Play badges on Home no longer squeeze the text beside them on narrow screens.
- 3aab117: [app] The desktop navigation now has Friends, Discord and GitHub under Community, matching the phone's More page.

## 0.222.10 (2026-11-08)

### Patch Changes

- 76d0998: [app] The signed-out home page now points to the faction datasheets on their own, without separate links to missions and rules.
- dce37a2: [app] A saved offline copy of the app from an older release no longer shows an error page.
- 7b96ea1: [app] Pages translated by your browser no longer break with an error page when buttons change.

## 0.222.9 (2026-11-08)

### Patch Changes

- 7f99d3a: [app] A sudden flood of automated visitors no longer takes the site offline for players.
- d14ba2c: [rosters] When a unit is at its limit, its menu now says why Duplicate unit is unavailable.
- 5010aaa: [rosters] Your rosters no longer jump down the page as the library finishes loading.
- d07261e: [rosters] When a plus button stops at a limit, such as a unit's largest size, the limit now shows next to it without moving the controls around it.

## 0.222.8 (2026-11-07)

### Patch Changes

- 9ab2b6e: [rosters] Importing from the official app in another language reads models only a datasheet's composition names, as the French "Chef de Meute de Griffes Sanglantes".
- 9ab2b6e: [rosters] Importing from the official app in another language reads a detachment another faction's card names, as Space Wolves' French "Force d’Assaut Terminator".
- 9ab2b6e: [rosters] Importing from the official app in French reads Wolf Guard Headtakers.

## 0.222.7 (2026-11-07)

### Patch Changes

- 708d763: [reference] Missions stays highlighted in the side menu on a force disposition's page, and battle setup no longer says allies must split points evenly when they don't have to.

## 0.222.6 (2026-11-07)

### Patch Changes

- 7b7f1eb: [app] The docs are rewritten in plainer language, with the most common task first on each page.

## 0.222.5 (2026-11-07)

### Patch Changes

- d0d485d: [app] The side menu now keeps Groups, Tournaments and Leaderboard together under Community.

## 0.222.4 (2026-11-07)

### Patch Changes

- 473e5a0: [reference] Force dispositions now live on the Missions page, so the separate Dispositions page and menu entry are gone; each disposition's own page still lists its missions and detachments.
- 473e5a0: [app] On phones, the Discord and GitHub links have moved from the top bar to the Community section of More, and Docs is now a tile at the top of More.

## 0.222.3 (2026-11-07)

### Patch Changes

- 98f1006: [app] Each Android beta step shows the Google page it opens, with the button to tap ringed.

## 0.222.2 (2026-11-06)

### Patch Changes

- 6862ff1: [app] The Android beta steps say to sign in to Google before joining the testers' group, which offers no way to join while signed out.
- 8e518be: [app] Fixes a page reload sometimes failing with an error when the site was slow to respond.

## 0.222.1 (2026-11-06)

### Patch Changes

- 185d42e: [app] The app store badges sit in a slim strip under Home's opening band, showing only Google Play on an Android phone, and the Android beta links each of its three steps directly.
- af93d1c: [app] The sign-in and password reset pages use the slim top bar instead of the side navigation.

## 0.222.0 (2026-11-06)

### Minor Changes

- 8795f57: [app] Android players can join the app's beta from Home, and the mobile app guide explains how.
- 8795f57: [app] Home shows where to get the iPhone and iPad app from the App Store, and Safari on an iPhone offers it in a banner.

## 0.221.8 (2026-11-06)

### Patch Changes

- c0962ff: [simulator] Keep recent simulations and roster lists on screen when a list fails to load during a short outage.

## 0.221.7 (2026-11-05)

### Patch Changes

- fc2b8f0: [rosters] Importing ListForge short text reads options whose names hold a comma or end in brackets, as "1 mauler chainblade, 7 chainblades" or "Drakolithe (Once per battle, per token)".

## 0.221.6 (2026-11-05)

### Patch Changes

- a560863: [rosters] Importing reads Ironbuilt's text export.

## 0.221.5 (2026-11-05)

### Patch Changes

- c7b0952: [rosters] Importing War Organ text keeps its attached units when the paste lost its indentation, and reads a faction followed by its other name in brackets.
- 700d4c8: [rosters] Imported Storm Guardians and similar squads no longer double the special weapons several loadouts share.
- 700d4c8: [rosters] Importing reads a sergeant the official app names after his squad, as a "Purgator Justicar".
- c7b0952: [rosters] Importing Warmind text reads datasheets and detachments marked "(Codex)" and pastes that kept only the rule over the faction, and leaves out units added during a battle without warning about them.

## 0.221.4 (2026-11-05)

### Patch Changes

- af63688: [rosters] Imported wargear joined by "and" keeps a count stated on one of its pieces, as "2x Twin Neutronium Cascade Projectors".
- af63688: [rosters] Importing ListForge text keeps attached units when the paste lost its indentation.
- af63688: [rosters] Importing reads ListForge's short text export.

## 0.221.3 (2026-11-05)

### Patch Changes

- 0167d59: [rosters] Importing reads New Recruit's Markdown export.
- 548a739: [rosters] The import review names the data update that removed a detachment, datasheet or enhancement for armies on the current rules version too.

## 0.221.2 (2026-11-05)

### Patch Changes

- 7204251: [rosters] The import review names the data update that removed a datasheet, detachment or enhancement an older list still takes.

## 0.221.1 (2026-11-05)

### Patch Changes

- c4f23dc: [rosters] The import review says when a list was exported from older official-app data, which explains names it can no longer match.

## 0.221.0 (2026-11-05)

### Minor Changes

- 109400b: [battles] Army names at the top of battle setup now open each side's roster.

## 0.220.5 (2026-11-05)

### Patch Changes

- 2764a7d: [battles] Recording casualties during a battle no longer counts a model twice while the app waits for the service.
- 974af93: [rosters] Importing from the official app reads the names its datasheet cards print, as "Dainal Komelius" or the French "Frimeurs".
- 68e666f: [rosters] Imported lists read a model named in the plural with "-men", as "Navis Armsmen".

## 0.220.4 (2026-11-05)

### Patch Changes

- 33d4918: [rosters] A list exported in another language keeps its translated unit, wargear and enhancement names, as the Spanish "Talismán del tormento".
- 8ed71a3: [rosters] Importing from the official app reads a long detachment name it wrapped onto two lines.
- f38ca4c: [rosters] Army text in another language imports offline as it does online.

## 0.220.3 (2026-11-05)

### Patch Changes

- 79119ce: [rosters] Khorne Berzerkers can take eviscerator and plasma pistol Berzerkers in the builder, and imported lists keep them.
- 8db6653: [rosters] Importing from the official app keeps a unit marked with "*" for a keyword footnote, which was left out.
- 8db6653: [rosters] Importing French official-app text reads its attached units, headed "Unité 1 Attachée".
- c86884a: [rosters] Importing a list whose faction is written "Imperial Agents" finds Agents of the Imperium.
- 24d0ad2: [rosters] Importing official-app text reads attachments marked with an asterisk, as "* Attached as: Leader (Character)", instead of reporting the line.
- 5b3fa44: [rosters] Importing official-app text keeps a bodyguard's enhancement listed above its attachment line, instead of reading the attachment as the enhancement.
- 00045bd: [rosters] Importing a list now reads a model the catalogue names with its loadout in brackets, such as a Sicarian Infiltrator Princeps, and sizes its squad correctly.
- 1a0147e: [rosters] Importing Carnifexes keeps the crushing claws their second arms take beside their deathspitters.
- 7416f48: [rosters] A list stated as Space Marines whose units name one chapter, as Marneus Calgar does, imports as that chapter.
- 7657283: [rosters] Importing an official-app list now reads "Close combat weapon" as the one melee weapon a datasheet starts with, such as a Prosecutor's gun stock.
- 30c8452: [rosters] Imported Techmarines keep the Omnissian power axe and servo-arm that other apps list separately.
- 10eb854: [rosters] Imported Crisis Battlesuit squads keep every drone the list states when it does not say which suit carries each.
- 2050ab3: [rosters] Imported cyclone missile launcher Terminators keep their power fist and storm bolter, leaving a thunder hammer and storm shield to the squad's plain Terminator.
- 7b5cb4b: [rosters] Importing an official-app list now reads a keyword its detachment grants, such as Houndpack Lance's Character, so War Dogs keep their enhancements and Warlord.
- 8d62868: [rosters] Imported Trygons keep their Character upgrade and the enhancement it opens.
- 16bb644: [rosters] Imported lists no longer report a Captain in Gravis Armour's power fist, or wargear spelled slightly differently from the catalogue such as an "Astartes chainsword", as missing.
- 827a984: [rosters] Imported Grey Knights lists read an "Ancient" or "Paladin Ancient" as the model carrying the Ancient's Banner, and keep the squad's narthecium beside it.
- a0ee2fa: [rosters] Imported Traitor Guardsmen squads no longer report their "Traitor Guardsmen" models as missing.
- 1b8ff99: [rosters] Imported Jakhals keep a mauler chainblade the official app lists without the squad's autopistols.
- cc80874: [rosters] Importing reads a wargear line that joins pieces with "and", as "Agent Firearm and Mystic Stave", as each piece the datasheet offers.
- edeccf6: [rosters] Imported lists keep models the official app prefixes with their faction or a keyword, such as a Chaos Cultist or a World Eaters Terminator.
- d399bcc: [rosters] Importing an official-app list now reads a model named for its loadout, such as a "Kill Team Heavy Intercessor with Melta Rifle, Bolt Pistol and Ceramite Fists".
- 3fc9178: [rosters] Importing an official-app list now reads a model named by its kind alone, such as a Terminator Assault Squad's "Terminator".
- 18e80ba: [rosters] Importing a list now keeps the wargear listed under a model with that model when the list names it differently, such as a Terminator Sergeant's thunder hammer.
- 6ab891e: [rosters] Imported lists keep models named without their unit's last word, such as a Paragon or a Vanguard Veteran.
- 2a9b514: [rosters] Importing official-app text joins attached groups the player renamed, instead of reading "Leader (Character)" and "Bodyguard" as wargear.
- d4b0887: [rosters] Imported Gaunt's Ghosts keep Colm Corbec, Elim Rawne, Hlaine Larkin, Bragg and Oan Mkoll.
- adbb6a2: [rosters] Imported squads no longer give a special weapon group more models than the squad has room for, so a Plague Marines list keeps its heavy plague weapon and gives the second plasma gun to its Champion.
- 30c8452: [rosters] Imported lists keep weapons that only some models can carry, such as Chaos Terminator reaper autocannons, Chaos Biker plasma guns and Canoptek Wraith particle casters.
- ad61eb9: [rosters] Importing a New Recruit list now counts the wargear a group of models holds after a choice the whole unit takes, such as Skorpekh Destroyers' hyperphase weapons.
- ec429f0: [rosters] Importing a New Recruit list now attaches a character to the unit it supports.
- 45faddd: [rosters] Importing a list no longer gives two models the same stated weapon, so a Battle Sisters Squad keeps its multi-melta, a Helbrute its second arm, a Deathwatch Terminator Sergeant his storm bolter and a Black Templars Lieutenant his power weapon.
- 3606a99: [rosters] Imported Ork lists keep models the official app names in the singular, such as a Flash Git.
- ffd374f: [rosters] Imported Hellions keep their Helliarch.
- 30c8452: [rosters] Imported lists split wargear between models that offer the same options, such as Crisis Battlesuit drones, Talos arms and Harlequin Players' weapons.
- d62da9d: [rosters] Importing official-app text reads a Soul Grinder by the allegiance it lists, as the Tzeentch Soul Grinder.
- fcfb2b6: [rosters] Imported lists keep wargear printed under a model that cannot carry it for the squadmate who can, such as an Intercessor Squad's grenade launcher listed under its sergeant or a Corsair Voidreavers blaster.
- 6c5e63f: [rosters] Imported lists keep models named by their profile, such as a Kill Team Intercessor with Jump Pack.
- 2675adb: [rosters] Importing an official-app list keeps an enhancement printed for a whole unit whose models it names, such as a Rogue Trader Entourage's Fleetmaster.
- 30c8452: [rosters] Imported lists keep a unit's icon when it is listed under the squad's champion, such as a Chosen or Chaos Bikers Chaos Icon and an Allarus Custodians Vexilla.
- 654fe18: [rosters] Imported lists keep models written with "with" where the builder writes "w/", such as a Company Veteran with bolt rifle.
- 96c3150: [rosters] Importing New Recruit's WTC text reads a unit's wargear wrapped onto the line under it, as "2x Tome-skull".
- 24d0ad2: [rosters] Importing WTC text in the official app's layout reads wargear listed on unbulleted lines under a model.
- 53d688f: [rosters] Importing from the official app reads a model whose first weapon is printed on the same line, as "4x Prosecutors • 4x Boltgun".
- 9573b8a: [rosters] Importing a list keeps a known detachment that is joined by "and" to one Praetorium does not offer.
- 3b6e6b7: [rosters] The builder offers a War Dog Executioner Snarling Rivalry, a Watch Master its enhancements, and a Titan or Watch Master the Warlord role, and imported lists keep them.
- 3ebd90d: [rosters] A Castigator and other units with nested optional wargear can take every option at once, such as both a storm bolter and a hunter-killer missile.
- 19f80fc: [rosters] Heavy weapon Terminators with the same heavy weapon can each take a different melee weapon.
- d5e4fcf: [rosters] Importing from the official app reads a list whose name starts with a number, as "1 - Imperialis Fleet".
- f5a81b2: [rosters] Importing from the official app reads lists with the battle size above the detachments, a note above the title, or a title without points.
- b4d916c: [rosters] Imported twenty-model Neophyte Hybrids squads keep all four of their heavy weapons.
- ff31ea3: [rosters] Importing from older versions of the official app matches squads it names by their models, as "Witchseekers" for Witchseeker Squad.
- 95fdfaf: [rosters] Lists exported in another language now match their translated faction, detachment and disposition names.
- 0c60a2f: [rosters] Importing from Warmind reads its newer text, which has no blank lines or closing "Built with Warmind" line.
- 667b13c: [rosters] Lists exported from WarOrgan can now be imported.
- ff1e14e: [rosters] Importing a WTC submission that holds a whole official-app export reads its setup lines and wargear instead of reporting them unread.
