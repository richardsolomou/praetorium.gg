import { parseRosterSnapshot } from '../core/commands'
import { type Command, isGameSize } from '../core/battle'
import {
  isTeamFormat,
  alliedSealedEventRosterLimit,
  SEALED_EVENT_TEAM_ROSTER_LIMITS,
  sealedEventSeatPoints,
  sealedEventSeatRefusal,
  type SealedEventArmyPoints,
} from '../core/sealedEvent'
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

export type SealedEventBattleSetup = {
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
} & SealedEventArmyPoints
export class SealedEventBattleSetupError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}
/** The card each allied side sealed before reveal; an event whose pairs never sealed one leaves every side's to setup. */
function sealedDispositions(sealedEvent: SealedEventBattleSetup, ...sides: string[][]) {
  const dispositions = sides.flatMap((playerIds, side) => {
    const disposition = sealedEvent.entries.find((entry) => entry.userId === playerIds[0])?.teamDisposition
    return playerIds.length > 1 ? [{ side, disposition }] : []
  })
  if (!dispositions.length || dispositions.some((entry) => !entry.disposition)) return {}
  return { dispositions: dispositions.map(({ side, disposition }) => ({ side, disposition: disposition! })) }
}

/**
 * Whose Warlord leads each allied side, as its pair sealed it. Sealing locks every side's choice, so unless every allied
 * side's pair sealed one, all of them are left to setup.
 */
function sealedWarlords(sealedEvent: SealedEventBattleSetup, ...sides: string[][]) {
  const warlords = sides.flatMap((playerIds, side) => {
    const playerId = sealedEvent.entries.find((entry) => entry.userId === playerIds[0])?.teamWarlord
    return playerIds.length > 1 ? [{ side, playerId: playerId && playerIds.includes(playerId) ? playerId : null }] : []
  })
  if (!warlords.length || warlords.some((entry) => !entry.playerId)) return {}
  return { warlords: warlords.map(({ side, playerId }) => ({ side, playerId: playerId! })) }
}

export function buildSealedEventBattle(
  sealedEvent: SealedEventBattleSetup,
  userId: string,
  opponentId: string,
  missionPackId: string | null,
  battleToken: string,
  allyId?: string,
  secondOpponentId?: string,
) {
  const invited = [opponentId, allyId, secondOpponentId].filter((id): id is string => Boolean(id))

  if (sealedEvent.revealedAt === null) throw new SealedEventBattleSetupError('reveal the rosters before starting a battle', 409)
  if (sealedEvent.rounds !== null && !sealedEvent.paired)
    throw new SealedEventBattleSetupError('play the opponent you were paired with this round, once the round is paired', 409)
  const expectedPlayers = sealedEvent.format === '2v2' ? 4 : sealedEvent.format === '2v1' ? 3 : 2
  if (sealedEvent.format === '2v2' && !SEALED_EVENT_TEAM_ROSTER_LIMITS.some((candidate) => candidate === sealedEvent.rosterLimit)) {
    throw new SealedEventBattleSetupError('sealed rosters use an unsupported doubles battle size', 409)
  }
  if (sealedEvent.format === '1v1' || sealedEvent.format === null) {
    if (sealedEvent.entries.length !== expectedPlayers || invited.length !== expectedPlayers - 1)
      throw new SealedEventBattleSetupError('choose accepted entrants with sealed rosters', 403)
  }
  const rosters = new Map(
    sealedEvent.entries.map((entry) => {
      if (!entry.snapshot) throw new Error('accepted entrant has no roster snapshot')
      return [entry.userId, parseRosterSnapshot(entry.snapshot)] as const
    }),
  )
  let participantIds = [userId, ...invited]
  let allyIds: string[] = []
  let opponentIds = [opponentId]
  if (sealedEvent.format === '2v2') {
    if (invited.length !== 1 || allyId || secondOpponentId) throw new SealedEventBattleSetupError('choose one opposing doubles team', 400)
    const ownTeamId = sealedEvent.entries.find((entry) => entry.userId === userId)?.teamId
    const opposingTeamId = sealedEvent.entries.find((entry) => entry.userId === opponentId)?.teamId
    if (!ownTeamId || !opposingTeamId || ownTeamId === opposingTeamId)
      throw new SealedEventBattleSetupError('choose an opposing doubles team', 409)
    const ownTeam = sealedEvent.entries.filter((entry) => entry.teamId === ownTeamId)
    const opposingTeam = sealedEvent.entries.filter((entry) => entry.teamId === opposingTeamId)
    if (ownTeam.length !== 2 || opposingTeam.length !== 2)
      throw new SealedEventBattleSetupError('doubles teams must contain exactly two entrants', 409)
    allyIds = ownTeam.filter((entry) => entry.userId !== userId).map((entry) => entry.userId)
    opponentIds = [opponentId, ...opposingTeam.filter((entry) => entry.userId !== opponentId).map((entry) => entry.userId)]
    participantIds = [userId, ...allyIds, ...opponentIds]
  }
  const ownRoster = rosters.get(userId)
  const opponentRoster = rosters.get(opponentIds[0]!)
  const limit = sealedEvent.format === null ? ownRoster?.built?.limit : sealedEvent.rosterLimit
  if (!ownRoster || !opponentRoster || limit === null || limit === undefined)
    throw new SealedEventBattleSetupError('sealed rosters use an invalid battle size', 409)
  if (
    sealedEvent.format !== '2v1' &&
    sealedEvent.format !== '2v2' &&
    (ownRoster.built?.limit !== limit || opponentRoster.built?.limit !== limit)
  ) {
    throw new SealedEventBattleSetupError('sealed rosters must use the same battle size', 409)
  }
  if (!isGameSize(limit)) throw new SealedEventBattleSetupError('sealed rosters use an unsupported battle size', 409)

  if (sealedEvent.format === '2v1') {
    const requirements = new Map(sealedEvent.entries.map((entry) => [entry.userId, entry.requiredLimit]))
    const alliedLimit = alliedSealedEventRosterLimit(limit)
    const creatorLimit = requirements.get(userId)
    // A fixed allied pair always plays together; an event revealed before pairs existed names the second ally.
    const teammate = (playerId: string) => {
      const teamId = sealedEvent.entries.find((entry) => entry.userId === playerId)?.teamId
      return teamId ? sealedEvent.entries.find((entry) => entry.teamId === teamId && entry.userId !== playerId)?.userId : undefined
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
        throw new SealedEventBattleSetupError('a solo entrant must face two allied entrants', 409)
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
        throw new SealedEventBattleSetupError('an allied entrant must choose one allied teammate and one solo opponent', 409)
      }
      allyIds = [ally]
    }
    participantIds = [userId, ...allyIds, ...opponentIds]
  }
  if (isTeamFormat(sealedEvent.format)) {
    const pairs = [[userId, ...allyIds], opponentIds]
    const misfit = (playerId: string) => {
      const built = rosters.get(playerId)?.built
      const solo = sealedEvent.format === '2v1' && sealedEvent.entries.find((entry) => entry.userId === playerId)?.requiredLimit === limit
      const partnerId = pairs.find((pair) => pair.includes(playerId))!.find((id) => id !== playerId)
      const pair = sealedEvent.sharedPoints && !solo ? { partner: rosters.get(partnerId!)?.built ?? null } : undefined
      return !built || sealedEventSeatRefusal(built, limit, sealedEventSeatPoints(sealedEvent, solo)!, pair) !== null
    }
    if (participantIds.some(misfit)) throw new SealedEventBattleSetupError('a sealed roster does not fit its seat', 409)
  }

  const initialCommands: Command[] = [
    {
      kind: 'configure-battle',
      limit,
      missionPackId,
      terrainLayoutId: null,
      twistId: null,
      teamBattle: isTeamFormat(sealedEvent.format),
      playerCount: expectedPlayers,
      // The creator's side sits first, so its seat's points do too.
      ...(isTeamFormat(sealedEvent.format)
        ? {
            armyPoints: [allyIds.length > 0, opponentIds.length > 1].map((pair) => sealedEventSeatPoints(sealedEvent, !pair)!),
            ...(sealedEvent.sharedPoints ? { sharedArmyPoints: true } : {}),
          }
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
      leagueToken: sealedEvent.token,
      eventToken: sealedEvent.eventToken,
      ...sealedDispositions(sealedEvent, [userId, ...allyIds], opponentIds),
      ...sealedWarlords(sealedEvent, [userId, ...allyIds], opponentIds),
    },
  ]
  return {
    allyIds,
    opponentIds,
    initialCommands,
    result: {
      token: battleToken,
      format: sealedEvent.format,
      requiredLimit:
        sealedEvent.format === '2v2'
          ? alliedSealedEventRosterLimit(limit)
          : (sealedEvent.entries.find((entry) => entry.userId === userId)?.requiredLimit ?? limit),
      participantIds,
    },
  }
}
