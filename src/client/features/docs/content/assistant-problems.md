## Common problems

### The assistant doesn't list any Praetorium tools

Check the address is exactly `https://praetorium.gg/mcp` and that it's added as a remote HTTP server, not a local command or SSE. Make sure the connector is switched on for the current chat. Some need a new conversation before new tools appear.

### The assistant answers from memory instead

Start your prompt with "Using Praetorium" or ask it to cite the Praetorium page. An answer with no link didn't come from Praetorium.

### "This connection request has expired"

Connection requests time out. Go back to your assistant and start the connection again. The same applies to **Could not finish connecting. Start the connection again from your app.**

### Signing in keeps sending me back

Finish signing in on the same browser the request opened in, then let it return you to the **Connect to Praetorium** page. If it loops, start the connection again from the assistant rather than reloading the old page.

### It says authorisation is no longer active

You, or something else, revoked the app under **Connected apps**. Disconnect and reconnect Praetorium in your assistant to sign in again.

### It can see my rosters but can't change them

The connection only has read access. Revoke it, then reconnect and allow the change access when the assistant asks for it.

### The simulator refuses a matchup or lists rules as not calculated

The tool won't approximate what it can't model. It refuses unsupported mechanics, illegal unit sizes or attachments, and matchups too large to calculate quickly on the server, and lists rules it couldn't apply as not calculated. Open the returned simulator link, or the [simulator](/simulator) directly, where larger matchups run on your own device.

### It can't find a unit or faction

Ask with the faction named, or ask it to list Praetorium's factions first; names that appear in several factions need narrowing. Units outside the current data won't be found at all.

### Requests start failing after heavy use

The public server allows about 120 requests a minute from one address. Wait a minute and try again.

## Limits

- Praetorium doesn't check the assistant's reasoning. It supplies data and calculated results; anything the assistant concludes from them is the assistant's.
- No rules wording. You'll need the linked source for exact text.
- The simulator tool covers one unit, with up to two attached units, against one unit at full strength, with default loadouts and no detachment.
- The assistant can't edit an unsaved roster in your browser, delete rosters, or change league entries. It only sees your own rosters and battles you're seated in.
- An assistant's own provider sees what Praetorium returns to it, including your roster and battle details when you've connected your account.
