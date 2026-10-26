import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { writesPending } from '../../pendingWrites'

const submit = vi.hoisted(() => vi.fn())
const captureException = vi.hoisted(() => vi.fn())
const writeAppSnapshot = vi.hoisted(() => vi.fn())
vi.mock('../../functions', () => ({ submit }))
vi.mock('../../offline/appStorage', () => ({ writeAppSnapshot }))
vi.mock('../../offline/appSnapshot', () => ({ captureAppSnapshot: () => null }))
vi.mock('../../nativeBridge', () => ({ requestNativeHaptic: () => {} }))
vi.mock('posthog-js', () => ({ posthog: { captureException } }))

import { afterFailedCommand, drainCommands } from './useCommand'

const queued = (basedOn: number, background = false) => ({ basedOn, background })

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
    const drained = drainCommands({
      token: 'battle',
      queryClient: client,
      seen: { current: 0 },
      queued: { current: [0, 1].map(() => ({ command: { kind: 'begin-battle' } as never, basedOn: 0 })) },
      draining: { current: false },
      setPending: () => {},
      setProblem: () => {},
    })
    await vi.waitFor(() => expect(writeAppSnapshot).toHaveBeenCalledOnce())
    expect(writesPending(client)).toBe(true)
    saved()
    await drained
  })
})

describe('a command sent while the connection drops', () => {
  it('asks the player to check their connection and reports nothing', async () => {
    submit.mockRejectedValueOnce(new TypeError('Load failed'))
    const setProblem = vi.fn()
    await drainCommands({
      token: 'battle',
      queryClient: new QueryClient(),
      seen: { current: 0 },
      queued: { current: [{ command: { kind: 'begin-battle' } as never, basedOn: 0 }] },
      draining: { current: false },
      setPending: () => {},
      setProblem,
    })
    expect(setProblem).toHaveBeenLastCalledWith('Check your connection and try again.')
    expect(captureException).not.toHaveBeenCalled()
  })
})
