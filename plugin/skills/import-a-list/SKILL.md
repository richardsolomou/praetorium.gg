---
name: import-a-list
description: Bring an army list from the official Warhammer 40,000 app, New Recruit, BattleBase or another builder into Praetorium, report what didn't match, and check, grade, save or export it. Use when someone pastes a list or exchange code, or asks to import, check or convert a list from another app.
---

# Import a list

1. **Get the text.** Ask the player to paste the whole export: the official app's or New Recruit's text export, another builder's text, or a Praetorium exchange code (it starts `PR1.` or `PR2.`). `import_roster` can't open a link or read a roster file, so ask for the text when you're given one.
2. **Import it.** Call `import_roster` with the text. Nothing is saved.
3. **Report the review before anything else.** If `draft` is null, no faction matched: give the reasons in `review.notImported` and stop. Otherwise say how many entries matched (`matchedEntries` of `sourceEntries`) and the faction and `rulesVersion`. Then name every row:
   - `notImported`: units, detachments or lines left out, each with its reason. A reason may name the closest datasheet; don't swap it in without asking.
   - `builtByDatasheet`: units that came in but keep their datasheet defaults for the choices named, such as an enhancement or wargear that didn't match.
   - `reportedPoints` against `currentPoints`: they differ when a points update came after the export or something was left out.
   - `olderData`: the official app's data was older than Praetorium's; exporting the list again from the app may fix what didn't match.
   - `battleSizeStated` false: the draft uses Strike Force (2,000 points). Ask the player for the battle size and change `limit` if it's different.
4. **Check it.** Call `check_roster` with `draft`. Show its `summary` units and total, and every one of its `problems`. Never repair a mismatch by guessing a unit or option the export didn't name; ask the player, and use `list_units` for what the faction offers.
5. **Offer what's next:**
   - Grade it with the grade-a-roster skill.
   - Save it with `save_roster`, which needs their Praetorium account. Leave visibility private unless they ask.
   - Export it with `export_roster` for a tournament organiser or another app, or pass on its exchange `code`.
