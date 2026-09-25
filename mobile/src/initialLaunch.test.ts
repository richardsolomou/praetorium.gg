import { describe, expect, it, vi } from 'vitest'
import { initialLaunch } from './initialLaunch'

describe('initial launch', () => {
  it('opens an ordinary page before secure storage responds', async () => {
    let resolvePending!: (value: string | null) => void
    const pending = new Promise<string | null>((resolve) => {
      resolvePending = resolve
    })
    const openPage = vi.fn()
    const resumeAuth = vi.fn(async () => undefined)

    const launch = initialLaunch(null, pending, openPage, resumeAuth)
    expect(openPage).toHaveBeenCalledWith(null)

    resolvePending(null)
    await launch
  })

  it('waits for secure storage before opening an authentication callback', async () => {
    const openPage = vi.fn()

    await initialLaunch('praetorium://auth?token=receipt', Promise.resolve(null), openPage, async () => undefined)

    expect(openPage).not.toHaveBeenCalled()
  })
})
