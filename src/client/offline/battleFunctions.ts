import { sealedEventBattleOptions, savedAbilityReminders } from './actionFunctions'
import { OfflineRefusal } from './offlineRefusal'
import { fieldingReminders } from '../../shared/reminderAbilities'
import { compactReplayFrames } from '../../core/replayFrames'
import { REPLAY_BATCH_SIZE } from '../../contracts/battles'
import { buildSealedEventBattle, openPairing } from '../../shared/sealedEventBattle'
import { battleSummary } from '../../shared/battleSummary'
import type * as Server from '../../server/functions'
import * as server from '../../server/functions'
import { battleWorkspace } from '../../server/functions/offline'
import type { BattleWorkspace } from '../../contracts/battleWorkspace'
import type { LocalState } from '../../contracts/localState'
import { commandSchema } from '../../core/commands'
import { guestSeatId, isPracticeSeat } from '../../core/newBattle'
import { createBattleSchema, saveRosterSchema, submitSchema } from '../../contracts/schemas'
import { appendLocalCommand, resolveLocalDraw, localBattleState } from '../../core/offlineBattle'
import { battleView } from '../../core/battleView'
import { commandArmy, type Command } from '../../core/battle'
import { battleClock } from '../../core/battleClock'
import { battleReport as foldReport } from '../../core/battleReport'
import { battleLogThroughSeq, battleTimeline } from '../../core/battleReplay'
import { rosterSnapshot } from '../../core/rosterSnapshot'
import { rosterUseError } from '../../core/rosterLegality'
import { calculateRosterPrice, savedRosterPriceInput } from '../../shared/pricing'
import { unitBattleDetailsIn } from '../../shared/catalogue'
import {
  hydrateAuthoritativeAwards,
  resolvedMissionForSide,
  setupReferenceError,
  repairPrepReferenceError,
  scoringCapError,
  withAuthoritativeAwards,
} from '../../shared/battleRules'
import { hasSyncableWork } from './syncEngine'
import {
  localClient,
  localDocument,
  localEngine,
  localOwner,
  hasLocalChanges,
  hasSyncableChanges,
  rememberBattle,
  queueLocal,
  attemptLocalSync,
  type LocalRoster,
} from './localRuntime'
import { builtLocalConstruction, constructionData, hasLocalConstruction, localConstruction } from './construction'
import { cachedRead, cachedPage } from './reads'
import { isFetchNetworkFailure } from '../networkErrors'
import { battleKey, battlesKey, meKey, opponentsKey, reportKey } from '../queries/queryKeys'

export function workspaceScreen(
  workspace: BattleWorkspace,
  viewerId: string,
): NonNullable<Awaited<ReturnType<typeof Server.openBattle>>> & { kind: 'battle' } {
  const rules = localConstruction()?.rules
  const state = localBattleState(workspace.players, workspace.log)
  if (rules) hydrateAuthoritativeAwards(state, rules)
  const view = battleView(workspace.battle, workspace.players, state, viewerId)
  const missions = [...new Set(workspace.players.map((player) => player.side))].map((side) => ({
    side,
    mission: rules ? resolvedMissionForSide(state, rules, side) : null,
  }))
  const viewerSide = workspace.players.find((player) => player.id === viewerId)?.side
  const report =
    state.status === 'finished'
      ? foldReport(
          workspace.players,
          workspace.log,
          workspace.players.map((player) => player.id),
          viewerId,
          workspace.players.map((player) => player.side),
          rules,
        )
      : []
  const labels = new Map(report.map((entry) => [entry.seq, entry.text]))
  return {
    kind: 'battle',
    view,
    clock: battleClock(
      workspace.players.map((player) => player.id),
      workspace.log,
      workspace.players.map((player) => player.side),
      workspace.players.filter((player) => player.automated).map((player) => player.id),
    ),
    mission: missions.find((mission) => mission.side === viewerSide)?.mission ?? null,
    missions,
    ...(state.status === 'finished'
      ? {
          timeline: battleTimeline(
            workspace.players.map((player) => player.id),
            workspace.log,
            workspace.players.map((player) => player.side),
          ).map((point) => ({ ...point, text: labels.get(point.seq) ?? 'Undone action' })),
        }
      : {}),
  }
}

export async function openBattle(args: Parameters<typeof server.openBattle>[0]): ReturnType<typeof server.openBattle> {
  const owner = localOwner()
  const resource = `battle:${args.data.token}`
  const workspace = await localDocument<BattleWorkspace | null>(resource)
  if (workspace === null && (await hasLocalChanges(resource))) return { kind: 'unavailable' }
  if (workspace && owner && (!navigator.onLine || (await hasSyncableChanges(resource)))) return workspaceScreen(workspace, owner.id)
  try {
    const result = await cachedRead(battleKey(args.data.token), async () => {
      // A battle saved on this device is one this account sits in, so its history downloads alongside the screen.
      const download = workspace && localEngine() ? battleWorkspace(args) : undefined
      download?.catch(() => {})
      const screen = await server.openBattle(args)
      if (screen?.kind === 'battle' && localEngine()) {
        const fresh = await (download ?? battleWorkspace(args))
        await rememberBattle(fresh.workspace, owner?.id)
        if (await hasSyncableChanges(resource)) {
          const current = await localDocument<BattleWorkspace>(resource)
          if (current && localOwner()?.id === owner?.id) return workspaceScreen(current, owner!.id)
        }
        return fresh.screen
      }
      return screen
    })
    return result
  } catch (error) {
    args.signal?.throwIfAborted()
    const current = await localDocument<BattleWorkspace | null>(resource)
    args.signal?.throwIfAborted()
    if (current && owner && localOwner()?.id === owner.id) return workspaceScreen(current, owner.id)
    throw error
  }
}

export async function submit(args: Parameters<typeof server.submit>[0]): ReturnType<typeof server.submit> {
  const engine = localEngine()
  const owner = localOwner()
  const resource = `battle:${args.data.token}`
  if (!engine || !owner || !hasLocalConstruction()) {
    // Commands this battle saved on the device go first, or this one overtakes them.
    if (engine && navigator.onLine && (await hasSyncableChanges(resource))) await attemptLocalSync()
    return server.submit(args)
  }
  if (navigator.onLine && (await hasSyncableChanges(resource))) await attemptLocalSync()
  // A service that never answers is treated like no connection, so the command is saved and synced later. If
  // it had landed after all, its expected sequence turns the replay into a conflict to review, never a second copy.
  const answer =
    navigator.onLine && !(await hasSyncableChanges(resource))
      ? await server.submit({ ...args, data: { ...args.data, workspace: true } }).catch((error: unknown) => {
          if (isFetchNetworkFailure(error)) return null
          throw error
        })
      : null
  if (answer) {
    if (answer.screen?.kind !== 'battle') return answer
    const fresh = answer.workspace ?? (await battleWorkspace({ data: { token: args.data.token } })).workspace
    await rememberBattle(fresh, owner.id)
    // A newer acknowledged copy saved meanwhile came with its own screen, which the command queue keeps over this one.
    const current = (await hasSyncableChanges(resource)) && (await localDocument<BattleWorkspace>(resource))
    return { result: answer.result, screen: current ? workspaceScreen(current, owner.id) : answer.screen }
  }
  const workspace = await localDocument<BattleWorkspace>(resource)
  if (!workspace) throw new OfflineRefusal('Open this battle online once before making offline changes.')
  if (
    await engine.storage
      .read()
      .then((state) => state.operations.some((operation) => operation.resource === resource && operation.status !== 'pending'))
  )
    throw new OfflineRefusal('Review this battle’s sync conflict before continuing.')
  const state = localBattleState(workspace.players, workspace.log)
  if (state.seq < args.data.expectedSeq) throw new OfflineRefusal('Reconnect to download the latest battle history before continuing.')
  if (args.data.expectedSeq !== state.seq)
    return { result: { outcome: 'stale', seq: state.seq }, screen: workspaceScreen(workspace, owner.id) }
  if (workspace.log.length >= 10_000) throw new Error('This battle has reached its saved history limit.')
  const { rules, revision } = localConstruction()!
  let command = submitSchema.parse(args.data).command
  let capturedRoster: LocalRoster | undefined
  if (command.kind === 'attach-saved-roster' || (command.kind === 'attach-roster' && command.roster.built)) {
    const id = command.kind === 'attach-saved-roster' ? command.rosterId : command.roster.id
    capturedRoster = id ? await localDocument<LocalRoster>(`roster:${id}`) : undefined
    if (!capturedRoster) throw new OfflineRefusal('Save this roster on the device before attaching it offline.')
    const selected = localConstruction(capturedRoster.catalogueId)
    if (!selected) throw new OfflineRefusal('Download this army’s rules before attaching it offline.')
    const { catalogue } = selected
    const priced = calculateRosterPrice(savedRosterPriceInput(capturedRoster), catalogue, selected.rules)
    const problem = priced && rosterUseError(priced, capturedRoster)
    if (!priced || problem) throw new Error(problem || 'Army data is unavailable.')
    const roster = rosterSnapshot(
      {
        ...capturedRoster,
        reminders: fieldingReminders(catalogue, selected.rules, capturedRoster, priced.units, await savedAbilityReminders()),
      },
      priced,
      unitBattleDetailsIn(
        catalogue,
        capturedRoster.catalogueId,
        capturedRoster.picks.map((pick) => pick.entryId),
      ),
    )
    command =
      command.kind === 'attach-saved-roster'
        ? { kind: 'attach-roster', roster, prep: null, painted: true, ...(command.playerId ? { playerId: command.playerId } : {}) }
        : { ...command, roster }
  }
  const recordedAt = Date.now()
  const appended = appendOnDevice(workspace, owner.id, command, rules, recordedAt, (limit) =>
    Math.floor((crypto.getRandomValues(new Uint32Array(1))[0]! / 0x1_0000_0000) * limit),
  )
  if (appended.refused)
    return {
      result: { outcome: 'refused', reason: appended.refused.message, code: appended.refused.code },
      screen: workspaceScreen(workspace, owner.id),
    }
  command = appended.command
  const { log } = appended
  const input = {
    token: args.data.token,
    expectedSeq: state.seq,
    command,
    recordedAt,
    catalogueRevision: revision,
    ...(capturedRoster ? { capturedRoster: { ...saveRosterSchema.parse(capturedRoster), id: capturedRoster.id } } : {}),
  }
  const operationId = crypto.randomUUID()
  log[log.length - 1]!.operationId = operationId
  const next = { ...workspace, log }
  await queueLocal('battleCommand', input, resource, {
    data: next,
    dependencies: capturedRoster ? [`roster:${capturedRoster.id}`] : undefined,
    id: operationId,
    owner: owner.id,
  })
  return { result: { outcome: 'appended', seq: state.seq + 1 }, screen: workspaceScreen(next, owner.id) }
}

/** Checks `submitted` against `workspace` and appends it the way the service records it, or names the rules data refusing it. */
function appendOnDevice(
  workspace: BattleWorkspace,
  viewerId: string,
  submitted: unknown,
  rules: NonNullable<ReturnType<typeof localConstruction>>['rules'],
  recordedAt: number,
  randomIndex: (limit: number) => number,
) {
  const state = localBattleState(workspace.players, workspace.log)
  let command = commandSchema.parse(submitted)
  hydrateAuthoritativeAwards(state, rules)
  if (command.kind === 'set-prep')
    command = withAuthoritativeAwards(command, rules, state.status === 'playing' ? commandArmy(state, viewerId, command) : undefined)
  if (command.kind === 'attach-roster' && command.prep)
    command = {
      ...command,
      prep: withAuthoritativeAwards(command.prep, rules, state.status === 'playing' ? commandArmy(state, viewerId, command) : undefined),
    }
  command = resolveLocalDraw(workspace.players, workspace.log, viewerId, command, randomIndex)
  const refused =
    command.kind === 'begin-battle'
      ? setupReferenceError(state, rules)
      : command.kind === 'set-prep' && state.status === 'playing'
        ? repairPrepReferenceError(state, viewerId, command, rules)
        : command.kind === 'score' || command.kind === 'score-secondary' || command.kind === 'score-settlement'
          ? scoringCapError(state, viewerId, command, rules)
          : null
  if (refused) return { refused }
  return { command, log: appendLocalCommand(workspace.players, workspace.log, viewerId, command, recordedAt) }
}

/** The saved history a connected command can be shown from before the service answers, when it matches the screen at `seq`. */
export async function savedBattleAt(token: string, seq: number) {
  const owner = localOwner()
  if (!navigator.onLine || !localEngine() || !owner || !hasLocalConstruction()) return null
  const workspace = await localDocument<BattleWorkspace | null>(`battle:${token}`)
  return workspace && localBattleState(workspace.players, workspace.log).seq === seq ? { workspace, viewerId: owner.id } : null
}

/**
 * The battle after `command`, worked out on the device so it shows before the service answers. Only the service draws
 * cards and prices lists, and a command the device would refuse is left for the service to explain, so those give null.
 */
export function predictedBattle({ workspace, viewerId }: { workspace: BattleWorkspace; viewerId: string }, command: Command) {
  const rules = builtLocalConstruction()?.rules
  if (!rules || command.kind === 'attach-roster') return null
  try {
    const appended = appendOnDevice(workspace, viewerId, command, rules, Date.now(), () => {
      throw new Error('Only the service draws cards.')
    })
    if (appended.refused) return null
    const next = { ...workspace, log: appended.log }
    return { workspace: next, viewerId, screen: workspaceScreen(next, viewerId) }
  } catch {
    return null
  }
}

/** A clean saved history can trail commands sent straight to the service, so connected reads use it only for unsynced work. */
async function unsyncedWorkspace(token: string) {
  const resource = `battle:${token}`
  const workspace = await localDocument<BattleWorkspace>(resource)
  return workspace && localOwner() && (!navigator.onLine || (await hasSyncableChanges(resource))) ? workspace : null
}

export async function battleReport(args: Parameters<typeof server.battleReport>[0]): ReturnType<typeof server.battleReport> {
  const workspace = await unsyncedWorkspace(args.data.token)
  return workspace
    ? foldReport(
        workspace.players,
        workspace.log,
        workspace.players.map((player) => player.id),
        localOwner()!.id,
        workspace.players.map((player) => player.side),
        localConstruction()?.rules,
      )
    : cachedRead(reportKey(args.data.token), () => server.battleReport(args))
}
export async function replayBattleAt(args: Parameters<typeof server.replayBattleAt>[0]): ReturnType<typeof server.replayBattleAt> {
  const workspace = await unsyncedWorkspace(args.data.token)
  if (!workspace) return server.replayBattleAt(args)
  const prefix = { ...workspace, log: battleLogThroughSeq(workspace.log, args.data.seq) }
  const screen = workspaceScreen(prefix, localOwner()!.id)
  return {
    kind: 'replay',
    view: screen.view,
    clock: { ...screen.clock, running: null },
    missions: screen.missions,
    report: foldReport(
      prefix.players,
      prefix.log,
      prefix.players.map((player) => player.id),
      localOwner()!.id,
      prefix.players.map((player) => player.side),
      localConstruction()?.rules,
    ),
  }
}

export async function replayBattleBatch(args: Parameters<typeof server.replayBattleBatch>[0]): ReturnType<typeof server.replayBattleBatch> {
  const workspace = await unsyncedWorkspace(args.data.token)
  if (!workspace) return cachedRead(['replay-batch', args.data.token, args.data.seqs], () => server.replayBattleBatch(args))
  if (
    !args.data.seqs.length ||
    args.data.seqs.length > REPLAY_BATCH_SIZE ||
    args.data.seqs.some((seq) => !workspace.log.some((entry) => entry.seq === seq))
  )
    throw new Error('No such battle event.')
  const frames = await Promise.all(args.data.seqs.map((seq) => replayBattleAt({ data: { token: args.data.token, seq } })))
  if (frames.some((frame) => frame.kind === 'unavailable')) return { kind: 'unavailable' }
  return { kind: 'replay-batch', ...compactReplayFrames(frames as Extract<(typeof frames)[number], { kind: 'replay' }>[]) }
}

export async function createBattle(args: Parameters<typeof server.createBattle>[0]): ReturnType<typeof server.createBattle> {
  const owner = localOwner()
  // A group game needs the server to check its players are members, so it is never started on the device alone.
  if (!localEngine() || !owner || !localConstruction() || args.data.groupToken) return server.createBattle(args)
  const input = createBattleSchema.parse(args.data)
  const guestNames = input.guestNames ?? []
  if (!input.casual && !guestNames.length) {
    const matches = await sealedEventBattleOptions({ data: input })
    if (matches.length) throw new Error('Start this matchup from its saved tournament, or choose a casual battle.')
  }
  const opponents = await cachedRead(opponentsKey(), () => server.opponents())
  const opponentIds = input.opponentIds ?? (input.opponentId ? [input.opponentId] : [])
  const allyIds = input.allyId ? [input.allyId] : []
  const invited = [...allyIds, ...opponentIds]
  if (
    (!opponentIds.length && !guestNames.length) ||
    invited.includes(owner.id) ||
    new Set(invited).size !== invited.length ||
    invited.some((id) => !opponents.some((player) => player.id === id))
  )
    throw new Error('Choose saved friends or practice opponents for this battle.')
  const identifiers = { battleId: crypto.randomUUID(), battleToken: crypto.randomUUID() }
  const now = Date.now()
  const me = localClient()!.getQueryData<{ id: string; name: string; image?: string | null }>(meKey())!
  const players = [
    { ...me, side: 0, automated: false },
    ...invited.map((id) => ({ ...opponents.find((player) => player.id === id)!, side: allyIds.includes(id) ? 0 : 1 })),
    ...guestNames.map((name, at) => ({ id: guestSeatId(identifiers.battleId, at), name, image: null, side: 1, automated: true })),
  ]
  const command = commandSchema.parse({
    kind: 'configure-battle',
    limit: input.limit ?? null,
    missionPackId: input.manual ? null : input.missionPackId,
    terrainLayoutId: null,
    twistId: null,
    teamBattle: players.length >= 3,
    playerCount: players.length,
    clockLimitMinutes: null,
    ...(input.manual ? { manual: true } : {}),
  })
  const workspace: BattleWorkspace = {
    battle: { id: identifiers.battleId, token: identifiers.battleToken, createdAt: now },
    players,
    log: [{ seq: 1, command, at: now, by: owner.id }],
    serverSeq: 0,
    serverNow: now,
  }
  await queueLocal('createBattle', { input, identifiers }, `battle:${identifiers.battleToken}`, { data: workspace, owner: owner.id })
  return { battleId: identifiers.battleId, token: identifiers.battleToken, practice: players.some(isPracticeSeat) }
}

const projectedBattles = new Map<string, string>()
export function projectBattles(state: LocalState) {
  const client = localClient()
  if (!client || localOwner()?.id !== state.owner) return
  for (const key of projectedBattles.keys())
    if (!key.startsWith(`${state.owner}:`) || !state.documents[key.slice(state.owner.length + 1)]) projectedBattles.delete(key)
  for (const [resource, document] of Object.entries(state.documents)) {
    if (!resource.startsWith('battle:')) continue
    if (navigator.onLine && !hasSyncableWork(state, resource)) continue
    if (!constructionData()) return
    if (!document.data) {
      client.setQueryData(battleKey(resource.slice(7)), { kind: 'unavailable' })
      continue
    }
    const workspace = document.data as BattleWorkspace
    const visible = client.getQueryData<Awaited<ReturnType<typeof server.openBattle>>>(battleKey(workspace.battle.token))
    if (visible?.kind === 'battle' && visible.view.seq > (workspace.log.at(-1)?.seq ?? 0)) continue
    const key = `${state.owner}:${resource}`
    const stamp = JSON.stringify(document.data)
    if (projectedBattles.get(key) === stamp && client.getQueryData(battleKey(workspace.battle.token))) continue
    projectedBattles.set(key, stamp)
    client.setQueryData(battleKey(workspace.battle.token), workspaceScreen(workspace, state.owner))
  }
  const feed = client.getQueryData<{ pages: Awaited<ReturnType<typeof server.myBattles>>[]; pageParams: unknown[] }>(battlesKey())
  if (feed)
    client.setQueryData(battlesKey(), { ...feed, pages: feed.pages.map((page, index) => overlayBattlePage(page, state, index === 0)) })
}

export async function createSealedEventBattle(
  args: Parameters<typeof server.createSealedEventBattle>[0],
): ReturnType<typeof server.createSealedEventBattle> {
  const owner = localOwner()
  if (!owner || !localEngine() || !localConstruction()) return server.createSealedEventBattle(args)
  const { openSealedEvent, openSealedEventRoster } = await import('./actionFunctions')
  const sealedEvent = await openSealedEvent({ data: { token: args.data.token, eventToken: args.data.eventToken } })
  if (!sealedEvent) throw new OfflineRefusal('Open and save this event online before starting an offline battle.')
  const entries = sealedEvent.entries.filter((entry) => entry.status === 'accepted' && entry.submitted)
  const rosters = await Promise.all(
    entries.map(async (entry) => ({
      ...entry,
      snapshot: await openSealedEventRoster({
        data: { token: sealedEvent.token, eventToken: sealedEvent.eventToken, userId: entry.userId },
      }),
    })),
  )
  const identifiers = { battleId: crypto.randomUUID(), battleToken: crypto.randomUUID() }
  const prepared = buildSealedEventBattle(
    {
      ...sealedEvent,
      paired: Boolean(openPairing(sealedEvent.pairings, owner.id, args.data.opponentId)),
      entries: rosters.map((entry) => ({
        ...entry,
        snapshot: entry.snapshot ? JSON.stringify(entry.snapshot) : null,
        teamDisposition: entry.team?.disposition ?? null,
        teamWarlord: entry.team?.warlord ?? null,
      })),
    },
    owner.id,
    args.data.opponentId,
    args.data.missionPackId ?? null,
    identifiers.battleToken,
    args.data.allyId,
    args.data.secondOpponentId,
  )
  const ids = [owner.id, ...prepared.allyIds, ...prepared.opponentIds]
  const players = ids.map((id) => {
    const entry = entries.find((candidate) => candidate.userId === id)!
    return { id, name: entry.name, image: entry.image, automated: false, side: prepared.opponentIds.includes(id) ? 1 : 0 }
  })
  const now = Date.now()
  const workspace: BattleWorkspace = {
    battle: { id: identifiers.battleId, token: identifiers.battleToken, createdAt: now },
    players,
    serverSeq: 0,
    serverNow: now,
    log: prepared.initialCommands.map((command, index) => ({ seq: index + 1, command, at: now, by: owner.id })),
  }
  await queueLocal('createLeagueBattle', { input: args.data, identifiers }, `battle:${identifiers.battleToken}`, {
    data: workspace,
    dependencies: [`league:${sealedEvent.token}`],
    owner: owner.id,
  })
  return { token: identifiers.battleToken }
}

export async function myBattles(args: Parameters<typeof server.myBattles>[0]): ReturnType<typeof server.myBattles> {
  const page = await cachedPage(battlesKey(), args.data.before, () => server.myBattles(args))
  const state = await localEngine()?.storage.read()
  return overlayBattlePage(page, state, args.data.before == null)
}
function overlayBattlePage(page: Awaited<ReturnType<typeof server.myBattles>>, state?: LocalState, first = true) {
  if (!state) return page
  const battles = new Map(page.battles.map((battle) => [battle.token, battle]))
  for (const [resource, document] of Object.entries(state.documents)) {
    if (!resource.startsWith('battle:') || !state.operations.some((operation) => operation.resource === resource)) continue
    const workspace = document.data as BattleWorkspace | null
    if (!workspace) {
      battles.delete(resource.slice(7))
      continue
    }
    if (!first && !battles.has(workspace.battle.token)) continue
    battles.set(
      workspace.battle.token,
      battleSummary(workspace, localBattleState(workspace.players, workspace.log), state.owner, localConstruction()?.rules, new Map()),
    )
  }
  return { ...page, battles: [...battles.values()].sort((left, right) => right.lastActivity - left.lastActivity) }
}
