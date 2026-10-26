import type { gameReferences } from '../../../functions'

type GameReferences = NonNullable<Awaited<ReturnType<typeof gameReferences>>>

/** The primary mission the `you` disposition plays against `opponent` in this pack. */
export const matchupMission = (pack: GameReferences['packs'][number], you: string, opponent: string) =>
  pack.missions.find((mission) => mission.matchups.some((pair) => pair[0]?.id === you && pair[1]?.id === opponent))

/** Each pack's primary mission for this disposition against every opponent disposition. */
export function dispositionMatchups(references: GameReferences, dispositionId: string) {
  return references.packs.flatMap((pack) => {
    const matchups = references.dispositions.flatMap((opponent) => {
      const mission = matchupMission(pack, dispositionId, opponent.id)
      return mission ? [{ opponent, mission }] : []
    })
    return matchups.length ? [{ pack, matchups }] : []
  })
}
