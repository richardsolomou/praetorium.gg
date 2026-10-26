import { parseRosterSnapshot } from '../core/commands'
import { type Command, isGameSize } from '../core/battle'
import {
  isTeamFormat,
  alliedLeagueRosterLimit,
  LEAGUE_TEAM_ROSTER_LIMITS,
  leagueSeatPoints,
  leagueSeatRefusal,
  type LeagueArmyPoints,
} from '../core/league'
import type { TableShape } from '../core/tableShape'

/** The two players' unplayed table in the latest Swiss round, if they have one. */
export function openPairing<T extends { round: number; aId: string; bId: string | null; battleToken: string | null }>(
  pairings: readonly T[],
  userId: string,
  opponentId: string | undefined,
) {
  const round = Math.max(0, ...pairings.map((pairing) => pairing.round))
  const seated = (pairing: T, id: string | undefined) => pairing.aId === id || pairing.bId === id
  return pairings.find(
    (pairing) => pairing.round === round && pairing.battleToken === null && seated(pairing, userId) && seated(pairing, opponentId),
  )
}

export type LeagueBattleSetup = {
  /** The event's host address, which its battles' logs name it by beside the event's own token. */
  token: string
  eventToken: string
  format: TableShape | null
  rosterLimit: number | null
  revealedAt: number | null
  /** Swiss rounds, or null in open play; a Swiss battle needs the players' unplayed table in the current round. */
  rounds: number | null
  paired: boolean
  /**
   * `teamDisposition` is the card the entrant's fixed pair sealed and `teamWarlord` the entrant whose Warlord leads it,
   * each absent from events revealed before pairs sealed one.
   */
  entries: {
    userId: string
    requiredLimit: number | null
    snapshot: string | null
    teamId: string | null
    teamDisposition: string | null
    teamWarlord: string | null
  }[]
} & LeagueArmyPoints
export class LeagueBattleSetupError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}
/** The card each allied side sealed before reveal; an event whose pairs never sealed one leaves every side's to setup. */
function sealedDispositions(league: LeagueBattleSetup, ...sides: string[][]) {
  const dispositions = sides.flatMap((playerIds, side) => {
    const disposition = league.entries.find((entry) => entry.userId === playerIds[0])?.teamDisposition
    return playerIds.length > 1 ? [{ side, disposition }] : []
  })
  if (!dispositions.length || dispositions.some((entry) => !entry.disposition)) return {}
  return { dispositions: dispositions.map(({ side, disposition }) => ({ side, disposition: disposition! })) }
}

/**
 * Whose Warlord leads each allied side, as its pair sealed it. Sealing locks every side's choice, so unless every allied
 * side's pair sealed one, all of them are left to setup.
 */
function sealedWarlords(league: LeagueBattleSetup, ...sides: string[][]) {
  const warlords = sides.flatMap((playerIds, side) => {
    const playerId = league.entries.find((entry) => entry.userId === playerIds[0])?.teamWarlord
    return playerIds.length > 1 ? [{ side, playerId: playerId && playerIds.includes(playerId) ? playerId : null }] : []
  })
  if (!warlords.length || warlords.some((entry) => !entry.playerId)) return {}
  return { warlords: warlords.map(({ side, playerId }) => ({ side, playerId: playerId! })) }
}

export function buildLeagueBattle(
  league: LeagueBattleSetup,
  userId: string,
  opponentId: string,
  missionPackId: string | null,
  battleToken: string,
  allyId?: string,
  secondOpponentId?: string,
) {
  const invited = [opponentId, allyId, secondOpponentId].filter((id): id is string => Boolean(id))

  if (league.revealedAt === null) throw new LeagueBattleSetupError('reveal the rosters before starting a battle', 409)
  if (league.rounds !== null && !league.paired)
    throw new LeagueBattleSetupError('play the opponent you were paired with this round, once the round is paired', 409)
  const expectedPlayers = league.format === '2v2' ? 4 : league.format === '2v1' ? 3 : 2
  if (league.format === '2v2' && !LEAGUE_TEAM_ROSTER_LIMITS.some((candidate) => candidate === league.rosterLimit)) {
    throw new LeagueBattleSetupError('sealed rosters use an unsupported doubles battle size', 409)
  }
  if (league.format === '1v1' || league.format === null) {
    if (league.entries.length !== expectedPlayers || invited.length !== expectedPlayers - 1)
      throw new LeagueBattleSetupError('choose accepted entrants with sealed rosters', 403)
  }
  const rosters = new Map(
    league.entries.map((entry) => {
      if (!entry.snapshot) throw new Error('accepted entrant has no roster snapshot')
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
  if (!isGameSize(limit)) throw new LeagueBattleSetupError('sealed rosters use an unsupported battle size', 409)

  if (league.format === '2v1') {
    const requirements = new Map(league.entries.map((entry) => [entry.userId, entry.requiredLimit]))
    const alliedLimit = alliedLeagueRosterLimit(limit)
    const creatorLimit = requirements.get(userId)
    // A fixed allied pair always plays together; an event revealed before pairs existed names the second ally.
    const teammate = (playerId: string) => {
      const teamId = league.entries.find((entry) => entry.userId === playerId)?.teamId
      return teamId ? league.entries.find((entry) => entry.teamId === teamId && entry.userId !== playerId)?.userId : undefined
    }
    if (creatorLimit === limit) {
      const second = teammate(opponentId) ?? secondOpponentId
      if (
        allyId ||
        !second ||
        (secondOpponentId && secondOpponentId !== second) ||
        requirements.get(opponentId) !== alliedLimit ||
        requirements.get(second) !== alliedLimit
      ) {
        throw new LeagueBattleSetupError('a solo entrant must face two allied entrants', 409)
      }
      opponentIds = [opponentId, second]
    } else {
      const ally = teammate(userId) ?? allyId
      if (
        creatorLimit !== alliedLimit ||
        !ally ||
        (allyId && allyId !== ally) ||
        secondOpponentId ||
        requirements.get(ally) !== alliedLimit ||
        requirements.get(opponentId) !== limit
      ) {
        throw new LeagueBattleSetupError('an allied entrant must choose one allied teammate and one solo opponent', 409)
      }
      allyIds = [ally]
    }
    participantIds = [userId, ...allyIds, ...opponentIds]
    for (const playerId of participantIds) {
      const built = rosters.get(playerId)?.built
      if (!built || leagueSeatRefusal(built, limit, leagueSeatPoints(league, requirements.get(playerId) === limit)!))
        throw new LeagueBattleSetupError('a sealed roster does not fit its seat', 409)
    }
  }
  if (league.format === '2v2') {
    const points = leagueSeatPoints(league, false)!
    const misfit = (playerId: string) => {
      const built = rosters.get(playerId)?.built
      return !built || leagueSeatRefusal(built, limit, points) !== null
    }
    if (participantIds.some(misfit)) throw new LeagueBattleSetupError('a sealed roster does not fit its seat', 409)
  }

  const initialCommands: Command[] = [
    {
      kind: 'configure-battle',
      limit,
      missionPackId,
      terrainLayoutId: null,
      twistId: null,
      teamBattle: isTeamFormat(league.format),
      playerCount: expectedPlayers,
      // The creator's side sits first, so its seat's points do too.
      ...(isTeamFormat(league.format)
        ? { armyPoints: [allyIds.length > 0, opponentIds.length > 1].map((pair) => leagueSeatPoints(league, !pair)!) }
        : {}),
      clockLimitMinutes: null,
    },
    { kind: 'attach-roster', playerId: userId, roster: ownRoster, prep: null, painted: true },
    { kind: 'attach-roster', playerId: opponentIds[0]!, roster: opponentRoster, prep: null, painted: true },
    ...participantIds
      .filter((playerId) => playerId !== userId && playerId !== opponentIds[0])
      .map((playerId) => ({ kind: 'attach-roster' as const, playerId, roster: rosters.get(playerId)!, prep: null, painted: true })),
    {
      kind: 'lock-league-rosters',
      leagueToken: league.token,
      eventToken: league.eventToken,
      ...sealedDispositions(league, [userId, ...allyIds], opponentIds),
      ...sealedWarlords(league, [userId, ...allyIds], opponentIds),
    },
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
