import { KOTC_BATTLEFIELD_MATCHUP_IDS } from '../contracts/terrain'
import { terrainMatchupIds } from '../contracts/terrainReference'
import { isKotcLimit } from '../core/battle'
import { missionFor, type LoadedRules } from './rules'

/**
 * The battlefields a table can play on: King of the Colosseum's own, or else the ones its two Force Dispositions decide.
 * Empty where the armies don't name exactly two.
 */
export function tableBattlefields(
  rules: LoadedRules,
  dispositions: readonly (string | null)[],
  limit: number | null,
  missionPackId: string | null,
) {
  if (limit === null) return { matchupIds: [], options: [] }
  if (isKotcLimit(limit)) return { matchupIds: KOTC_BATTLEFIELD_MATCHUP_IDS, options: layoutsFor(rules, KOTC_BATTLEFIELD_MATCHUP_IDS, []) }
  const [one, two] = dispositions
  if (dispositions.length !== 2 || !one || !two) return { matchupIds: [], options: [] }
  const matchupIds = terrainMatchupIds([one, two])
  // Each side has its own mission, and starting the battle checks the deployment against both.
  const allowed = [missionFor(rules, one, two, missionPackId), missionFor(rules, two, one, missionPackId)].map(
    (mission) => mission?.deploymentIds ?? [],
  )
  return { matchupIds, options: layoutsFor(rules, matchupIds, allowed) }
}

function layoutsFor(rules: LoadedRules, matchupIds: readonly string[], allowed: string[][]) {
  return rules.terrainLayouts.flatMap(({ id, matchupId, geometry, deploymentId }) =>
    matchupIds.includes(matchupId) && geometry && deploymentId && allowed.every((ids) => !ids.length || ids.includes(deploymentId))
      ? [{ patternId: deploymentId, terrainLayoutId: id }]
      : [],
  )
}
