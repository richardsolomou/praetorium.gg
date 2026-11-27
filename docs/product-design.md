# Product design

## Privacy contract

Publication is named sharing; there is no anonymous archive of private game statistics. The [privacy policy](../src/client/features/legal/PrivacyPolicy.tsx) and the publish and delete controls state these boundaries before acting.

- Battles (screen, replay, feed, metadata) and profiles are public. Spectators read a battle but get no controls to change it.
- Rosters start public. Sharing a private roster makes it unlisted; private revokes every shared read.
- Discovery shows only public rosters and drops them on the next read after a privacy change or deletion. The Played tab shows frozen armies from finished non-practice battles.
- Lent rosters go to chosen friends, read-only, without notes or preparation; revoking, unfriending, or deletion ends the loan.
- Seated players read each other's battle rosters without personal reminders.
- Saved loadouts, ability alerts, and unit notes are owner-only: never in exports, exchange codes, discovery, or copies.
- Frozen battle armies and sealed tournament and group rosters are never rewritten by saved edits, privacy changes, or deletion. Sealed rosters are visible to assigned allies before reveal and event readers after.
- A reveal never publishes; an entrant may publish the original roster, never a copy.
- An imported battle seats a player as their account only once they proved the source account is theirs; until then they are a guest.
- Every seat a player creates belongs to an account. Guest seats exist only on imported battles and on battles created before that, and no device signs in to one.
- A reported collection photo is visible only to its owner and administrators until reviewed.
- Account deletion removes rosters, loadouts, ability alerts, notifications, the calendar link, friendships, linked accounts on other trackers, entries, group memberships, owned tournaments and owned groups with their games, and every battle played, but not the saved-pick translations below, which hold no personal data. Tournament, hidden-list game and group deletion keep battles.
- Frozen saved-pick translations (`src/server/savedPicks.ts`) are a server-only cache of how a stored pick reads by VS Data IDs, keyed by the pick's content. They hold no personal data (no owner, list, battle or event, no counts): a deduplicated mapping from pick content to VS Data IDs, not an archive of private game statistics. They are read only to attach to a pick the reader is already served, never for a key a request names, and outlive deletion. They attach only to roster, loadout and sealed-entry records saved before the backup they were made from was taken (the pin's `copiedAt`) and unchanged since, never to battle reads, and a sealed entry is checked for reveal on every read.
- Revocable player-content images are `no-store`. Screenshots with roster or battle data stay out of Git.

Authorities: [`rosterAccess`](../src/server/services/rosterService.ts), [`rosterDiscovery.ts`](../src/core/rosterDiscovery.ts), [`PraetoriumService`](../src/server/service.ts) with its watch rule [`mayWatch`](../src/server/services/battleHistory.ts), [`sealedEvent.ts`](../src/core/sealedEvent.ts), and deletion in [`spacetimedb/src/index.ts`](../spacetimedb/src/index.ts).

## Compatibility contract

[What stays the same when things change](../src/client/features/docs/content/when-things-change.md) is the player-facing promise. A change that would break one of these needs its migration in the same release:

- Saved rosters: selections move only through `catalogue/roster-migrations.json` or `catalogue/retired-ids.json`, each with a reason, checked by the [roster audit](development/catalogue-data.md#roster-migration); one with no replacement stays and turns illegal. Publishing and the live refresh refuse a catalogue that drops a saved ID no map or acceptance covers.
- Public paths: a moved or removed route keeps its old path as a redirect route, like `src/routes/clubs.$.tsx`, to the closest page that exists; a docs slug leaving `PRODUCT_DOCS` goes in `MOVED` in `src/routes/docs.$docId.tsx`.
- Exchange codes: a new format raises `ROSTER_EXCHANGE_VERSION` in `src/core/rosterExchange.ts` and keeps reading every older one.
- MCP tools and arguments change additively; `src/server/mcpSurface.json` lists the published ones (refresh it with `WRITE_MCP_SURFACE=1` on the `referenceMcp` test after adding one), and removing one needs a changeset announcing it a month ahead.

Free to change without a migration: which upstream sources feed the catalogue and their IDs, catalogue and snapshot formats, text export layout, and anything not listed above.

### Replacing a source

When a source disappears or must stop, as BSData did in November 2026:

1. Pin a fork we control, like the `richardsolomou/*` forks in `catalogue/sources.json`, so pinned revisions stay fetchable.
2. If its data must stop being served, list it in `catalogue/revocations.json`; publishing and loading refuse any snapshot built from it, so publish the replacement snapshot first.
3. Map the old IDs onto the new source's in `catalogue/retired-ids.json` and `catalogue/roster-migrations.json`, and run the roster audit against a production baseline; the publish lists every dropped ID still unmapped, and those no saved roster holds go in `catalogue/accepted-id-drops.json`. Retired IDs stay resolvable, so old exchange codes, frozen battles and sealed rosters still verify.
4. Report what the new source lacks as unsupported; never fill it from the old source or from memory.
