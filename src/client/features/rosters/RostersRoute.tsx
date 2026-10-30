import { useQuery } from '@tanstack/react-query'
import { meQuery } from '../../queries'
import { BuilderFrame, ClaimGuestRoster, useGuestDraft } from './GuestRoster'
import { RosterDiscoveryPage, type RosterDiscoverySearch } from './RosterDiscoveryPage'
import { RosterLibraryPage, type RosterLibrarySearch } from './RosterLibraryPage'
import type { MissionReference } from './rosterStart'
import type { keptRosterSort } from './rosterSort'

export const ROSTER_VIEWS = ['friends', 'public', 'played'] as const
type RosterView = (typeof ROSTER_VIEWS)[number]

export type RostersSearch = RosterLibrarySearch & RosterDiscoverySearch & { view?: RosterView; new?: true; reference?: MissionReference }

/**
 * A player's library, or a visitor's one list on this device on the same page; either may instead ask for friends' or
 * public rosters. Signing up comes back here, and a player arriving with a visitor's list still on the device has it
 * saved first. `new` opens the setup for another roster, as `/rosters/new` asks.
 */
export function RostersRoute({
  search: { view, detachment, rules, sort: listSort, new: starting, reference, ...search },
  guestDraft: hinted,
  sort,
}: {
  search: RostersSearch
  /** Whether the request said this browser holds a visitor's list, so the first frame holds its row or the claim it becomes. */
  guestDraft: boolean
  sort: ReturnType<typeof keptRosterSort>
}) {
  const { data: me } = useQuery(meQuery())
  const [{ ready, guest }, setGuest] = useGuestDraft(hinted)
  if (view) return <RosterDiscoveryPage view={view} search={{ faction: search.faction, detachment, rules, sort: listSort }} />
  if (me && !ready && hinted) return <BuilderFrame />
  if (me && guest) return <ClaimGuestRoster key={guest.id} guest={guest} onDiscard={() => setGuest(null)} />
  return (
    <RosterLibraryPage
      search={search}
      sort={sort}
      starting={starting && ready}
      reference={reference}
      device={{ guest, pending: !ready && hinted, onChange: setGuest }}
    />
  )
}
