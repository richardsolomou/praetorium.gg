import type { QueryClient } from '@tanstack/react-query'
import type { BattleView, RosterView } from '../../../core/battleView'
import { builtDetachments } from '../../../core/battle'
import { detachmentRulesQuery, factionQuery } from '../../queries'

/**
 * What an army's rules are looked up by: the catalogue it was built from, and every
 * detachment it fields.
 *
 * Derived here and nowhere else. A caller that names the detachments differently is
 * a second cache key for the same six stratagems, and in a 2v1 it is worse than
 * wasteful: the side's pool would depend on which screen assembled it.
 */
export function armyRulesRequest(roster: RosterView | null | undefined): { catalogueId: string; detachmentNames: string[] } {
  const built = roster?.built
  return {
    catalogueId: built?.catalogueId ?? '',
    detachmentNames: builtDetachments(built).map((detachment) => detachment.name),
  }
}

/** Each army's rules and its own faction, rather than every faction the instance knows, for a loader to start with the battle. */
export function armyReads(queryClient: QueryClient, view: Pick<BattleView, 'players'>) {
  return [
    ...view.players.flatMap((player) => {
      const { catalogueId, detachmentNames } = armyRulesRequest(player.roster)
      return catalogueId && detachmentNames.length
        ? [queryClient.query({ ...detachmentRulesQuery(catalogueId, detachmentNames), staleTime: 'static' })]
        : []
    }),
    ...[...new Set(view.players.flatMap((player) => (player.roster?.built ? [player.roster.built.catalogueId] : [])))].map((catalogueId) =>
      queryClient.query({ ...factionQuery(catalogueId), staleTime: 'static' }),
    ),
  ]
}

/** A stratagem's written card, read from whichever of the side's rule sets prints it. */
export function writtenStratagem<Written extends { key: string }, Keyword>(
  rules: readonly { written: readonly Written[]; keywordRules?: readonly Keyword[] }[],
  key: string,
) {
  for (const { written, keywordRules = [] } of rules) {
    const entry = written.find((candidate) => candidate.key === key)
    if (entry) return { ...entry, keywordRules: [...keywordRules] }
  }
  return undefined
}
