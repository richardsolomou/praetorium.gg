import { describe, expect, it } from 'vitest'
import { classifyNavigation } from './navigation'

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
