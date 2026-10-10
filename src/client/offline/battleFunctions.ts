import { leagueBattleOptions } from './actionFunctions'
import { compactReplayFrames } from '../../core/replayFrames'
import { REPLAY_BATCH_SIZE } from '../../contracts/battles'
import { buildLeagueBattle } from '../../shared/leagueBattle'
import { battleSummary } from '../../shared/battleSummary'
import type * as Server from '../../server/functions'
import * as server from '../../server/functions'
import { battleWorkspace } from '../../server/functions/offline'
import type { BattleWorkspace } from '../../contracts/battleWorkspace'
import type { LocalState } from '../../contracts/localState'
import { commandSchema } from '../../core/commands'
import { createBattleSchema, saveRosterSchema, submitSchema } from '../../contracts/schemas'
import { appendLocalCommand, resolveLocalDraw, localBattleState } from '../../core/offlineBattle'
import { battleView } from '../../core/battleView'
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
import {
  localClient,
  localDocument,
  localEngine,
  localOwner,
  hasLocalChanges,
  rememberBattle,
  queueLocal,
  type LocalRoster,
} from './localRuntime'
import { localConstruction } from './construction'
import { cachedRead, cachedPage } from './reads'

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
  if (workspace && owner && (!navigator.onLine || (await hasLocalChanges(resource)))) return workspaceScreen(workspace, owner.id)
  const result = await cachedRead(['battle', args.data.token], async () => {
    const screen = await server.openBattle(args)
    if (screen?.kind === 'battle' && localEngine()) {
      const fresh = await battleWorkspace(args)
      await rememberBattle(fresh.workspace, owner?.id)
      if (await hasLocalChanges(resource)) {
        const current = await localDocument<BattleWorkspace>(resource)
        if (current && localOwner()?.id === owner?.id) return workspaceScreen(current, owner!.id)
      }
      return fresh.screen
    }
    return screen
  })
  return result
}

export async function submit(
  args: Parameters<typeof server.submit>[0],
  options?: { background?: boolean },
): ReturnType<typeof server.submit> {
  const engine = localEngine()
  const owner = localOwner()
  if (!engine || !owner || !localConstruction()) return server.submit(args)
  const resource = `battle:${args.data.token}`
  if (options?.background && navigator.onLine && !(await hasLocalChanges(resource))) return server.submit(args)
  let workspace = await localDocument<BattleWorkspace>(resource)
  if (navigator.onLine && (!workspace || (workspace.log.at(-1)?.seq ?? 0) < args.data.expectedSeq) && !(await hasLocalChanges(resource))) {
    const fresh = await battleWorkspace({ data: { token: args.data.token } })
    await rememberBattle(fresh.workspace, owner.id)
    workspace = await localDocument<BattleWorkspace>(resource)
  }
  if (!workspace) throw new Error('Open this battle online once before making offline changes.')
  if (
    await engine.storage
      .read()
      .then((state) => state.operations.some((operation) => operation.resource === resource && operation.status !== 'pending'))
  )
    throw new Error('Review this battle’s sync conflict before continuing.')
  const state = localBattleState(workspace.players, workspace.log)
  if (state.seq < args.data.expectedSeq) throw new Error('Reconnect to download the latest battle history before continuing.')
  if (args.data.expectedSeq !== state.seq)
    return { result: { outcome: 'stale', seq: state.seq }, screen: workspaceScreen(workspace, owner.id) }
  if (workspace.log.length >= 10_000) throw new Error('This battle has reached its saved history limit.')
  const { rules, revision } = localConstruction()!
  let command = submitSchema.parse(args.data).command
  let capturedRoster: LocalRoster | undefined
  if (command.kind === 'attach-saved-roster' || (command.kind === 'attach-roster' && command.roster.built)) {
    const id = command.kind === 'attach-saved-roster' ? command.rosterId : command.roster.id
    capturedRoster = id ? await localDocument<LocalRoster>(`roster:${id}`) : undefined
    if (!capturedRoster) throw new Error('Save this roster on the device before attaching it offline.')
    const selected = localConstruction(capturedRoster.catalogueId)
    if (!selected) throw new Error('Download this army’s rules before attaching it offline.')
    const { catalogue } = selected
    const priced = calculateRosterPrice(savedRosterPriceInput(capturedRoster), catalogue, selected.rules)
    const problem = priced && rosterUseError(priced, capturedRoster.limit, capturedRoster.waivedRules)
    if (!priced || problem) throw new Error(problem || 'Army data is unavailable.')
    const roster = rosterSnapshot(
      capturedRoster,
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
  command = commandSchema.parse(command)
  hydrateAuthoritativeAwards(state, rules)
  if (command.kind === 'set-prep') command = withAuthoritativeAwards(command, rules)
  if (command.kind === 'attach-roster' && command.prep) command = { ...command, prep: withAuthoritativeAwards(command.prep, rules) }
  command = resolveLocalDraw(workspace.players, workspace.log, owner.id, command, (limit) =>
    Math.floor((crypto.getRandomValues(new Uint32Array(1))[0]! / 0x1_0000_0000) * limit),
  )
  const referenceError =
    command.kind === 'begin-battle'
      ? setupReferenceError(state, rules)
      : command.kind === 'set-prep' && state.status === 'playing'
        ? repairPrepReferenceError(state, owner.id, command, rules)
        : command.kind === 'score' || command.kind === 'score-secondary' || command.kind === 'score-settlement'
          ? scoringCapError(state, owner.id, command, rules)
          : null
  if (referenceError)
    return {
      result: { outcome: 'refused', reason: referenceError.message, code: referenceError.code },
      screen: workspaceScreen(workspace, owner.id),
    }
  const recordedAt = Date.now()
  const log = appendLocalCommand(workspace.players, workspace.log, owner.id, command, recordedAt)
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
  await queueLocal(
    'battleCommand',
    input,
    resource,
    next,
    capturedRoster ? [`roster:${capturedRoster.id}`] : undefined,
    operationId,
    owner.id,
  )
  return { result: { outcome: 'appended', seq: state.seq + 1 }, screen: workspaceScreen(next, owner.id) }
}

export async function battleReport(args: Parameters<typeof server.battleReport>[0]): ReturnType<typeof server.battleReport> {
  const workspace = await localDocument<BattleWorkspace>(`battle:${args.data.token}`)
  return workspace && localOwner() && (!navigator.onLine || (await hasLocalChanges(`battle:${args.data.token}`)))
    ? foldReport(
        workspace.players,
        workspace.log,
        workspace.players.map((player) => player.id),
        localOwner()!.id,
        workspace.players.map((player) => player.side),
        localConstruction()?.rules,
      )
    : cachedRead(['report', args.data.token], () => server.battleReport(args))
}
export async function replayBattleAt(args: Parameters<typeof server.replayBattleAt>[0]): ReturnType<typeof server.replayBattleAt> {
  const workspace = await localDocument<BattleWorkspace>(`battle:${args.data.token}`)
  if (!workspace || !localOwner()) return server.replayBattleAt(args)
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
  const workspace = await localDocument<BattleWorkspace>(`battle:${args.data.token}`)
  if (!workspace || !localOwner())
    return cachedRead(['replay-batch', args.data.token, args.data.seqs], () => server.replayBattleBatch(args))
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
  if (!localEngine() || !owner || !localConstruction()) return server.createBattle(args)
  const input = createBattleSchema.parse(args.data)
  if (!input.casual) {
    const matches = await leagueBattleOptions({ data: input })
    if (matches.length) throw new Error('Start this matchup from its saved league, or choose a casual battle.')
  }
  const opponents = await cachedRead(['opponents'], () => server.opponents())
  const opponentIds = input.opponentIds ?? (input.opponentId ? [input.opponentId] : [])
  const allyIds = input.allyId ? [input.allyId] : []
  const invited = [...allyIds, ...opponentIds]
  if (
    !opponentIds.length ||
    invited.includes(owner.id) ||
    new Set(invited).size !== invited.length ||
    invited.some((id) => !opponents.some((player) => player.id === id))
  )
    throw new Error('Choose saved friends or practice opponents for this battle.')
  const identifiers = { battleId: crypto.randomUUID(), battleToken: crypto.randomUUID() }
  const now = Date.now()
  const me = localClient()!.getQueryData<{ id: string; name: string; image?: string | null }>(['me'])!
  const players = [
    { ...me, side: 0, automated: false },
    ...invited.map((id) => ({ ...opponents.find((player) => player.id === id)!, side: allyIds.includes(id) ? 0 : 1 })),
  ]
  const command = commandSchema.parse({
    kind: 'configure-battle',
    limit: input.limit ?? null,
    missionPackId: input.missionPackId,
    terrainLayoutId: null,
    twistId: null,
    teamBattle: invited.length >= 2,
    playerCount: invited.length + 1,
    clockLimitMinutes: null,
  })
  const workspace: BattleWorkspace = {
    battle: { id: identifiers.battleId, token: identifiers.battleToken, createdAt: now },
    players,
    log: [{ seq: 1, command, at: now, by: owner.id }],
    serverSeq: 0,
    serverNow: now,
  }
  await queueLocal('createBattle', { input, identifiers }, `battle:${identifiers.battleToken}`, workspace, undefined, undefined, owner.id)
  return { token: identifiers.battleToken, practice: players.some((player) => player.automated) }
}

const projectedBattles = new Map<string, string>()
export function projectBattles(state: LocalState) {
  const client = localClient()
  if (!client || localOwner()?.id !== state.owner || !localConstruction()) return
  for (const key of projectedBattles.keys())
    if (!key.startsWith(`${state.owner}:`) || !state.documents[key.slice(state.owner.length + 1)]) projectedBattles.delete(key)
  for (const [resource, document] of Object.entries(state.documents)) {
    if (!resource.startsWith('battle:')) continue
    if (!document.data) {
      client.setQueryData(['battle', resource.slice(7)], { kind: 'unavailable' })
      continue
    }
    const workspace = document.data as BattleWorkspace
    const visible = client.getQueryData<Awaited<ReturnType<typeof server.openBattle>>>(['battle', workspace.battle.token])
    if (visible?.kind === 'battle' && visible.view.seq > (workspace.log.at(-1)?.seq ?? 0)) continue
    const key = `${state.owner}:${resource}`
    const stamp = JSON.stringify(document.data)
    if (projectedBattles.get(key) === stamp && client.getQueryData(['battle', workspace.battle.token])) continue
    projectedBattles.set(key, stamp)
    client.setQueryData(['battle', workspace.battle.token], workspaceScreen(workspace, state.owner))
  }
  const feed = client.getQueryData<{ pages: Awaited<ReturnType<typeof server.myBattles>>[]; pageParams: unknown[] }>(['battles'])
  if (feed)
    client.setQueryData(['battles'], { ...feed, pages: feed.pages.map((page, index) => overlayBattlePage(page, state, index === 0)) })
}

export async function createLeagueBattle(
  args: Parameters<typeof server.createLeagueBattle>[0],
): ReturnType<typeof server.createLeagueBattle> {
  const owner = localOwner()
  if (!owner || !localEngine() || !localConstruction()) return server.createLeagueBattle(args)
  const { openLeague, openLeagueRoster } = await import('./actionFunctions')
  const league = await openLeague({ data: { token: args.data.token, eventToken: args.data.eventToken } })
  if (!league) throw new Error('Open and save this event online before starting an offline battle.')
  const entries = league.entries.filter((entry) => entry.status === 'accepted' && entry.submitted)
  const rosters = await Promise.all(
    entries.map(async (entry) => ({
      ...entry,
      snapshot: await openLeagueRoster({ data: { token: league.token, eventToken: league.eventToken, userId: entry.userId } }),
    })),
  )
  const identifiers = { battleId: crypto.randomUUID(), battleToken: crypto.randomUUID() }
  const prepared = buildLeagueBattle(
    { ...league, entries: rosters.map((entry) => ({ ...entry, snapshot: entry.snapshot ? JSON.stringify(entry.snapshot) : null })) },
    owner.id,
    league.token,
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
  await queueLocal(
    'createLeagueBattle',
    { input: args.data, identifiers },
    `battle:${identifiers.battleToken}`,
    workspace,
    [`league:${league.token}`],
    undefined,
    owner.id,
  )
  return { token: identifiers.battleToken }
}

export async function myBattles(args: Parameters<typeof server.myBattles>[0]): ReturnType<typeof server.myBattles> {
  const page = await cachedPage(['battles'], args.data.before, () => server.myBattles(args))
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
