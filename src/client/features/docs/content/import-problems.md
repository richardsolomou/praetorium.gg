## Common problems

### "Could not match … no faction is called that"

The faction line is missing or isn't a faction name. Copy the export again from the very top, and check the closest name the message suggests.

### "That looks like a … roster file, which Praetorium cannot read yet"

`.ros`, `.rosz` and `.regiztry` files can't be read. Use the text export in the app that made the list, and paste that instead. Praetorium counts these attempts, never their contents, to decide whether to support the files.

### "it is not a supported army-text export"

The paste isn't [a format Praetorium reads](/docs/import-a-list), or it's only part of a list. Paste the full text export, not a screenshot transcription.

### A unit is "a … datasheet, not …"

The faction line names a different army from the unit's, often because the export names a subfaction or the unit came from another book. Check the faction line, or add the unit in the builder.

### An enhancement is "an enhancement of the … detachment"

The detachment line didn't match or is missing. Check the detachment name in the review, then add the detachment and enhancement in the builder.

### The exchange code is "incomplete or damaged"

Part of the code was lost while copying. Copy the whole code again, or scan the QR code.

### The code "uses format …, which this version of Praetorium cannot read"

It was made by a newer version. Refresh the page or update the app.

### The code "uses format …, which Praetorium no longer reads"

The code is too old to open. Ask for a new code.

### The code uses "a rules version that is not available here"

Ask the sender to move the roster onto a current rules version, or to send **Export text** instead.

### The import says the exported codex version isn't available

The Praetorium text names a rules version that's no longer offered. Ask for an exchange code, or delete the `Ruleset:` line at the end to import onto the current rules.

## Limits

- A list can't have more than 100 entries.
- Text exports don't carry rule waivers, optional rules or allied detachments. Set those in the builder.
- Nothing is guessed. A unit or choice that doesn't match is reported, never swapped for a similar one.
- Your notes, preparation and reminders don't transfer in either direction. The one exception is unit notes in a 40k.app export, which become your private unit notes.
- When an import fails or needs review, its text is sent to Praetorium automatically (unless your browser blocks analytics) so the importer can be fixed.

Compare model counts and wargear against the original export before you rely on the list.
