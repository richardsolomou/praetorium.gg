import { GAME_SIZES } from '../core/battle'
import { alliedLeagueRosterLimit, leagueTableShape } from '../core/league'
import { newBattleSeats, type NewBattlePlayers } from '../core/newBattle'
import type { TableShape } from '../core/tableShape'

export type LeagueMatchCandidate = {
  token: string
  name: string
  eventToken: string
  eventNumber: number
  format: TableShape | null
  rosterLimit: number | null
  entries: { userId: string; requiredLimit: number | null; sealedLimit: number | null; teamId: string | null }[]
}
export function matchingLeagueBattles(candidates: readonly LeagueMatchCandidate[], userId: string, input?: string | NewBattlePlayers) {
  const { allyIds, opponentIds, invited } = newBattleSeats(input)
  const participantIds = [userId, ...invited]
  if (!opponentIds.length || new Set(participantIds).size !== participantIds.length) return []
  const sideIds = [[userId, ...allyIds], opponentIds]
  return candidates
    .filter((candidate) => {
      const entries = new Map(candidate.entries.map((entry) => [entry.userId, entry]))
      if (participantIds.some((id) => !entries.has(id))) return false
      const format = leagueTableShape(candidate.format)
      if (format === '1v1') {
        if (participantIds.length !== 2 || allyIds.length !== 0) return false
        if (candidate.format !== null) return true
        const limit = entries.get(userId)?.sealedLimit
        return (
          limit !== null &&
          limit !== undefined &&
          GAME_SIZES.some((size) => size.limit === limit) &&
          participantIds.every((id) => entries.get(id)?.sealedLimit === limit)
        )
      }
      if (candidate.format === '2v1' && candidate.rosterLimit !== null && participantIds.length === 3) {
        const alliedLimit = alliedLeagueRosterLimit(candidate.rosterLimit)
        const roles = sideIds.map((side) =>
          side
            .map((id) => entries.get(id)?.requiredLimit)
            .every((limit) => limit === (side.length === 1 ? candidate.rosterLimit : alliedLimit)),
        )
        return sideIds.some((side) => side.length === 1) && sideIds.some((side) => side.length === 2) && roles.every(Boolean)
      }
      if (candidate.format === '2v2' && participantIds.length === 4 && sideIds.every((side) => side.length === 2)) {
        const ownTeam = entries.get(userId)?.teamId
        const opposingTeam = entries.get(opponentIds[0]!)?.teamId
        return Boolean(
          ownTeam &&
          opposingTeam &&
          ownTeam !== opposingTeam &&
          sideIds[0]!.every((id) => entries.get(id)?.teamId === ownTeam) &&
          sideIds[1]!.every((id) => entries.get(id)?.teamId === opposingTeam),
        )
      }
      return false
    })
    .map(({ token, name, eventToken, eventNumber, format }) => ({
      token,
      name,
      eventToken,
      eventNumber,
      format: leagueTableShape(format),
    }))
}
