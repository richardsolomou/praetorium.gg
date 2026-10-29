import { z } from 'zod'
import {
  applyEntry,
  BATTLE_ROUNDS,
  type BattleState,
  type Command,
  emptyBattle,
  importedCommandRefusal,
  PHASES,
  type Phase,
  type PlayerId,
  type Roster,
  type Secondary,
  type SecondaryMode,
  STRATAGEM_CP_MAX,
  STRATAGEMS_MAX,
  type Stratagem,
  SECONDARY_DECK_MAX,
} from './battle'
import { titled } from './battlebaseRoster'
import { PROFILE_NAME_MAX_LENGTH } from './profileName'
import { routeSlug } from './slug'

const text = z.string().max(500)
const player = z.object({ id: text, username: text, isTestOpponent: z.boolean().nullish() })
const battlebaseEvent = z.object({
  id: z.number().int(),
  type: text,
  actor: text.nullish(),
  value: z.number().int().nullish(),
  data: z
    .object({
      turnNumber: z.number().int().optional(),
      missionId: text.optional(),
      stratagemId: text.optional(),
      rosterUnitId: text.optional(),
    })
    .nullish(),
  timestamp: z.number().int().nonnegative(),
})
const side = z.object({ type: text.nullish(), fixedSecondaryMissionIds: z.array(text).max(8).nullish() }).nullish()

/** The part of a BattleBase battle an import reads; BattleBase's "me" is whoever created the battle. */
export const battlebaseBattleSchema = z.object({
  id: text,
  createdAt: z.iso.datetime(),
  isFinished: z.boolean(),
  createdBy: player,
  opponent: player.nullable(),
  eventsJson: z.array(battlebaseEvent).max(5_000),
  battleSetupJson: z.object({
    battleSizeId: text.nullish(),
    missionPackId: text.nullish(),
    isAttackerMe: z.boolean().nullish(),
    missionSelection: z.object({ missionId: text.nullish(), deploymentId: text.nullish() }).nullish(),
    secondaryMissionSelections: z.object({ me: side, opponent: side }).nullish(),
    playersAndFactions: z.object({
      meFactionId: text.nullish(),
      meDetachmentId: text.nullish(),
      meDetachmentIds: z.array(text).max(8).nullish(),
      opponentFactionId: text.nullish(),
      opponentDetachmentId: text.nullish(),
      opponentDetachmentIds: z.array(text).max(8).nullish(),
      meRoster: z.object({ data: z.string().max(1_000_000) }).nullish(),
      opponentRoster: z.object({ data: z.string().max(1_000_000) }).nullish(),
    }),
  }),
})

export type BattlebaseBattle = z.infer<typeof battlebaseBattleSchema>

/** An army ready to field: the roster, and the unit each BattleBase unit id became, where the catalogue rebuilt it. */
export type ImportedArmy = { roster: Roster; units: Readonly<Record<string, string>> }

/** The mission pack the battle was played from, as this app holds it, when it holds it. */
export type ImportPack = {
  id: string
  secondaries: readonly { key: string; name: string }[]
  primaries: readonly { key: string; name: string }[]
  deployments: readonly { id: string; name: string }[]
}

export type BattlebaseImport = {
  sourceId: string
  createdAt: number
  /** The opponent's BattleBase id, which the guest seat stands for. */
  opponentId: string
  guestName: string
  commands: { command: Command; at: number }[]
}

export type BattlebaseSkip = 'unfinished' | 'not-a-player' | 'test-opponent' | 'unreadable'

const BATTLE_SIZES: Record<string, number> = {
  'battle-size-incursion': 1000,
  'battle-size-strike-force': 2000,
  'battle-size-onslaught': 3000,
}

export const battlebaseLimit = (battle: BattlebaseBattle) => BATTLE_SIZES[battle.battleSetupJson.battleSizeId ?? ''] ?? null

/** One side's army as BattleBase recorded it: `creator` is the side of the player who opened the battle. */
export function battlebaseArmy(battle: BattlebaseBattle, creator: boolean) {
  const sides = battle.battleSetupJson.playersAndFactions
  return creator
    ? { faction: sides.meFactionId, detachments: sides.meDetachmentIds ?? [sides.meDetachmentId ?? ''], roster: sides.meRoster?.data }
    : {
        faction: sides.opponentFactionId,
        detachments: sides.opponentDetachmentIds ?? [sides.opponentDetachmentId ?? ''],
        roster: sides.opponentRoster?.data,
      }
}

/** BattleBase's pack id spells the season `2026-27`; this app's spells it `2026-2027`. */
export function battlebasePack(battle: BattlebaseBattle, packIds: readonly string[]) {
  const pack = battle.battleSetupJson.missionPackId?.replace(/^mission-pack-/, '')
  return packIds.find((id) => pack && id.replace(/-20(\d\d)$/, '-$1') === pack) ?? null
}

/** The order a turn plays its phases in, counted from the start of the battle. */
const position = (round: number, secondTurn: boolean, phase: Phase) =>
  ((round - 1) * 2 + (secondTurn ? 1 : 0)) * PHASES.length + PHASES.indexOf(phase)

const PHASE_EVENTS: Record<string, Phase> = {
  STARTED_COMMAND_PHASE: 'command',
  STARTED_MOVEMENT_PHASE: 'movement',
  STARTED_SHOOTING_PHASE: 'shooting',
  STARTED_CHARGE_PHASE: 'charge',
  STARTED_FIGHT_PHASE: 'fight',
  STARTED_SCORING_END_OF_TURN_PRIMARY_POINTS: 'end',
  STARTED_SCORING_END_OF_TURN_SECONDARY_POINTS: 'end',
  STARTED_SCORING_END_OF_BATTLE_ROUND_PRIMARY_POINTS: 'end',
  STARTED_SCORING_END_OF_BATTLE_ROUND_SECONDARY_POINTS: 'end',
  STARTED_SCORING_END_OF_GAME_PRIMARY_POINTS: 'end',
  STARTED_SCORING_END_OF_GAME_SECONDARY_POINTS: 'end',
}

const STATUS_EVENTS: Record<string, 'achieved' | 'discarded' | 'returned'> = {
  ACHIEVED_TACTICAL_SECONDARY_MISSION: 'achieved',
  DISCARDED_TACTICAL_SECONDARY_MISSION: 'discarded',
  SHUFFLED_TACTICAL_SECONDARY_MISSION_BACK_INTO_DECK: 'returned',
}

/** Card and stratagem keys are bounded; BattleBase's own ids can run longer. */
const KEY_MAX = 64

/**
 * A mission card BattleBase names by id, as in `secondary-mission-chapter-approved-2026-27-assassination`:
 * the pack's own card when the pack is held here, and otherwise one named from the id.
 */
function missionCard(id: string, pack: ImportPack | null, kind: 'secondaries' | 'primaries'): Secondary {
  const bare = id
    .trim()
    .replace(/^(secondary-mission|primary-mission|challenger-card-mission|mission)-/, '')
    .replace(/^chapter-approved-\d{4}-\d{2}-/, '')
  const held = pack?.[kind].find((card) => routeSlug(card.name) === bare)
  return held ? { key: held.key, name: held.name } : { key: id.slice(-KEY_MAX), name: titled(bare) }
}

/**
 * A stratagem BattleBase names by id, as in `stratagem-dark-angels-wrath-of-the-rock-armour-of-contempt`:
 * the longest stratagem name the id ends with, and the side's detachment it names, if any.
 */
function stratagemOf(id: string, cp: number, names: readonly string[], detachments: readonly string[]): Stratagem {
  const bare = `-${id.replace(/^stratagem-/, '')}`
  const named = names.filter((candidate) => bare.endsWith(`-${routeSlug(candidate)}`)).sort((left, right) => right.length - left.length)[0]
  const name =
    named && named !== named.toLowerCase() ? named : titled(named ? routeSlug(named) : bare.replace(/^-core-(11th-edition-)?/, ''))
  const detachment = detachments.find((candidate) => bare.includes(`-${routeSlug(candidate)}-`))
  return {
    key: id.replace(/^stratagem-/, '').slice(-KEY_MAX),
    name,
    cp: Math.min(Math.max(cp, 0), STRATAGEM_CP_MAX),
    limit: 'unlimited',
    ...(detachment ? { detachment } : {}),
  }
}

/**
 * A finished BattleBase battle as the commands that replay it as a guided battle.
 *
 * Every phase, card, stratagem, score, command point and destroyed unit is replayed when it
 * happened, by the side it happened to, and checked by the same rules as a live command
 * apart from the table's own prompts (`importedCommandRefusal`). Where this app's rules
 * would read a play differently, the points still land as a correction, so every total is
 * BattleBase's.
 */
export function battlebaseBattleImport(
  battle: BattlebaseBattle,
  seats: { battlebaseId: string; userId: PlayerId; guestId: PlayerId },
  context: { armies: { creator: ImportedArmy; opponent: ImportedArmy }; pack: ImportPack | null; stratagemNames: readonly string[] },
): BattlebaseImport | BattlebaseSkip {
  if (!battle.isFinished) return 'unfinished'
  const opponent = battle.opponent
  if (!opponent) return 'unreadable'
  if (opponent.isTestOpponent) return 'test-opponent'
  const creator = battle.createdBy.id === seats.battlebaseId
  if (!creator && opponent.id !== seats.battlebaseId) return 'not-a-player'
  const them = creator ? opponent : battle.createdBy
  const seatOf = (actor: string | null | undefined) =>
    actor === seats.battlebaseId ? seats.userId : actor === them.id ? seats.guestId : null
  const isCreator = (playerId: PlayerId) => (playerId === seats.userId) === creator

  const setup = battle.battleSetupJson
  const { pack } = context
  const events = battle.eventsJson.toSorted((left, right) => left.id - right.id)
  const firstTurn = events.find((event) => event.type === 'STARTED_TURN')
  const firstPlayerId = seatOf(firstTurn?.actor)
  if (!firstTurn || !firstPlayerId) return 'unreadable'
  const createdAt = Date.parse(battle.createdAt)
  const armyOf = (playerId: PlayerId) => (isCreator(playerId) ? context.armies.creator : context.armies.opponent)

  const state: BattleState = emptyBattle([seats.userId, seats.guestId], [0, 1])
  const commands: BattlebaseImport['commands'] = []
  let at = createdAt
  const push = (command: Command, when: number) => {
    if (importedCommandRefusal(state, seats.userId, command)) return false
    at = Math.max(at, when)
    commands.push({ command, at })
    state.seq = commands.length
    applyEntry(state, { seq: commands.length, by: seats.userId, at, command })
    return true
  }
  const onBehalf = (playerId: PlayerId) => (playerId === seats.userId ? {} : { playerId })
  const seat = (playerId: PlayerId) => state.players.find((candidate) => candidate.id === playerId)!
  const correct = (playerId: PlayerId, resource: 'cp' | 'primary' | 'secondary', delta: number, when: number) => {
    const bounded = Math.max(delta, -seat(playerId)[resource])
    if (bounded) push({ kind: 'correct-player', playerId, resource, delta: bounded }, when)
  }

  push(
    {
      kind: 'configure-battle',
      limit: battlebaseLimit(battle),
      missionPackId: pack?.id ?? null,
      terrainLayoutId: null,
      twistId: null,
      teamBattle: false,
      playerCount: 2,
      clockLimitMinutes: null,
    },
    createdAt,
  )
  for (const playerId of [seats.userId, seats.guestId])
    push({ kind: 'attach-roster', roster: armyOf(playerId).roster, ...onBehalf(playerId) }, createdAt)

  // The battle ready bonus is this app's own, so a side BattleBase paid it to plays painted.
  for (const event of events)
    if (event.type === 'GAINED_BONUS_VP_FOR_PAINTED_ARMY' && event.value && seatOf(event.actor))
      push({ kind: 'set-painted', painted: true, ...onBehalf(seatOf(event.actor)!) }, createdAt)
  const deployment = setup.missionSelection?.deploymentId?.replace(/^deployment-chapter-approved-\d{4}-\d{2}-/, '')
  const deploymentId = pack?.deployments.find((candidate) => routeSlug(candidate.name) === deployment)?.id
  if (deploymentId) push({ kind: 'set-deployment', patternId: deploymentId }, createdAt)

  const primaries = (setup.missionSelection?.missionId ?? '').split('|').filter((id) => id.trim())
  for (const playerId of [seats.userId, seats.guestId]) {
    const actor = playerId === seats.userId ? seats.battlebaseId : them.id
    const selection = isCreator(playerId) ? setup.secondaryMissionSelections?.me : setup.secondaryMissionSelections?.opponent
    const drawn = [
      ...new Map(
        events
          .filter((event) => event.actor === actor && event.type === 'DREW_SECONDARY_MISSION_CARD' && event.data?.missionId)
          .map((event) => missionCard(event.data!.missionId!, pack, 'secondaries'))
          .map((card) => [card.key, card]),
      ).values(),
    ].slice(0, SECONDARY_DECK_MAX)
    const tactical = !selection?.type?.endsWith('FIXED') && drawn.length > 0
    const detachments = armyOf(playerId).roster.built?.detachments?.map((detachment) => detachment.name) ?? []
    const stratagems = [
      ...new Map(
        events
          .filter((event) => event.actor === actor && event.type === 'USED_COMMAND_POINTS' && event.data?.stratagemId)
          .map((event) => stratagemOf(event.data!.stratagemId!, event.value ?? 0, context.stratagemNames, detachments))
          .map((stratagem) => [stratagem.key, stratagem]),
      ).values(),
    ].slice(0, STRATAGEMS_MAX)
    const primary = primaries[isCreator(playerId) ? 0 : primaries.length - 1]
    const secondaryMode: SecondaryMode = tactical ? 'tactical' : 'fixed'
    push(
      {
        kind: 'set-prep',
        stratagems,
        secondaries: tactical ? [] : (selection?.fixedSecondaryMissionIds ?? []).map((id) => missionCard(id, pack, 'secondaries')),
        ...(tactical ? { secondaryDeck: drawn } : {}),
        primary: primary ? missionCard(primary, pack, 'primaries') : null,
        secondaryMode,
        ...onBehalf(playerId),
      },
      createdAt,
    )
  }
  const attackerId =
    setup.isAttackerMe === undefined || setup.isAttackerMe === null
      ? undefined
      : setup.isAttackerMe === creator
        ? seats.userId
        : seats.guestId
  if (!push({ kind: 'begin-battle', firstPlayerId, ...(attackerId ? { attackerId } : {}) }, firstTurn.timestamp)) return 'unreadable'

  /** Plays on to a later moment of the battle, never back to an earlier one. */
  const reach = (round: number, playerId: PlayerId, phase: Phase, when: number) => {
    const target = position(round, playerId !== state.firstPlayerId, phase)
    while (state.status === 'playing' && state.activePlayerId && !state.completionPending) {
      const current = position(state.round, state.activePlayerId !== state.firstPlayerId, state.phase)
      if (current >= target || !push({ kind: 'advance', ...onBehalf(state.activePlayerId) }, when)) return
    }
    if (state.completionPending && round > BATTLE_ROUNDS) push({ kind: 'settle-opponent-turn' }, when)
  }
  /** BattleBase's running command points for each side, which this side's are brought back to after every change. */
  const ledger = new Map<PlayerId, number>([
    [seats.userId, 0],
    [seats.guestId, 0],
  ])
  /**
   * A gain BattleBase recorded is a gain here too. Anything left over is the command phase's own
   * point, which guided play grants by itself and BattleBase records as a gain, so it is corrected.
   */
  const settleCp = (playerId: PlayerId, when: number) => {
    const owed = Math.max(ledger.get(playerId)!, 0) - seat(playerId).cp
    if (owed > 0 && !push({ kind: 'adjust-cp', delta: owed, ...onBehalf(playerId) }, when)) correct(playerId, 'cp', owed, when)
    if (owed < 0) correct(playerId, 'cp', owed, when)
  }
  /** Pays what BattleBase charged, out of what this side held; BattleBase lets a side go below zero. */
  const spendCp = (playerId: PlayerId, value: number, stratagemId: string | undefined, when: number) => {
    settleCp(playerId, when)
    ledger.set(playerId, ledger.get(playerId)! - value)
    const cost = Math.min(value, seat(playerId).cp)
    const key = stratagemId?.replace(/^stratagem-/, '').slice(-KEY_MAX)
    const used = key && seat(playerId).stratagems.some((stratagem) => stratagem.key === key)
    if (used) push({ kind: 'use-stratagem', key, cp: cost, ...onBehalf(playerId) }, when)
    else if (cost) push({ kind: 'adjust-cp', delta: -cost, ...onBehalf(playerId) }, when)
    settleCp(playerId, when)
  }
  /** Points scored by card where BattleBase names one, and by category otherwise; a negative score is a correction. */
  const score = (playerId: PlayerId, category: 'primary' | 'secondary', value: number, missionId: string | undefined, when: number) => {
    const key = category === 'secondary' && missionId ? missionCard(missionId, pack, 'secondaries').key : null
    const recorded =
      value > 0 &&
      push(
        key
          ? { kind: 'score-settlement', scores: [{ category: 'secondary', key, delta: value }], ...onBehalf(playerId) }
          : category === 'primary'
            ? { kind: 'score-settlement', scores: [{ category: 'primary', delta: value }], ...onBehalf(playerId) }
            : { kind: 'score', category, delta: value, ...onBehalf(playerId) },
        when,
      )
    if (!recorded) correct(playerId, category, value, when)
  }

  for (const event of events) {
    if (state.status !== 'playing') break
    const playerId = seatOf(event.actor)
    const phase = PHASE_EVENTS[event.type]
    const status = STATUS_EVENTS[event.type]
    const when = event.timestamp
    if (event.type === 'STARTED_TURN' && playerId && event.data?.turnNumber)
      reach(Math.min(event.data.turnNumber, BATTLE_ROUNDS), playerId, 'command', when)
    else if (phase && playerId) reach(state.round, playerId, phase, when)
    else if (event.type === 'GAINED_PRIMARY_VICTORY_POINTS' && playerId && event.value)
      score(playerId, 'primary', event.value, undefined, when)
    else if (event.type === 'GAINED_SECONDARY_VICTORY_POINTS' && playerId && event.value)
      score(playerId, 'secondary', event.value, event.data?.missionId, when)
    else if (event.type === 'GAINED_CHALLENGER_CARD_MISSION_VICTORY_POINTS' && playerId && event.value)
      correct(playerId, 'secondary', event.value, when)
    else if (event.type === 'DREW_SECONDARY_MISSION_CARD' && playerId && event.data?.missionId) {
      const card = missionCard(event.data.missionId, pack, 'secondaries')
      const held = seat(playerId).secondaries.some((secondary) => secondary.key === card.key)
      if (held) push({ kind: 'set-secondary-status', key: card.key, status: 'active', ...onBehalf(playerId) }, when)
      else if (seat(playerId).secondaryDeck?.some((secondary) => secondary.key === card.key))
        push({ kind: 'draw-secondary', secondary: card, ...onBehalf(playerId) }, when)
    } else if (status && playerId && event.data?.missionId) {
      const key = missionCard(event.data.missionId, pack, 'secondaries').key
      // BattleBase discards an achieved card from the hand as well, which leaves it achieved here.
      if (status !== 'discarded' || seat(playerId).secondaryStatus[key] !== 'achieved')
        push({ kind: 'set-secondary-status', key, status, ...onBehalf(playerId) }, when)
    } else if ((event.type === 'GAINED_COMMAND_POINT' || event.type === 'ADJUSTED_CP') && playerId) {
      ledger.set(playerId, ledger.get(playerId)! + (event.value ?? 1))
      settleCp(playerId, when)
    } else if (event.type === 'USED_COMMAND_POINTS' && playerId && (event.value || event.data?.stratagemId))
      spendCp(playerId, event.value ?? 0, event.data?.stratagemId, when)
    else if (event.type === 'MARKED_UNIT_AS_DESTROYED' && playerId && event.data?.rosterUnitId) {
      const unitKey = armyOf(playerId).units[event.data.rosterUnitId]
      if (unitKey) push({ kind: 'set-unit', unitKey, destroyed: true, ...onBehalf(playerId) }, when)
    } else if (event.type === 'CONCEDED_BATTLE' && playerId) push({ kind: 'end-battle', reason: 'conceded', concededBy: playerId }, when)
    else if (event.type === 'FINISHED_GAME') finish(when)
  }
  finish(events.at(-1)?.timestamp ?? at)

  function finish(when: number) {
    if (state.status !== 'playing') return
    if (state.round === BATTLE_ROUNDS) reach(BATTLE_ROUNDS + 1, firstPlayerId!, 'command', when)
    if (state.status === 'playing') push({ kind: 'end-battle', reason: 'finished-early' }, when)
  }
  if (state.status !== 'finished') return 'unreadable'
  return { sourceId: battle.id, createdAt, opponentId: them.id, guestName: them.username.slice(0, PROFILE_NAME_MAX_LENGTH), commands }
}
