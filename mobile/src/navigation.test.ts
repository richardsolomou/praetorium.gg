import { describe, expect, it } from 'vitest'
import {
  APP_URL,
  applicationNavigationScript,
  classifyNavigation,
  externalOpenStrategies,
  initialApplicationUrl,
  isMainFrameHttpError,
  resolveApplicationUrl,
} from './navigation'

describe('application URL', () => {
  it('uses production unless a simulator test origin is configured', () => {
    expect([resolveApplicationUrl(), resolveApplicationUrl('http://127.0.0.1:4173/sign-in')]).toEqual([
      'https://praetorium.gg',
      'http://127.0.0.1:4173',
    ])
  })

  it('rejects a simulator test URL with credentials or an unsupported protocol', () => {
    expect(() => resolveApplicationUrl('http://player:secret@127.0.0.1:4173')).toThrow('valid HTTP origin')
    expect(() => resolveApplicationUrl('file:///tmp/praetorium')).toThrow('valid HTTP origin')
  })
})

describe('classifyNavigation', () => {
  it('keeps Praetorium routes in the application', () => {
    expect(classifyNavigation('https://praetorium.gg/battles/abc?view=live#score')).toEqual({
      kind: 'internal',
      url: 'https://praetorium.gg/battles/abc?view=live#score',
    })
  })

  it('opens another HTTPS origin externally', () => {
    expect(classifyNavigation('https://example.com/rules')).toEqual({ kind: 'external', url: 'https://example.com/rules' })
  })

  it('opens email links externally', () => {
    expect(classifyNavigation('mailto:support@praetorium.gg')).toEqual({ kind: 'external', url: 'mailto:support@praetorium.gg' })
  })

  it('does not trust a lookalike hostname', () => {
    expect(classifyNavigation('https://praetorium.gg.example.com/battles/abc')).toEqual({
      kind: 'external',
      url: 'https://praetorium.gg.example.com/battles/abc',
    })
  })

  it('blocks credentials embedded in an application URL', () => {
    expect(classifyNavigation('https://player:secret@praetorium.gg/battles/abc')).toEqual({ kind: 'blocked' })
  })

  it('blocks unsupported schemes', () => {
    expect(classifyNavigation('javascript:alert(1)')).toEqual({ kind: 'blocked' })
  })

  it('blocks malformed URLs', () => {
    expect(classifyNavigation('not a url')).toEqual({ kind: 'blocked' })
  })
})

describe('externalOpenStrategies', () => {
  it('prefers the operating system and keeps the in-app browser as a web fallback', () => {
    expect(externalOpenStrategies('https://github.com/richardsolomou/praetorium.gg/issues', true)).toEqual(['system', 'in-app-browser'])
  })

  it('falls back to the in-app browser for a web page the system cannot open', () => {
    expect(externalOpenStrategies('https://github.com/richardsolomou/praetorium.gg/issues', false)).toEqual(['in-app-browser'])
  })

  it('has no in-app fallback for a non-web link', () => {
    expect(externalOpenStrategies('mailto:support@praetorium.gg', true)).toEqual(['system'])
    expect(externalOpenStrategies('tel:+441234567890', false)).toEqual([])
  })
})

describe('isMainFrameHttpError', () => {
  it('fails the load when the main document answers with an error status', () => {
    expect(isMainFrameHttpError('https://praetorium.gg/battles/abc', 503, 'https://praetorium.gg/battles/abc')).toBe(true)
  })

  it('ignores the fragment when matching the main document', () => {
    expect(isMainFrameHttpError('https://praetorium.gg/battles/abc', 500, 'https://praetorium.gg/battles/abc#score')).toBe(true)
  })

  it('leaves the page in place when a sub-resource fails', () => {
    expect(isMainFrameHttpError('https://praetorium.gg/api/roster', 404, 'https://praetorium.gg/battles/abc')).toBe(false)
  })

  it('does not fail before the main frame URL is known', () => {
    expect(isMainFrameHttpError('https://praetorium.gg/battles/abc', 500, null)).toBe(false)
  })

  it('does not fail on a success status', () => {
    expect(isMainFrameHttpError('https://praetorium.gg/battles/abc', 304, 'https://praetorium.gg/battles/abc')).toBe(false)
  })
})

describe('incoming application links', () => {
  it('preserves the route, query, and fragment on a cold start', () => {
    expect(initialApplicationUrl('https://praetorium.gg/invitations/opaque?seat=player%2Bone#accept')).toBe(
      'https://praetorium.gg/invitations/opaque?seat=player%2Bone#accept',
    )
  })

  it('falls back to the home page for an untrusted initial URL', () => {
    expect(initialApplicationUrl('https://example.com/battles/abc')).toBe(APP_URL)
  })

  it('builds a warm navigation script from the normalized internal URL', () => {
    expect(applicationNavigationScript('https://praetorium.gg/rosters/abc?token=opaque#units')).toBe(
      'window.location.assign("https://praetorium.gg/rosters/abc?token=opaque#units"); true;',
    )
  })

  it('does not build a warm navigation script for another origin', () => {
    expect(applicationNavigationScript('https://example.com/rosters/abc')).toBeNull()
  })
})
