import { afterEach, describe, expect, it, vi } from 'vitest'
import { publicOrigin } from './requestOrigin'

describe('publicOrigin', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('prefers the configured canonical origin', () => {
    vi.stubEnv('APP_URL', 'https://praetorium.gg/')
    const request = new Request('http://internal', { headers: { host: 'other.example', 'x-forwarded-proto': 'https' } })

    expect(publicOrigin(request)).toBe('https://praetorium.gg')
  })

  it('reads the forwarded host and protocol behind a proxy', () => {
    vi.stubEnv('APP_URL', '')
    const request = new Request('http://internal', { headers: { 'x-forwarded-host': 'praetorium.gg', 'x-forwarded-proto': 'https' } })

    expect(publicOrigin(request)).toBe('https://praetorium.gg')
  })
})
