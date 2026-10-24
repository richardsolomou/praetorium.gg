# Praetorium

Praetorium is an open source Warhammer 40,000 army builder, combat simulator and battle tracker. This plugin connects an assistant to Praetorium's MCP server at `https://praetorium.gg/mcp` and adds three skills:

- **build-a-roster** plans an army from the faction's current units and points, and saves it to your account when you confirm.
- **compare-units** runs Praetorium's combat simulator for two units and explains the expected casualties and odds.
- **track-a-battle** reads one of your battles and records actions in it after you confirm each one.

Reference lookups and the simulator work without an account. Roster and battle tools ask you to sign in to Praetorium, which shows a consent page listing the access requested; you can revoke it later under Connected apps on your profile.

## What it sends

The plugin runs no local code. Your assistant sends tool requests to `https://praetorium.gg/mcp`, and nowhere else. Praetorium returns names, numbers, points and calculated results with links to its pages, never rules text. See the [privacy policy](https://praetorium.gg/privacy) for what Praetorium stores.

Praetorium is unofficial and not affiliated with or endorsed by Games Workshop. [Setup and help](https://praetorium.gg/docs/connect-an-assistant).
