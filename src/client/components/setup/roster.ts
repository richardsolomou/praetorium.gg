import type { Roster } from '../../../core/battle'
import { rosterSnapshot } from '../../../core/rosterSnapshot'
import type { savedRosterPrice } from '../../../server/functions'
import type { savedRostersQuery } from '../../queries'

export type SavedRoster = Awaited<ReturnType<NonNullable<ReturnType<typeof savedRostersQuery>['queryFn']>>>[number]
type PricedRoster = NonNullable<Awaited<ReturnType<typeof savedRosterPrice>>>

/**
 * The list as the battle keeps it: the text an opponent reads on any device, and the
 * priced units behind it. Cards are settled by the battle rather than carried in
 * with the list, so nothing about prep comes across here.
 *
 * `wounds` names the datasheets whose models all take the same number of them. The
 * ones missing from it are the squads whose models disagree and the ones this
 * instance could not read, and the battle counts both in models.
 */
export function battleRoster(saved: SavedRoster, priced: PricedRoster, wounds: readonly { entryId: string; wounds: number }[]): Roster {
  return rosterSnapshot(saved, priced, wounds)
}
