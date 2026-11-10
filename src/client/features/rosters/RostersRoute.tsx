import { useQuery } from '@tanstack/react-query'
import { meQuery } from '../../queries'
import { BuilderFrame, ClaimGuestRoster, useGuestDraft } from './GuestRoster'
import { RosterDiscoveryPage } from './RosterDiscoveryPage'
import { RosterLibraryPage } from './RosterLibraryPage'
import type { RostersSearch } from './rosterSearch'
import type { RosterGrouping } from '../../../core/rosterGrouping'
import type { keptRosterSort } from './rosterSort'

/**
 * A player's library, or a visitor's one list on this device on the same page; either may instead ask for friends' or
 * public rosters. Signing up comes back here, and a player arriving with a visitor's list still on the device has it
 * saved first. `new` opens the setup for another roster, as `/rosters/new` asks.
 */
export function RostersRoute({
  search: { view, new: starting, reference, sort: listSort, ...search },
  guestDraft: hinted,
  sort,
  grouping,
  notices,
  rows,
}: {
  search: RostersSearch
  /** Whether the request said this browser holds a visitor's list, so the first frame holds its row or the claim it becomes. */
  guestDraft: boolean
  sort: ReturnType<typeof keptRosterSort>
  grouping: RosterGrouping
  /** Whether the library last had a data update notice, so the first frame keeps its line. */
  notices: boolean
  /** How many rows the unfiltered library last showed, so the first frame reserves them. */
  rows: number
}) {
  const { data: me } = useQuery(meQuery())
  const [{ ready, guest }, setGuest] = useGuestDraft(hinted)
  if (view) return <RosterDiscoveryPage view={view} search={{ ...search, sort: listSort }} />
  if (me && !ready && hinted) return <BuilderFrame />
  if (me && guest) return <ClaimGuestRoster key={guest.id} guest={guest} onDiscard={() => setGuest(null)} />
  return (
    <RosterLibraryPage
      search={search}
      sort={sort}
      grouping={grouping}
      notices={notices}
      rows={rows}
      starting={starting && ready}
      reference={reference}
      device={{ guest, pending: !ready && hinted, onChange: setGuest }}
    />
  )
}
