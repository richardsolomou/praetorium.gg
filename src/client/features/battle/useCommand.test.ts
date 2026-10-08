import { describe, expect, it } from 'vitest'
import { afterFailedCommand } from './useCommand'

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
