import { terrainMatchupIds } from '../contracts/terrainReference'
import { isKotcLimit } from '../core/battle'
import { missionFor, type LoadedRules } from './rules'

/**
 * The battlefields a table can play on, which its two Force Dispositions decide. Empty where the armies don't name exactly
 * two, or where King of the Colosseum fixes the battlefield already.
 */
export function tableBattlefields(
  rules: LoadedRules,
  dispositions: readonly (string | null)[],
  limit: number | null,
  missionPackId: string | null,
) {
  const [one, two] = dispositions
  if (limit === null || isKotcLimit(limit) || dispositions.length !== 2 || !one || !two) return { matchupIds: [], options: [] }
  const matchupIds = terrainMatchupIds([one, two])
  const allowed = missionFor(rules, one, two, missionPackId)?.deploymentIds ?? []
  const options = rules.terrainLayouts.flatMap((layout) =>
    matchupIds.includes(layout.matchupId) &&
    layout.geometry &&
    layout.deploymentId &&
    (!allowed.length || allowed.includes(layout.deploymentId))
      ? [{ patternId: layout.deploymentId, terrainLayoutId: layout.id }]
      : [],
  )
  return { matchupIds, options }
}
