## Reading the review

The top line names the list and how many entries matched, such as "9 of 10 matched entries". Below it you'll see:

- **Reported army**: the total your export stated, or "points not stated".
- **Matched entries at selected rules**: what the matched list costs in Praetorium today. This is the price that's saved and checked.
- **Battle size**, when the text named one.

![The import review for a fully matched list, showing Reported army: 1000 points and Matched entries at selected rules: 1000 points.](screenshot:import-a-roster-review 'Reported army and Matched entries at selected rules')

If anything didn't come across cleanly, two lists appear.

### Will not be imported

These are whole things the import left out, each with the reason. You'll see:

- A unit with no matching datasheet. The reason says whether the closest datasheet has a similar name ("the closest is …"), whether it's another faction's datasheet ("a Drukhari datasheet, not …"), or whether your faction has that name but not as a datasheet.
- A detachment that doesn't exist for the faction, again with the closest name if there is one.
- A line the importer didn't understand.
- A battle size Praetorium doesn't support, or a custom points budget it can't accept.
- A force disposition that wasn't recognised, or more than one stated at once. Choose one in setup afterwards.

### Will arrive as their datasheets build them

These units imported, but some of their choices didn't. The unit keeps its datasheet defaults for anything it couldn't apply. Each line says **Could not apply** and the reason:

- "an enhancement of the … detachment": the enhancement belongs to a detachment the list didn't take.
- "this datasheet cannot take that enhancement" or "this datasheet does not offer it".
- "nothing in the … catalogue is called that": the name doesn't exist for this army at all.
- "no model in the imported unit carries it": the option exists but none of the imported models can hold it.
- "this datasheet has no Warlord option".
- A model count such as "4 models" with "this datasheet fields 5 to 10 models".
- An attachment that couldn't be made (see [Characters and attachments](/docs/import-matching#characters-and-attachments)).

### Accepting

The main button changes with the result:

- **Import roster** when everything matched.
- **Import anyway** when something is listed above. Missing units are left out and unmatched wargear uses the datasheet defaults, so check those units in the builder.
- **Open imported draft** if you're not signed in.

![The import review listing Necron Warrior under Will not be imported and Chronomancer's Veil of Darkness enhancement under Could not apply.](screenshot:import-a-roster-shortfall 'Import anyway, below the two lists')

**Edit pasted text** (or **Edit code**) takes you back to the text so you can fix it and try again. **Cancel** closes without importing.

## Points don't match the export

The two totals differ when the export predates a points change, or when a unit or choice didn't match and was left out or fell back to defaults. Praetorium's figure is the one used for validation and battles; see [Data updates](/data-updates) for recent points changes.
