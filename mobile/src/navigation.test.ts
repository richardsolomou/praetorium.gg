import { describe, expect, it } from 'vitest'
import { APP_URL, applicationNavigationScript, classifyNavigation, initialApplicationUrl } from './navigation'

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
