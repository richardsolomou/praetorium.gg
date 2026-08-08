import { describe, expect, it } from 'vitest'
import { forwardedOrigin, parseOrigin } from './requestOrigin'

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
