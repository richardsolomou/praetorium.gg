import type { gameReferences } from '../../../functions'

type GameReferences = NonNullable<Awaited<ReturnType<typeof gameReferences>>>

/** Each pack's primary mission for this disposition against every opponent disposition. */
export function dispositionMatchups(references: GameReferences, dispositionId: string) {
  return references.packs.flatMap((pack) => {
    const matchups = references.dispositions.flatMap((opponent) => {
      const mission = pack.missions.find((candidate) =>
        candidate.matchups.some((pair) => pair[0]?.id === dispositionId && pair[1]?.id === opponent.id),
      )
      return mission ? [{ opponent, mission }] : []
    })
    return matchups.length ? [{ pack, matchups }] : []
  })
}
