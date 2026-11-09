Switch on what's in effect in **Rules & buffs**, add anything else in **Manual modifiers**, then check **Calculation uses** to see what was counted.

## Rules & buffs

This lists the rules on each side the simulator can calculate for this matchup, including those from attached units, enhancements and the detachment.

Always-on effects that only change a profile show **Stats applied**. Anything that depends on the table, like a target, a range, a stratagem or a once-per-battle ability, starts off. Switch it on when it's actually in effect.

A rule marked **Check range** is an aura, so confirm the distance yourself.

## Manual modifiers

Choose **All**, **Shooting** or **Melee**, then pick from these. A phase tab overrides **All**.

- **Rolls**: hit and wound modifiers, re-rolls and critical thresholds.
- **Command Re-roll**: the stratagem, once in that phase, on a hit, wound, save or Attacks roll.
- **Stats**: BS or WS, S, A, AP and D.
- **Abilities**: Sustained Hits, Lethal Hits, Devastating Wounds and damage re-rolls.
- **Situation**: **Cover (−1 BS)**, **Half range**, **Charged**, plus indirect fire and **Decline Lethal Hits** when a weapon has them.
- **Defender**: T and Sv changes, an invulnerable save, Feel No Pain, save re-rolls, **−1 Damage** and **Half damage**.

A dimmed chip wouldn't change anything. Hover it to see why. **Reset** clears every modifier and weapon choice.

![Manual modifiers on the Shooting tab with Cover selected.](screenshot:compare-loadouts-modifiers 'The All, Shooting and Melee tabs choose which attacks a modifier affects')

## Shooting type

A unit that can shoot in more than one way gets a **Shooting type** choice under **Shooting**. It starts on **Normal**.

- **Normal, target engaged**: against a Monster or Vehicle that's engaged with your other units. [BLAST] weapons can't fire and every attack is at -1 to hit.
- **Assault**: the unit advanced this turn, so only its [ASSAULT] weapons fire.
- **Close-quarters**: the unit is engaged and shoots a unit it's engaged with. Monsters and Vehicles fire everything except [BLAST] weapons, at -1 to hit unless the weapon is [CLOSE-QUARTERS] or [PISTOL]. Everything else fires only those weapons.

## Check what's included

**Calculation uses**, under the modifiers, lists everything behind the current numbers for each phase. Look here when a result surprises you.

![Calculation uses listing the profile changes, rules, weapon choices and a manual Cover modifier.](screenshot:compare-loadouts-calculation-uses 'Your manual modifiers appear on their own line for each phase')

## How some rules are applied

**Command Re-roll** re-rolls the first failed hit, wound or save roll no other rule already re-rolled, taking weapons in order, or the first single-die Attacks roll below its average. Hit rolls for indirect fire can't be re-rolled. A damage roll, an Attacks roll of several dice, and saves when the defender's models or critical wounds need different saves aren't calculated, and that phase says so.

Rules that re-roll one hit or wound roll, such as the Adeptus Custodes **Magna Imperator**, work the same way: the first failed roll of that kind each phase. An attached unit gets it once.

Rules that re-roll any Damage roll, such as Fire Dragons' **Assured Destruction**, re-roll only when a fresh roll is expected to take more wounds off the model the attack is allocated to. A roll that already destroys that model is kept.

**Voice of Command** on an Astra Militarum unit picks the Order it's under. Check that an officer who can issue that Order to the unit is in range.

**Aspect Shrine Token** appears once an Aeldari Aspect Warrior unit's loadout takes a token. Pick the phase and whether it changes a hit or a wound roll. It changes the first failed roll of that kind made by a model that isn't a **CHARACTER** to an unmodified 6, spending one token in that phase. It can't be combined with a **Command Re-roll** or another single re-roll in the same phase.
