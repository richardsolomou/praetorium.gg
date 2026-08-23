import { routeSlug } from '../core/slug'
import type { LoadedRules } from './rules'

function buildGameReferences(rules: LoadedRules) {
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
  const matchupsByMission = new Map<string, string[]>()
  for (const [pair, mission] of matchupEntries) {
    const missionKey = `${mission.packId ?? 'legacy'}:${mission.id}`
    matchupsByMission.set(missionKey, [...(matchupsByMission.get(missionKey) ?? []), pair])
  }
  const missionsByPack = new Map<string, typeof missions>()
  for (const mission of missions) {
    if (!mission.source) continue
    missionsByPack.set(mission.source, [...(missionsByPack.get(mission.source) ?? []), mission])
  }
  const packs = [...missionsByPack].map(([name, packMissions]) => ({
    id: routeSlug(name),
    name,
    // Only the pack itself prints these, so a pack that prints none offers none.
    twists: rules.missionTwists?.get(routeSlug(name)) ?? [],
    missions: packMissions.map((mission) => ({
      ...mission,
      card: primaryByKey.get(mission.id) ?? null,
      matchups: (matchupsByMission.get(`${mission.packId ?? 'legacy'}:${mission.id}`) ?? []).map((pair) =>
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
    attribution: rules.attribution,
  }
}

const cache = new WeakMap<LoadedRules, ReturnType<typeof buildGameReferences>>()

export function gameReferencesFor(rules: LoadedRules) {
  const cached = cache.get(rules)
  if (cached) return cached
  const references = buildGameReferences(rules)
  cache.set(rules, references)
  return references
}
