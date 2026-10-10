import { parseRosterSnapshot } from '../core/commands'
import { type Command, GAME_SIZES } from '../core/battle'
import { alliedLeagueRosterLimit, LEAGUE_TEAM_ROSTER_LIMITS } from '../core/league'
import type { TableShape } from '../core/tableShape'

export type LeagueBattleSetup = {
  eventToken: string
  format: TableShape | null
  rosterLimit: number | null
  revealedAt: number | null
  entries: { userId: string; requiredLimit: number | null; snapshot: string | null; teamId: string | null }[]
}
export class LeagueBattleSetupError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}
export function buildLeagueBattle(
  league: LeagueBattleSetup,
  userId: string,
  leagueToken: string,
  opponentId: string,
  missionPackId: string | null,
  battleToken: string,
  allyId?: string,
  secondOpponentId?: string,
) {
  const invited = [opponentId, allyId, secondOpponentId].filter((id): id is string => Boolean(id))

  if (league.revealedAt === null) throw new LeagueBattleSetupError('reveal the league rosters before starting a battle', 409)
  const expectedPlayers = league.format === '2v2' ? 4 : league.format === '2v1' ? 3 : 2
  if (league.format === '2v2' && !LEAGUE_TEAM_ROSTER_LIMITS.some((candidate) => candidate === league.rosterLimit)) {
    throw new LeagueBattleSetupError('sealed rosters use an unsupported doubles force size', 409)
  }
  if (league.format !== '2v2' && (league.entries.length !== expectedPlayers || invited.length !== expectedPlayers - 1)) {
    throw new LeagueBattleSetupError('choose accepted entrants with sealed rosters', 403)
  }
  const rosters = new Map(
    league.entries.map((entry) => {
      if (!entry.snapshot) throw new Error('accepted league entrant has no roster snapshot')
      return [entry.userId, parseRosterSnapshot(entry.snapshot)] as const
    }),
  )
  let participantIds = [userId, ...invited]
  let allyIds: string[] = []
  let opponentIds = [opponentId]
  if (league.format === '2v2') {
    if (invited.length !== 1 || allyId || secondOpponentId) throw new LeagueBattleSetupError('choose one opposing doubles team', 400)
    const ownTeamId = league.entries.find((entry) => entry.userId === userId)?.teamId
    const opposingTeamId = league.entries.find((entry) => entry.userId === opponentId)?.teamId
    if (!ownTeamId || !opposingTeamId || ownTeamId === opposingTeamId)
      throw new LeagueBattleSetupError('choose an opposing doubles team', 409)
    const ownTeam = league.entries.filter((entry) => entry.teamId === ownTeamId)
    const opposingTeam = league.entries.filter((entry) => entry.teamId === opposingTeamId)
    if (ownTeam.length !== 2 || opposingTeam.length !== 2)
      throw new LeagueBattleSetupError('doubles teams must contain exactly two entrants', 409)
    allyIds = ownTeam.filter((entry) => entry.userId !== userId).map((entry) => entry.userId)
    opponentIds = [opponentId, ...opposingTeam.filter((entry) => entry.userId !== opponentId).map((entry) => entry.userId)]
    participantIds = [userId, ...allyIds, ...opponentIds]
  }
  const ownRoster = rosters.get(userId)
  const opponentRoster = rosters.get(opponentIds[0]!)
  const limit = league.format === null ? ownRoster?.built?.limit : league.rosterLimit
  if (!ownRoster || !opponentRoster || limit === null || limit === undefined)
    throw new LeagueBattleSetupError('sealed rosters use an invalid battle size', 409)
  if (league.format !== '2v1' && league.format !== '2v2' && (ownRoster.built?.limit !== limit || opponentRoster.built?.limit !== limit)) {
    throw new LeagueBattleSetupError('sealed rosters must use the same battle size', 409)
  }
  if (!GAME_SIZES.some((size) => size.limit === limit))
    throw new LeagueBattleSetupError('sealed rosters use an unsupported battle size', 409)

  if (league.format === '2v1') {
    const requirements = new Map(league.entries.map((entry) => [entry.userId, entry.requiredLimit]))
    const alliedLimit = alliedLeagueRosterLimit(limit)
    const creatorLimit = requirements.get(userId)
    if (creatorLimit === limit) {
      if (
        allyId ||
        !secondOpponentId ||
        requirements.get(opponentId) !== alliedLimit ||
        requirements.get(secondOpponentId) !== alliedLimit
      ) {
        throw new LeagueBattleSetupError('a solo entrant must face two allied entrants', 409)
      }
      opponentIds = [opponentId, secondOpponentId]
    } else {
      if (
        creatorLimit !== alliedLimit ||
        !allyId ||
        secondOpponentId ||
        requirements.get(allyId) !== alliedLimit ||
        requirements.get(opponentId) !== limit
      ) {
        throw new LeagueBattleSetupError('an allied entrant must choose one allied teammate and one solo opponent', 409)
      }
      allyIds = [allyId]
    }
    for (const entry of league.entries) {
      const rosterLimit = rosters.get(entry.userId)?.built?.limit
      if (rosterLimit !== entry.requiredLimit) throw new LeagueBattleSetupError('a sealed roster does not match its assigned size', 409)
    }
  }
  if (league.format === '2v2') {
    const requiredLimit = alliedLeagueRosterLimit(limit)
    if (participantIds.some((playerId) => rosters.get(playerId)?.built?.limit !== requiredLimit))
      throw new LeagueBattleSetupError('every doubles roster must use half the force size', 409)
  }

  const initialCommands: Command[] = [
    {
      kind: 'configure-battle',
      limit,
      missionPackId,
      terrainLayoutId: null,
      twistId: null,
      teamBattle: league.format === '2v1' || league.format === '2v2',
      playerCount: expectedPlayers,
      clockLimitMinutes: null,
    },
    { kind: 'attach-roster', playerId: userId, roster: ownRoster, prep: null, painted: true },
    { kind: 'attach-roster', playerId: opponentIds[0]!, roster: opponentRoster, prep: null, painted: true },
    ...participantIds
      .filter((playerId) => playerId !== userId && playerId !== opponentIds[0])
      .map((playerId) => ({ kind: 'attach-roster' as const, playerId, roster: rosters.get(playerId)!, prep: null, painted: true })),
    { kind: 'lock-league-rosters', leagueToken, eventToken: league.eventToken },
  ]
  return {
    allyIds,
    opponentIds,
    initialCommands,
    result: {
      token: battleToken,
      format: league.format,
      requiredLimit:
        league.format === '2v2'
          ? alliedLeagueRosterLimit(limit)
          : (league.entries.find((entry) => entry.userId === userId)?.requiredLimit ?? limit),
      participantIds,
    },
  }
}
