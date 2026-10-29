import { posthog } from 'posthog-js'
import { jsonByteLength } from '../../core/json'
import { MAX_LOCAL_OPERATIONS, MAX_LOCAL_STATE_BYTES, type LocalOperation, type LocalState } from '../../contracts/localState'
import { OfflineRefusal } from './offlineRefusal'

export interface LocalStateStorage {
  read(): Promise<LocalState>
  change(update: (state: LocalState) => LocalState): Promise<LocalState>
}

export type SyncAnswer =
  | { outcome: 'applied'; data: unknown; serverVersion?: number }
  | { outcome: 'conflict' | 'refused'; message: string }

export type LocalDocumentUpdate = (current: unknown) => unknown

export function discardLocalResource(state: LocalState, resource: string): LocalState {
  if (resource === '*') return { ...state, documents: {}, operations: [] }
  const documents = { ...state.documents }
  delete documents[resource]
  const operations = state.operations
    .filter((operation) => operation.resource !== resource)
    .map((operation) =>
      operation.dependencies?.includes(resource)
        ? {
            ...operation,
            status: 'refused' as const,
            message: 'A saved item needed by this action was discarded. Export or discard this action before continuing.',
          }
        : operation,
    )
  return { ...state, documents, operations }
}

/** Saved work for a resource that can still sync; a conflict awaiting review holds back everything queued after it. */
export function hasSyncableWork(state: LocalState, resource: string) {
  return state.operations.find((operation) => operation.resource === resource)?.status === 'pending'
}

const holderLock = (holder: string) => `praetorium-sync:${holder}`

/** A window holds its lock until it closes or stops, so a lease whose lock nobody holds was abandoned mid-sync. */
async function leaseAbandoned(holder: string) {
  if (!globalThis.navigator?.locks) return false
  const { held = [] } = await navigator.locks.query()
  return !held.some((lock) => lock.name === holderLock(holder))
}

export class SyncEngine {
  private running: Promise<void> | undefined
  private stopped = false
  lastError: unknown = null
  private readonly holder = crypto.randomUUID()
  private releaseHolder: () => void = () => {}
  private readonly holding: Promise<void>

  constructor(
    readonly storage: LocalStateStorage,
    private readonly execute: (operation: LocalOperation, state: LocalState) => Promise<SyncAnswer>,
    private readonly changed: (state: LocalState) => void,
  ) {
    this.holding = new Promise((granted) => {
      if (!globalThis.navigator?.locks) return granted()
      void navigator.locks.request(holderLock(this.holder), () => {
        granted()
        if (this.stopped) return
        return new Promise<void>((release) => {
          this.releaseHolder = release
        })
      })
    })
  }

  async enqueue(
    operation: LocalOperation,
    data?: unknown,
    update?: LocalDocumentUpdate,
    relatedUpdates: Record<string, LocalDocumentUpdate> = {},
  ) {
    const state = await this.storage.change((current) => {
      if (current.operations.some((candidate) => candidate.id === operation.id)) throw new Error('This change is already saved.')
      if (operation.kind === 'battleCommand') {
        const expected = (operation.input as { expectedSeq?: number }).expectedSeq
        const log = (current.documents[operation.resource]?.data as { log?: { seq: number }[] } | undefined)?.log
        if (expected !== undefined && expected !== (log?.at(-1)?.seq ?? 0))
          throw new Error('Another window advanced this battle. Reload before continuing.')
      }
      const last = current.operations.at(-1)
      const coalesce =
        last?.resource === operation.resource &&
        last.kind === 'saveRoster' &&
        operation.kind === 'saveRoster' &&
        !last.attempted &&
        last.status === 'pending'
      const operations = coalesce ? current.operations.slice(0, -1) : current.operations
      if (operations.length >= MAX_LOCAL_OPERATIONS)
        throw new OfflineRefusal('Too many unsynced changes. Connect before making more edits.')
      const projected = update ? update(current.documents[operation.resource]?.data) : data
      const documents = { ...current.documents }
      if (projected !== undefined)
        documents[operation.resource] = { data: projected, serverVersion: documents[operation.resource]?.serverVersion ?? null }
      for (const [resource, apply] of Object.entries(relatedUpdates)) {
        const updated = apply(documents[resource]?.data)
        if (updated !== undefined) documents[resource] = { data: updated, serverVersion: documents[resource]?.serverVersion ?? null }
      }
      const next = { ...current, operations: [...operations, operation], documents }
      if (jsonByteLength(next) > MAX_LOCAL_STATE_BYTES) throw new OfflineRefusal('This device has no room for more saved changes.')
      return next
    })
    this.changed(state)
    return state
  }

  sync() {
    if (!this.running && !this.stopped)
      this.running = this.drain().finally(() => {
        this.running = undefined
      })
    return this.running ?? Promise.resolve()
  }

  stop() {
    this.stopped = true
    this.releaseHolder()
  }

  private async drain() {
    this.lastError = null
    const attempted = new Set<string>()
    while (!this.stopped) {
      const state = await this.storage.read()
      const first = new Map<string, LocalOperation>()
      for (const operation of state.operations) if (!first.has(operation.resource)) first.set(operation.resource, operation)
      const operation = [...first.values()].find(
        (candidate) =>
          candidate.status === 'pending' &&
          !attempted.has(candidate.id) &&
          !candidate.dependencies?.some((resource) => state.operations.some((pending) => pending.resource === resource)),
      )
      if (!operation) return
      attempted.add(operation.id)
      await this.holding
      const lease = state.syncLease
      const abandoned = lease && lease.holder !== this.holder && (await leaseAbandoned(lease.holder)) ? lease : undefined
      let claimed = false
      const marked = await this.storage.change((current) => {
        const held =
          current.syncLease &&
          current.syncLease.holder !== this.holder &&
          current.syncLease.expiresAt > Date.now() &&
          !(current.syncLease.holder === abandoned?.holder && current.syncLease.expiresAt === abandoned.expiresAt)
        if (current.epoch !== state.epoch || current.owner !== state.owner || held) return current
        if (!current.operations.some((candidate) => candidate.id === operation.id)) return current
        claimed = true
        return {
          ...current,
          syncLease: { holder: this.holder, expiresAt: Date.now() + 60_000 },
          operations: current.operations.map((candidate) =>
            candidate.id === operation.id ? { ...candidate, attempted: true } : candidate,
          ),
        }
      })
      if (!claimed) return
      if (
        !marked.operations.some((candidate) => candidate.id === operation.id) ||
        marked.epoch !== state.epoch ||
        marked.owner !== state.owner
      )
        continue
      let answer: SyncAnswer
      try {
        answer = await this.execute(operation, marked)
      } catch (error) {
        this.lastError = error
        await this.storage.change((current) => (current.syncLease?.holder === this.holder ? { ...current, syncLease: undefined } : current))
        return
      }
      if (this.stopped) return
      const next = await this.storage.change((current) => {
        if (current.owner !== state.owner || current.epoch !== state.epoch) return current
        if (current.syncLease?.holder === this.holder) current = { ...current, syncLease: undefined }
        const exists = current.operations.some((candidate) => candidate.id === operation.id)
        if (!exists) return current
        if (answer.outcome !== 'applied') {
          posthog.capture('offline_sync_needs_review', { kind: operation.kind, outcome: answer.outcome })
          return {
            ...current,
            operations: current.operations.map((candidate) =>
              candidate.id === operation.id ? { ...candidate, status: answer.outcome, message: answer.message } : candidate,
            ),
          }
        }
        const operations = current.operations.filter((candidate) => candidate.id !== operation.id)
        const later = operations.some((candidate) => candidate.resource === operation.resource)
        return {
          ...current,
          operations,
          documents: {
            ...current.documents,
            [operation.resource]: {
              data: later ? current.documents[operation.resource]?.data : answer.data,
              serverVersion: answer.serverVersion ?? current.documents[operation.resource]?.serverVersion ?? null,
            },
          },
        }
      })
      this.changed(next)
    }
  }
}
