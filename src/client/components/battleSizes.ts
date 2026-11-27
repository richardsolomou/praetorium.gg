import { useQuery } from '@tanstack/react-query'
import type { BattleSize } from '../../core/battleFormat'
import { factionIndexQuery } from '../queries'

/**
 * The battle sizes a rules version records, so a restriction's description says the allowance a list is checked against:
 * the version of the faction `catalogueId` names, else that of edition `editionId`, else the default one.
 */
export function useBattleSizes(catalogueId?: string | null, editionId?: string | null): readonly BattleSize[] | undefined {
  const { data } = useQuery(factionIndexQuery())
  if (!data?.battleSizes) return undefined
  const factions = data.factions
  const faction = factions.find((candidate) => candidate.id === catalogueId)
  const edition = faction
    ? (faction.edition?.id ?? '')
    : (editionId ?? factions.find((candidate) => candidate.isDefault)?.edition?.id ?? '')
  return data.battleSizes[edition]
}
