## Common problems

### "Could not match … no faction is called that"

The faction line is missing or isn't a faction name. Copy the export again from the very top, and check the closest name the message suggests.

### "That looks like a … roster file, which Praetorium cannot read yet"

You pasted or dropped a `.ros`, `.rosz` or `.regiztry` file. Open the list in the app that made it, use its text export, and paste that instead. Praetorium counts these attempts, never their contents, to decide whether to support the files.

### "it is not a supported army-text export"

The paste isn't one of the formats above, or it's a fragment. Paste the full text export, not a screenshot transcription.

### A unit is "a … datasheet, not …"

The list's faction line names a different army from the one that unit belongs to, often because the export names a subfaction or the unit came from another book. Check the faction line, or add the unit in the builder.

### An enhancement is "an enhancement of the … detachment"

The detachment line didn't match or is missing. Check the detachment name in the review, then add the detachment and enhancement in the builder.

### The exchange code is "incomplete or damaged"

Part of the code was lost while copying. Copy the whole code again, or scan the QR code.

### The code "uses format …, which this version of Praetorium cannot read"

It was made by a newer version. Refresh the page or update the app.

### The code uses "a rules version that is not available here"

Ask the sender to move the roster onto a current rules version, or to send **Export text** instead.

### The import says the exported codex version isn't available

The Praetorium text names a rules version that's no longer offered. Ask for an exchange code, or delete the `Ruleset:` line at the end to import onto the current rules.

When an import fails or needs review, its text is sent to Praetorium automatically (unless your browser blocks analytics) so the importer can be fixed.

## Limits

- `.ros`, `.rosz` and `.regiztry` files aren't read, and a list can't have more than 100 entries.
- Text exports don't carry rule waivers, optional rules or allied detachments; set those in the builder.
- Nothing is guessed: a unit or choice that doesn't match is reported, never swapped for a similar one.
- Your notes, preparation and reminders never transfer in either direction.

Compare model counts and wargear against the original export before you rely on the list. See [Start a list](/docs/start-a-list) for what the builder checks, and [Start a battle](/docs/start-a-battle) to take it to the table.
