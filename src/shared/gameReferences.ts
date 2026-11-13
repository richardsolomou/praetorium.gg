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
    secondaries: rules.secondaries.map((card) => ({ ...card, slug: secondarySlug(rules.secondaries, card) })),
    deployments: rules.deployments,
  }
}

/** A secondary's URL segment: its name slug, or its source key where another card's name shares that slug. */
function secondarySlug(secondaries: readonly { key: string; name: string }[], card: { key: string; name: string }) {
  const slug = routeSlug(card.name)
  return secondaries.some((other) => other !== card && routeSlug(other.name) === slug) ? card.key : slug
}

const cache = new WeakMap<BattleReadRules, ReturnType<typeof buildGameReferences>>()

export const gameReferencesFor = (rules: BattleReadRules) => remember(cache, rules, () => buildGameReferences(rules))

type MatchupPack<Mission> = { missions: readonly Mission[] }
type MatchupMission = { matchups: readonly (readonly ({ id: string } | undefined)[])[] }

/** The primary mission the `you` disposition plays against `opponent` in this pack. */
export const matchupMission = <Mission extends MatchupMission>(pack: MatchupPack<Mission>, you: string, opponent: string) =>
  pack.missions.find((mission) => mission.matchups.some((pair) => pair[0]?.id === you && pair[1]?.id === opponent))

/** Each pack's primary mission for this disposition against every opponent disposition. */
export function dispositionMatchups<Disposition extends { id: string }, Pack extends MatchupPack<MatchupMission>>(
  references: { dispositions: readonly Disposition[]; packs: readonly Pack[] },
  dispositionId: string,
) {
  return references.packs.flatMap((pack) => {
    const matchups = references.dispositions.flatMap((opponent) => {
      const mission = matchupMission<Pack['missions'][number]>(pack, dispositionId, opponent.id)
      return mission ? [{ opponent, mission }] : []
    })
    return matchups.length ? [{ pack, matchups }] : []
  })
}
