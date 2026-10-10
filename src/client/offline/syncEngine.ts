import { MAX_LOCAL_OPERATIONS, MAX_LOCAL_STATE_BYTES, type LocalOperation, type LocalState } from '../../contracts/localState'

export interface LocalStateStorage {
  read(): Promise<LocalState>
  change(update: (state: LocalState) => LocalState): Promise<LocalState>
}

export type SyncAnswer =
  | { outcome: 'applied'; data: unknown; serverVersion?: number }
  | { outcome: 'conflict' | 'refused'; message: string }

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

export class SyncEngine {
  private running: Promise<void> | undefined
  private stopped = false
  lastError: unknown = null
  private readonly holder = crypto.randomUUID()

  constructor(
    readonly storage: LocalStateStorage,
    private readonly execute: (operation: LocalOperation, state: LocalState) => Promise<SyncAnswer>,
    private readonly changed: (state: LocalState) => void,
  ) {}

  async enqueue(operation: LocalOperation, data?: unknown) {
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
      if (operations.length >= MAX_LOCAL_OPERATIONS) throw new Error('Too many unsynced changes. Connect before making more edits.')
      const next = {
        ...current,
        operations: [...operations, operation],
        documents:
          data === undefined
            ? current.documents
            : {
                ...current.documents,
                [operation.resource]: { data, serverVersion: current.documents[operation.resource]?.serverVersion ?? null },
              },
      }
      if (new TextEncoder().encode(JSON.stringify(next)).byteLength > MAX_LOCAL_STATE_BYTES)
        throw new Error('This device has no room for more saved changes.')
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
      let claimed = false
      const marked = await this.storage.change((current) => {
        if (
          current.epoch !== state.epoch ||
          current.owner !== state.owner ||
          (current.syncLease && current.syncLease.holder !== this.holder && current.syncLease.expiresAt > Date.now())
        )
          return current
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
        if (answer.outcome !== 'applied')
          return {
            ...current,
            operations: current.operations.map((candidate) =>
              candidate.id === operation.id ? { ...candidate, status: answer.outcome, message: answer.message } : candidate,
            ),
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
