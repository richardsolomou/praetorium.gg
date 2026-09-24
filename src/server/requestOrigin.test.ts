import { afterEach, describe, expect, it, vi } from 'vitest'
import { forwardedOrigin, parseOrigin, publicOrigin } from './requestOrigin'

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

  it('falls back to the address the request arrived at', () => {
    vi.stubEnv('APP_URL', '')

    expect(publicOrigin(new Request('http://localhost:3000/battles/abc'))).toBe('http://localhost:3000')
  })
})

describe('forwardedOrigin', () => {
  it('uses the first forwarded host and protocol', () => {
    const request = new Request('http://internal', {
      headers: { host: 'internal', 'x-forwarded-host': 'praetorium.gg, proxy', 'x-forwarded-proto': 'https, http' },
    })

    expect(forwardedOrigin(request)).toBe('https://praetorium.gg')
  })

  it('falls back to the host header', () => {
    const request = new Request('http://internal', { headers: { host: 'praetorium.gg', 'x-forwarded-proto': 'https' } })

    expect(forwardedOrigin(request)).toBe('https://praetorium.gg')
  })

  it('rejects an unsupported protocol', () => {
    const request = new Request('http://internal', { headers: { host: 'praetorium.gg', 'x-forwarded-proto': 'ftp' } })

    expect(forwardedOrigin(request)).toBeUndefined()
  })
})

describe('parseOrigin', () => {
  it('returns undefined for an invalid URL', () => {
    expect(parseOrigin('not a url')).toBeUndefined()
  })
})
