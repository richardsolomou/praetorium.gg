type MatchupMission = { id: string; name: string; matchups: readonly (readonly { id: string; name: string }[])[] }
type MatchupPack = { id: string; name: string; missions: readonly MatchupMission[] }

export function missionMatchupsFor(packs: readonly MatchupPack[], disposition: string, dispositions: readonly { id: string }[]) {
  const known = new Set(dispositions.map((entry) => entry.id))
  if (!known.has(disposition)) return []
  return packs.flatMap((pack) => {
    const opponents = new Map(
      pack.missions.flatMap((mission) =>
        mission.matchups.flatMap((pair) => (pair[0]?.id === disposition && pair[1] ? [[pair[1].id, pair[1].name] as const] : [])),
      ),
    )
    const matchups = [...opponents].flatMap(([opponent, name]) => {
      if (!known.has(opponent)) return []
      const yours = pack.missions.find((mission) =>
        mission.matchups.some((pair) => pair[0]?.id === disposition && pair[1]?.id === opponent),
      )
      const theirs = pack.missions.find((mission) =>
        mission.matchups.some((pair) => pair[0]?.id === opponent && pair[1]?.id === disposition),
      )
      return yours && theirs ? [{ opponent, opponentName: name, mission: yours.name }] : []
    })
    return matchups.length ? [{ id: pack.id, name: pack.name, matchups }] : []
  })
}
