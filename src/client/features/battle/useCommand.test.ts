import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { writesPending } from '../../pendingWrites'

const submit = vi.hoisted(() => vi.fn())
const captureException = vi.hoisted(() => vi.fn())
const capture = vi.hoisted(() => vi.fn())
const writeAppSnapshot = vi.hoisted(() => vi.fn())
vi.mock('../../functions', () => ({ submit }))
vi.mock('../../offline/appStorage', () => ({ writeAppSnapshot }))
vi.mock('../../offline/appSnapshot', () => ({ captureAppSnapshot: () => null }))
vi.mock('../../nativeBridge', () => ({ requestNativeHaptic: () => {} }))
vi.mock('posthog-js', () => ({ posthog: { captureException, capture } }))
const device = vi.hoisted(() => ({ savedBattleAt: vi.fn(), predictedBattle: vi.fn() }))
vi.mock('../../offline/battleFunctions', () => device)

import { OfflineRefusal } from '../../offline/offlineRefusal'
import { afterFailedCommand, drainCommands, showPrediction } from './useCommand'

const queued = (basedOn: number, background = false) => ({ basedOn, background })
const begin = { command: { kind: 'begin-battle' } as never, basedOn: 0 }

const drain = (options: Partial<Parameters<typeof drainCommands>[0]> = {}) =>
  drainCommands({
    token: 'battle',
    queryClient: new QueryClient(),
    seen: { current: 0 },
    queued: { current: [begin] },
    draining: { current: false },
    setPending: () => {},
    setProblem: () => {},
    ...options,
  })

describe('the command queue after a failed command', () => {
  it('drops a tap built from the same screen as a failed tap', () => {
    const tap = queued(4)
    expect(afterFailedCommand([tap], queued(4), 6).dropped).toEqual([tap])
  })

  it('keeps a tap built from a screen newer than the authoritative one', () => {
    const tap = queued(7)
    expect(afterFailedCommand([tap], queued(4), 6).kept).toEqual([tap])
  })

  it('drops a tap built from a screen older than the authoritative one', () => {
    const tap = queued(5)
    expect(afterFailedCommand([tap], queued(4), 6).dropped).toEqual([tap])
  })

  it('keeps the player’s tap queued behind a failed automatic write', () => {
    const tap = queued(4)
    expect(afterFailedCommand([tap], queued(4, true), 6).kept).toEqual([tap])
  })
})

describe('automatic reloads while commands are queued', () => {
  it('stay held after one command lands while the next is still queued', async () => {
    const appended = { result: { outcome: 'appended' }, screen: null }
    submit.mockResolvedValue(appended)
    let saved!: () => void
    writeAppSnapshot.mockImplementationOnce(() => new Promise<void>((resolve) => (saved = resolve))).mockResolvedValue(undefined)
    const client = new QueryClient()
    const drained = drain({ queryClient: client, queued: { current: [begin, begin] } })
    await vi.waitFor(() => expect(writeAppSnapshot).toHaveBeenCalledOnce())
    expect(writesPending(client)).toBe(true)
    saved()
    await drained
  })
})

describe('a command answered after a realtime refetch', () => {
  it('keeps the newer screen the refetch brought', async () => {
    submit.mockResolvedValueOnce({ result: { outcome: 'appended' }, screen: { kind: 'battle', view: { seq: 5 } } })
    const client = new QueryClient()
    client.setQueryData(['battle', 'battle'], { kind: 'battle', view: { seq: 6 } })
    await drain({ queryClient: client, seen: { current: 4 }, queued: { current: [{ command: { kind: 'advance' } as never, basedOn: 4 }] } })
    expect(client.getQueryData(['battle', 'battle'])).toEqual({ kind: 'battle', view: { seq: 6 } })
  })
})

describe('a command sent while the connection drops', () => {
  it('asks the player to check their connection and reports nothing', async () => {
    submit.mockRejectedValueOnce(new TypeError('Load failed'))
    const setProblem = vi.fn()
    await drain({ setProblem })
    expect(setProblem).toHaveBeenLastCalledWith('Check your connection and try again.')
    expect(captureException).not.toHaveBeenCalled()
  })

  it('counts the failed command and the commands dropped behind it', async () => {
    submit.mockRejectedValueOnce(new TypeError('Load failed'))
    await drain({ queued: { current: [begin, { ...begin, background: true }] } })
    expect(capture).toHaveBeenCalledWith('battle_command_failed', {
      command: 'begin-battle',
      reason: 'network',
      dropped_count: 1,
      background: false,
    })
  })
})

describe('a write that holds only for the screen it was worked out from', () => {
  it('is sent against that screen once the command ahead of it has moved the history on', async () => {
    const settle = { command: { kind: 'settle-opponent-turn' } as never, basedOn: 4, background: true, onlyAt: 5 }
    submit.mockClear().mockResolvedValue({ result: { outcome: 'appended' }, screen: { kind: 'battle', view: { seq: 6 } } })
    await drain({ seen: { current: 4 }, queued: { current: [settle, settle] } })
    expect(submit.mock.calls.map(([{ data }]) => data.expectedSeq)).toEqual([5, 5])
  })
})

it('shows a sync conflict to review without reporting it', async () => {
  submit.mockRejectedValueOnce(new OfflineRefusal('Review this battle’s sync conflict before continuing.'))
  captureException.mockClear()
  await drain()
  expect(captureException).not.toHaveBeenCalled()
})

describe('a command shown before the service answers', () => {
  const screen = (seq: number) => ({ kind: 'battle', view: { seq } })
  async function predicted(...seqs: number[]) {
    const client = new QueryClient()
    client.setQueryData(['battle', 'battle'], screen(4))
    device.savedBattleAt.mockResolvedValue({ workspace: {}, viewerId: 'alice' })
    const projection = { current: null }
    for (const seq of seqs) {
      device.predictedBattle.mockReturnValueOnce({ workspace: {}, viewerId: 'alice', screen: screen(seq) })
      await showPrediction({ token: 'battle', queryClient: client, projection }, { kind: 'advance' } as never)
    }
    return { client, projection }
  }
  const drainTaps = (client: QueryClient, projection: { current: null }, taps: number) =>
    drain({
      queryClient: client,
      seen: { current: 4 },
      queued: { current: Array.from({ length: taps }, () => ({ command: { kind: 'advance' } as never, basedOn: 4 })) },
      projection,
    })

  it('keeps the next tap’s result shown when the service accepts the first', async () => {
    const { client, projection } = await predicted(5, 6)
    submit.mockResolvedValueOnce({ result: { outcome: 'appended' }, screen: screen(5) }).mockReturnValueOnce(new Promise(() => {}))
    void drainTaps(client, projection, 2)
    await vi.waitFor(() => expect(submit).toHaveBeenCalledTimes(2))
    expect(client.getQueryData(['battle', 'battle'])).toEqual(screen(6))
  })

  it('returns to the service’s screen when it refuses the command', async () => {
    const { client, projection } = await predicted(5)
    submit.mockResolvedValueOnce({ result: { outcome: 'refused', reason: 'No.' }, screen: screen(4) })
    await drainTaps(client, projection, 1)
    expect(client.getQueryData(['battle', 'battle'])).toEqual(screen(4))
  })

  it('returns to the service’s screen when sending the command fails', async () => {
    const { client, projection } = await predicted(5)
    submit.mockRejectedValueOnce(new Error('Server error'))
    await drainTaps(client, projection, 1)
    expect(client.getQueryData(['battle', 'battle'])).toEqual(screen(4))
  })
})
