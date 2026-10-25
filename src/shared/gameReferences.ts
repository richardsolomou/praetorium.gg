import { groupBy, remember } from '../core/collections'
import { routeSlug } from '../core/slug'
import type { BattleReadRules } from './rules'

function buildGameReferences(rules: BattleReadRules) {
  const missions = [
    ...new Map([...rules.missions.values()].map((mission) => [`${mission.packId ?? 'legacy'}:${mission.id}`, mission])).values(),
  ]
  const matchupEntries = [
    ...new Map(
      [...rules.missions.entries()].map(([key, mission]) => {
        const parts = key.split('|')
        const pair = parts.slice(-2).join('|')
        return [`${mission.packId ?? 'legacy'}:${pair}`, [pair, mission] as const]
      }),
    ).values(),
  ]
  const primaryByKey = new Map(rules.primaries.map((card) => [card.key, card]))
  const matchupsByMission = groupBy(matchupEntries, ([, mission]) => `${mission.packId ?? 'legacy'}:${mission.id}`)
  const missionsByPack = groupBy(
    missions.filter((mission) => mission.source),
    (mission) => mission.source!,
  )
  const packs = [...missionsByPack].map(([name, packMissions]) => ({
    id: routeSlug(name),
    name,
    // Only the pack itself prints these, so a pack that prints none offers none.
    twists: rules.missionTwists?.get(routeSlug(name)) ?? [],
    fixedSecondaryCap: rules.fixedSecondaryCaps?.get(routeSlug(name)) ?? null,
    missions: packMissions.map((mission) => ({
      ...mission,
      card: primaryByKey.get(mission.id) ?? null,
      matchups: (matchupsByMission.get(`${mission.packId ?? 'legacy'}:${mission.id}`) ?? []).map(([pair]) =>
        pair.split('|').map((id) => ({ id, name: rules.dispositions?.get(id) ?? id })),
      ),
    })),
  }))
  const dispositionDetails = rules.dispositionDetails ?? [...(rules.dispositions ?? [])].map(([id, name]) => ({ id, name, text: null }))
  return {
    dispositions: dispositionDetails.map((disposition) => ({ ...disposition })),
    packs,
    secondaries: rules.secondaries,
    deployments: rules.deployments,
  }
}

const cache = new WeakMap<BattleReadRules, ReturnType<typeof buildGameReferences>>()

export const gameReferencesFor = (rules: BattleReadRules) => remember(cache, rules, () => buildGameReferences(rules))
