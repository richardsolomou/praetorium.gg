import { useQuery } from '@tanstack/react-query'
import type { RecentMatchup } from '../../../core/recentMatchups'
import { withoutRecentMatchup, withRecentMatchup } from '../../../contracts/recentMatchups'
import type { SimulatorState } from '../../../contracts/simulatorState'
import { forgetMatchup, rememberMatchup } from '../../functions'
import { useOptimisticList } from '../../optimisticList'
import { meQuery, recentMatchupsQuery } from '../../queries'
import { recentMatchupsKey } from '../../queries/queryKeys'
import type { CombatUnitIndex } from './benchmarks'

type Change = { remember: RecentMatchup } | { forget: string }

/** A signed-in player's recent standalone pairings; guests keep none. */
export function useMatchupHistory() {
  const me = useQuery(meQuery())
  const signedIn = Boolean(me.data)
  const { data: recent = [] } = useQuery({ ...recentMatchupsQuery(), enabled: signedIn })
  const { mutate } = useOptimisticList<RecentMatchup, Change>(
    recentMatchupsKey(),
    (change) => ('remember' in change ? rememberMatchup({ data: change.remember }) : forgetMatchup({ data: { shared: change.forget } })),
    (previous, change) =>
      'remember' in change ? withRecentMatchup(previous, change.remember) : withoutRecentMatchup(previous, change.forget),
  )
  return {
    recent: signedIn ? recent : [],
    remember: signedIn ? (entry: RecentMatchup) => mutate({ remember: entry }) : undefined,
    forget: (shared: string) => mutate({ forget: shared }),
  }
}

export function exampleMatchup(index: CombatUnitIndex): SimulatorState | null {
  const side = (faction: string, name: string) => {
    const book = index.find((candidate) => candidate.name === faction)
    const unit = book?.units.find((candidate) => candidate.name === name)
    return book && unit ? { catalogueId: book.catalogueId, pick: { entryId: unit.id, catalogueId: book.catalogueId }, rules: {} } : null
  }
  const sides: SimulatorState['sides'] = [side('Space Marines', 'Intercessor Squad'), side('Necrons', 'Necron Warriors')]
  return sides.every(Boolean) ? { v: 1, sides, swapped: false } : null
}
