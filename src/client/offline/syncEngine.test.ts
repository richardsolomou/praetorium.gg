import { describe, expect, it } from 'vitest'
import { emptyLocalState, type LocalOperation, type LocalState } from '../../contracts/localState'
import { discardLocalResource, SyncEngine, type LocalStateStorage } from './syncEngine'

function memory(initial = emptyLocalState('player')): LocalStateStorage {
  let state = structuredClone(initial)
  let pending = Promise.resolve()
  return {
    read: async () => structuredClone(state),
    change: async (update) => {
      let result!: LocalState
      const work = pending.then(() => {
        state = update(structuredClone(state))
        result = structuredClone(state)
      })
      pending = work.catch(() => {})
      await work
      return result
    },
  }
}
const operation = (resource = 'roster:one'): LocalOperation => ({
  id: crypto.randomUUID(),
  resource,
  kind: resource.startsWith('battle:') ? 'battleCommand' : 'saveRoster',
  input: {},
  createdAt: 1,
  status: 'pending',
})

describe('durable sync', () => {
  it('retains work after a request fails and resumes after reopening', async () => {
    const storage = memory()
    const engine = new SyncEngine(
      storage,
      async () => {
        throw new Error('unreachable')
      },
      () => {},
    )
    const edit = operation()
    await engine.enqueue(edit, { name: 'Plane army' })
    await engine.sync()
    const reopened = new SyncEngine(
      storage,
      async () => ({ outcome: 'applied', data: { name: 'Plane army' }, serverVersion: 2 }),
      () => {},
    )
    await reopened.sync()
    expect((await storage.read()).operations).toEqual([])
  })

  it('does not replace an edit made while an earlier save is in flight', async () => {
    const storage = memory()
    let release!: () => void
    let started!: () => void
    const running = new Promise<void>((resolve) => {
      started = resolve
    })
    const waiting = new Promise<void>((resolve) => {
      release = resolve
    })
    let calls = 0
    const engine = new SyncEngine(
      storage,
      async () => {
        if (++calls > 1) throw new Error('connection lost')
        started()
        await waiting
        return { outcome: 'applied', data: 'older' }
      },
      () => {},
    )
    await engine.enqueue(operation(), 'older')
    const syncing = engine.sync()
    await running
    await engine.enqueue(operation(), 'newer')
    release()
    await syncing
    expect((await storage.read()).documents['roster:one']?.data).toBe('newer')
  })

  it('blocks a conflicting history while syncing unrelated resources', async () => {
    const storage = memory()
    const engine = new SyncEngine(
      storage,
      async (edit) =>
        edit.resource === 'battle:one'
          ? { outcome: 'conflict', message: 'Another player advanced the battle.' }
          : { outcome: 'applied', data: 'saved' },
      () => {},
    )
    await engine.enqueue(operation('battle:one'))
    await engine.enqueue(operation('battle:one'))
    await engine.enqueue(operation('roster:one'))
    await engine.sync()
    expect((await storage.read()).operations.map((edit) => edit.status)).toEqual(['conflict', 'pending'])
  })

  it('passes the last acknowledged version to the next edit', async () => {
    const storage = memory()
    const versions: (number | null)[] = []
    const engine = new SyncEngine(
      storage,
      async (edit, state) => {
        versions.push(state.documents[edit.resource]?.serverVersion ?? null)
        return { outcome: 'applied', data: 'saved', serverVersion: 3 }
      },
      () => {},
    )
    await engine.enqueue({ ...operation(), attempted: true }, 'first')
    await engine.enqueue(operation(), 'second')
    await engine.sync()
    expect(versions).toEqual([null, 3])
  })
})

it('coalesces roster autosaves that have never been attempted', async () => {
  const storage = memory()
  const engine = new SyncEngine(
    storage,
    async () => {
      throw new Error('offline')
    },
    () => {},
  )
  await engine.enqueue(operation(), 'first')
  const last = operation()
  await engine.enqueue(last, 'latest')
  expect((await storage.read()).operations.map((edit) => edit.id)).toEqual([last.id])
})
it('keeps an attempted save’s identity after an uncertain response', async () => {
  const storage = memory()
  const engine = new SyncEngine(
    storage,
    async () => {
      throw new Error('lost response')
    },
    () => {},
  )
  const first = operation()
  await engine.enqueue(first, 'first')
  await engine.sync()
  await engine.enqueue(operation(), 'second')
  expect((await storage.read()).operations).toHaveLength(2)
})
it('waits for resource creation before sending dependent actions', async () => {
  const storage = memory()
  const executed: string[] = []
  const engine = new SyncEngine(
    storage,
    async (edit) => {
      executed.push(edit.resource)
      return { outcome: 'applied', data: null }
    },
    () => {},
  )
  await engine.enqueue({ ...operation('battle:one'), dependencies: ['roster:one'] })
  await engine.enqueue(operation('roster:one'))
  await engine.sync()
  expect(executed).toEqual(['roster:one', 'battle:one'])
})
it('does not acknowledge into a replacement account generation', async () => {
  const storage = memory()
  const engine = new SyncEngine(
    storage,
    async () => {
      await storage.change(() => emptyLocalState('another'))
      return { outcome: 'applied', data: 'private' }
    },
    () => {},
  )
  await engine.enqueue(operation(), 'private')
  await engine.sync()
  expect((await storage.read()).documents).toEqual({})
})
it('rejects duplicate operation identities before writing', async () => {
  const storage = memory()
  const engine = new SyncEngine(
    storage,
    async () => ({ outcome: 'applied', data: null }),
    () => {},
  )
  const edit = operation()
  await engine.enqueue(edit)
  await expect(engine.enqueue(edit)).rejects.toThrow('already saved')
})

it('allows only one window to send saved work at a time', async () => {
  const storage = memory()
  let started!: () => void
  let release!: () => void
  const ready = new Promise<void>((resolve) => {
    started = resolve
  })
  const wait = new Promise<void>((resolve) => {
    release = resolve
  })
  const calls: string[] = []
  const first = new SyncEngine(
    storage,
    async (edit) => {
      calls.push(edit.id)
      started()
      await wait
      return { outcome: 'applied', data: 'saved' }
    },
    () => {},
  )
  const second = new SyncEngine(
    storage,
    async (edit) => {
      calls.push(edit.id)
      return { outcome: 'applied', data: 'duplicate' }
    },
    () => {},
  )
  await first.enqueue(operation())
  const syncing = first.sync()
  await ready
  await second.sync()
  release()
  await syncing
  expect(calls).toHaveLength(1)
})
it('recovers a sync lease left by a terminated window', async () => {
  const initial = emptyLocalState('player')
  initial.operations = [operation()]
  initial.syncLease = { holder: crypto.randomUUID(), expiresAt: Date.now() - 1 }
  const storage = memory(initial)
  await new SyncEngine(
    storage,
    async () => ({ outcome: 'applied', data: 'saved' }),
    () => {},
  ).sync()
  expect((await storage.read()).operations).toEqual([])
})
it('refuses a concurrent local battle append without replacing the saved history', async () => {
  const storage = memory()
  const engine = new SyncEngine(
    storage,
    async () => ({ outcome: 'applied', data: null }),
    () => {},
  )
  await storage.change((state) => ({ ...state, documents: { 'battle:one': { data: { log: [{ seq: 10 }] }, serverVersion: 10 } } }))
  await engine.enqueue({ ...operation('battle:one'), input: { expectedSeq: 10 } }, { log: [{ seq: 10 }, { seq: 11, command: 'first' }] })
  await expect(
    engine.enqueue({ ...operation('battle:one'), input: { expectedSeq: 10 } }, { log: [{ seq: 10 }, { seq: 11, command: 'second' }] }),
  ).rejects.toThrow('Another window advanced')
  expect((await storage.read()).documents['battle:one']?.data).toEqual({ log: [{ seq: 10 }, { seq: 11, command: 'first' }] })
})

it('retains dependent work for review instead of sending it after its prerequisite is discarded', async () => {
  const initial = emptyLocalState('player')
  initial.operations = [operation('roster:one'), { ...operation('battle:one'), dependencies: ['roster:one'] }, operation('roster:two')]
  const storage = memory(discardLocalResource(initial, 'roster:one'))
  const executed: string[] = []
  await new SyncEngine(
    storage,
    async (edit) => {
      executed.push(edit.resource)
      return { outcome: 'applied', data: null }
    },
    () => {},
  ).sync()
  expect({ executed, retained: (await storage.read()).operations.map((edit) => edit.status) }).toEqual({
    executed: ['roster:two'],
    retained: ['refused'],
  })
})
