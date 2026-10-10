import type { QueryClient } from '@tanstack/react-query'
import type { LocalOperation, LocalState } from '../../contracts/localState'
import { offlineActionKind, offlineActionSchemas, type OfflineActionKind } from '../../contracts/offlineActions'
import type { BattleWorkspace } from '../../contracts/battleWorkspace'
import type * as server from '../../server/functions'
import { syncRoster, syncAction, syncBattleCommand } from '../../server/functions/offline'
import { SyncEngine, type SyncAnswer, type LocalDocumentUpdate } from './syncEngine'
import { nativeBridgeVersion, supportsNativeLocalState } from '../nativeBridge'
import { localStateStorage } from './localStorage'

export type LocalRoster = NonNullable<Awaited<ReturnType<typeof server.rosterAccess>>>['roster']
export type RosterInput = Parameters<typeof server.saveRoster>[0]['data']
export type DeferredInput = { input: unknown; identifiers: Record<string, string> }
let client: QueryClient | undefined
let runtime: { owner: string; engine: SyncEngine } | undefined
let projected: string | undefined
let changed: ((state: LocalState) => void) | undefined

export function configureLocalRuntime(queryClient: QueryClient, project: (state: LocalState) => void) {
  if (typeof window === 'undefined') return
  client = queryClient
  changed = (state) => {
    const stamp = `${state.owner}:${state.epoch}:${state.revision}`
    if (projected === stamp) return
    projected = stamp
    const previous = client?.getQueryData<LocalState>(['local-work'])
    const acknowledged =
      previous?.owner === state.owner &&
      previous.operations.some((operation) => !state.operations.some((current) => current.id === operation.id))
    client?.setQueryData(['local-work'], state)
    project(state)
    if (acknowledged)
      void client?.invalidateQueries({ predicate: (query) => query.queryKey[0] !== 'local-work' && query.queryKey[0] !== 'me' })
  }
}
export function localClient() {
  return client
}
export function localOwner() {
  return client?.getQueryData<{ id: string; impersonatedBy?: string | null } | null>(['me'])
}
export function localEngine() {
  if (nativeBridgeVersion() !== undefined && !supportsNativeLocalState()) return null
  const me = localOwner()
  if (!me || me.impersonatedBy) {
    stopLocalRuntime()
    return null
  }
  if (runtime?.owner !== me.id) {
    runtime?.engine.stop()
    runtime = {
      owner: me.id,
      engine: new SyncEngine(localStateStorage(me.id), execute, (state) => {
        if (localOwner()?.id === state.owner) changed?.(state)
      }),
    }
  }
  return runtime.engine
}
export function stopLocalRuntime() {
  runtime?.engine.stop()
  runtime = undefined
  projected = undefined
}

async function execute(operation: LocalOperation, state: LocalState): Promise<SyncAnswer> {
  if (!navigator.onLine) throw new Error('Disconnected')
  if (operation.kind === 'saveRoster' || operation.kind === 'deleteRoster') {
    const answer = await syncRoster({
      signal: AbortSignal.timeout(15_000),
      data: {
        owner: state.owner,
        roster: operation.input as RosterInput & { id: string },
        operationId: operation.id,
        expectedVersion: state.documents[operation.resource]?.serverVersion ?? null,
        deleted: operation.kind === 'deleteRoster',
      },
    })
    if (answer.outcome !== 'applied') return answer
    const saved = operation.input as LocalRoster
    const roster =
      operation.kind === 'deleteRoster'
        ? null
        : {
            ...saved,
            name: saved.name || (state.documents[operation.resource]?.data as LocalRoster | null)?.name || '',
            automaticName: !saved.name,
            updatedAt: answer.version,
          }
    return { outcome: 'applied', data: roster, serverVersion: answer.version }
  }
  if (operation.kind === 'battleCommand') {
    const answer = await syncBattleCommand({
      signal: AbortSignal.timeout(15_000),
      data: {
        ...(operation.input as Omit<Parameters<typeof syncBattleCommand>[0]['data'], 'owner' | 'operationId'>),
        owner: state.owner,
        operationId: operation.id,
      },
    })
    return answer.outcome === 'applied' ? { outcome: 'applied', data: answer.workspace, serverVersion: answer.version } : answer
  }
  if (!offlineActionKind.safeParse(operation.kind).success)
    return { outcome: 'refused', message: 'This saved action needs a compatible application version. Export it before discarding it.' }
  const saved = operation.input as DeferredInput
  if (!saved || !offlineActionSchemas[operation.kind as OfflineActionKind].safeParse(saved.input).success)
    return {
      outcome: 'refused',
      message: 'This saved action is incompatible with this application version. Export it before discarding it.',
    }
  const answer = await syncAction({
    signal: AbortSignal.timeout(15_000),
    data: {
      owner: state.owner,
      operationId: operation.id,
      kind: operation.kind as OfflineActionKind,
      input: saved.input,
      identifiers: saved.identifiers,
      createdAt: operation.createdAt,
    },
  })
  if (answer.outcome !== 'applied') return { outcome: 'refused', message: answer.message }
  if (operation.kind === 'createBattle' || operation.kind === 'createLeagueBattle') {
    if (!('workspace' in answer)) throw new Error('The saved battle acknowledgement is incomplete. Try syncing again.')
    return { outcome: 'applied', data: answer.workspace, serverVersion: answer.version }
  }
  if (operation.resource.startsWith('league:')) {
    const { openLeague } = await import('../../server/functions')
    const data = await openLeague({ signal: AbortSignal.timeout(15_000), data: { token: operation.resource.slice(7) } })
    return { outcome: 'applied', data }
  }
  return { outcome: 'applied', data: state.documents[operation.resource]?.data ?? null }
}

export async function restoreLocalWork() {
  const engine = localEngine()
  if (!engine) return
  const state = await engine.storage.read()
  if (localOwner()?.id === state.owner) changed?.(state)
}
export async function syncLocalWork() {
  const engine = localEngine()
  if (!engine || !navigator.onLine) return
  await engine.sync()
  if (engine.lastError) throw engine.lastError
}
export async function attemptLocalSync() {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      syncLocalWork().catch(() => {}),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, 15_000)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}
export async function localDocument<T>(resource: string): Promise<T | undefined> {
  const engine = localEngine()
  if (!engine) return undefined
  const state = await engine.storage.read()
  return localOwner()?.id === state.owner ? (state.documents[resource]?.data as T | undefined) : undefined
}
export async function rememberDocument(
  resource: string,
  data: unknown,
  serverVersion: number | null = null,
  owner = localOwner()?.id,
  expectedVersion?: number | null,
  expectedDataJson?: string,
) {
  const engine = localEngine()
  if (!engine) return
  const assertAccount = () => {
    if (localOwner()?.id !== owner || localEngine() !== engine) throw new Error('The account changed while saving this download.')
  }
  assertAccount()
  const saved = await engine.storage.change((state) => {
    assertAccount()
    if (state.operations.some((operation) => operation.resource === resource)) return state
    if (expectedDataJson !== undefined && JSON.stringify({ data: state.documents[resource]?.data }) !== expectedDataJson) return state
    if (resource.startsWith('battle:') || resource.startsWith('roster:')) {
      const currentVersion = state.documents[resource]?.serverVersion ?? null
      if (serverVersion !== null && (currentVersion ?? 0) > serverVersion) return state
      if (serverVersion === null && expectedVersion !== undefined && currentVersion !== expectedVersion) return state
    }
    return { ...state, documents: { ...state.documents, [resource]: { data, serverVersion } } }
  })
  return saved.documents[resource]
}
export async function queueLocal(
  kind: string,
  input: unknown,
  resource: string,
  data?: unknown,
  dependencies?: string[],
  id = crypto.randomUUID(),
  expectedOwner = localOwner()?.id,
  update?: LocalDocumentUpdate,
) {
  const engine = localEngine()
  if (!engine) throw new Error('Sign in before saving changes.')
  if (localOwner()?.id !== expectedOwner) throw new Error('The account changed before these edits could be saved.')
  const operation: LocalOperation = { id, kind, input, resource, dependencies, createdAt: Date.now(), status: 'pending' }
  await engine.enqueue(operation, data, update)
  if (navigator.onLine)
    void engine.sync().catch((error) => {
      engine.lastError = error
    })
  return operation
}
export async function hasLocalChanges(resource?: string) {
  const engine = localEngine()
  return engine ? (await engine.storage.read()).operations.some((operation) => !resource || operation.resource === resource) : false
}
export async function rememberBattle(workspace: BattleWorkspace, owner = localOwner()?.id) {
  await rememberDocument(`battle:${workspace.battle.token}`, workspace, workspace.serverSeq, owner)
}
