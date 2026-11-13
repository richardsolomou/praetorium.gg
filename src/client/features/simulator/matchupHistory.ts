import { useQuery } from '@tanstack/react-query'
import type { RecentMatchup } from '../../../core/recentMatchups'
import { withoutRecentMatchup, withRecentMatchup } from '../../../contracts/recentMatchups'
import type { SimulatorState } from '../../../contracts/simulatorState'
import { forgetMatchup, rememberMatchup } from '../../functions'
import { useOptimisticList } from '../../optimisticList'
import { meQuery, recentMatchupsQuery } from '../../queries'
import { recentMatchupsKey } from '../../queries/queryKeys'
import type { CombatUnitIndex } from './benchmarks'
import { noExclusions } from '../../../core/combatMatchup'

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

// Detachments, the enhancement and rule switches are catalogue ids, which outlast a points update; one that goes stale only drops its part.
const GLADIUS_TASK_FORCE = 'd2dc-693e-b491-b16d'
const AWAKENED_DYNASTY = '9ebf-2bbd-6059-1d40'
const OVERLORD_ENHANCEMENT = { '57d3-bc99-c36e-a78b': '3cc5-4b3-9380-981a' } // Enaegic Dermal Bond
const STORM_OF_DEVASTATION = 'stratagem:23d16a9e-8818-54c8-bf9c-35255cb6ad32'

/** A led and supported squad against a led bodyguard, with a stratagem, an enhancement and half range in play. */
export function exampleMatchup(index: CombatUnitIndex): SimulatorState | null {
  const unit = (faction: string, name: string) => {
    const book = index.find((candidate) => candidate.name === faction)
    const found = book?.units.find((candidate) => candidate.name === name)
    return book && found ? { entryId: found.id, catalogueId: book.catalogueId } : null
  }
  const [intercessors, captain, lieutenant] = ['Intercessor Squad', 'Captain', 'Lieutenant'].map((name) => unit('Space Marines', name))
  const [lychguard, overlord] = ['Lychguard', 'Overlord'].map((name) => unit('Necrons', name))
  if (!intercessors || !captain || !lieutenant || !lychguard || !overlord) return null
  return {
    v: 1,
    sides: [
      {
        catalogueId: intercessors.catalogueId,
        pick: { ...intercessors, models: 10 },
        rules: { [STORM_OF_DEVASTATION]: 1 },
        detachmentIds: [GLADIUS_TASK_FORCE],
        attached: [captain, lieutenant],
      },
      {
        catalogueId: lychguard.catalogueId,
        pick: lychguard,
        rules: {},
        detachmentIds: [AWAKENED_DYNASTY],
        attached: [{ ...overlord, choices: OVERLORD_ENHANCEMENT }],
      },
    ],
    swapped: false,
    matchup: { adjustments: { ranged: { halfRange: true } }, preferences: {}, excluded: noExclusions(), allocation: [] },
  }
}
