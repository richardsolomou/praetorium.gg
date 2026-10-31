# Product design

## Privacy contract

Publication is named sharing; there is no anonymous archive of private game statistics. The [privacy policy](../src/client/features/legal/PrivacyPolicy.tsx) and the publish and delete controls state these boundaries before acting.

- Battles (screen, replay, feed, metadata) and profiles are public. Spectators never see a face-down Secret Mission or a control.
- Rosters start public. Sharing a private roster makes it unlisted; private revokes every shared read.
- Discovery shows only public rosters and drops them on the next read after a privacy change or deletion. The Played tab shows frozen armies from finished non-practice battles.
- Lent rosters go to chosen friends, read-only, without notes or preparation; revoking, unfriending, or deletion ends the loan.
- Seated players read each other's battle rosters without personal reminders.
- Saved loadouts, ability alerts, and unit notes are owner-only: never in exports, exchange codes, discovery, or copies.
- Frozen battle armies and sealed tournament and group rosters are never rewritten by saved edits, privacy changes, or deletion. Sealed rosters are visible to assigned allies before reveal and event readers after.
- A reveal never publishes; an entrant may publish the original roster, never a copy.
- An imported battle seats a player as their account only once they proved the source account is theirs; until then they are a guest.
- A guest seat belongs to one device by HTTP-only cookie, stored as a hash, and ends after 30 days, on reclaim, claim, or battle deletion.
- A reported collection photo is visible only to its owner and administrators until reviewed.
- Account deletion removes rosters, loadouts, ability alerts, friendships, linked accounts on other trackers, entries, group memberships, owned tournaments and owned groups with their games, and every battle played. Tournament, hidden-list game and group deletion keep battles.
- Revocable player-content images are `no-store`. Screenshots with roster or battle data stay out of Git.

Authorities: [`rosterAccess`](../src/server/services/rosterService.ts), [`rosterDiscovery.ts`](../src/core/rosterDiscovery.ts), [`PraetoriumService`](../src/server/service.ts), [`sealedEvent.ts`](../src/core/sealedEvent.ts), and deletion in [`spacetimedb/src/index.ts`](../spacetimedb/src/index.ts).
