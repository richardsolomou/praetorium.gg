import { describe, expect, it } from 'vitest'
import { NATIVE_BRIDGE_SCRIPT, parseNativeActionRequest } from './nativeActions'

describe('parseNativeActionRequest', () => {
  it('accepts an internal share link', () => {
    expect(
      parseNativeActionRequest(
        JSON.stringify({ version: 3, type: 'native-share', url: 'https://praetorium.gg/battles/abc?seat=two#turn' }),
      ),
    ).toEqual({ kind: 'share', url: 'https://praetorium.gg/battles/abc?seat=two#turn' })
  })

  it('rejects an external share link', () => {
    expect(
      parseNativeActionRequest(JSON.stringify({ version: 3, type: 'native-share', url: 'https://example.com/battles/abc' })),
    ).toBeNull()
  })

  it('accepts battle, haptic, and print actions', () => {
    expect(parseNativeActionRequest(JSON.stringify({ version: 3, type: 'native-battle-active', active: true }))).toEqual({
      kind: 'battle-active',
      active: true,
    })
    expect(parseNativeActionRequest(JSON.stringify({ version: 3, type: 'native-haptic' }))).toEqual({ kind: 'haptic' })
    expect(parseNativeActionRequest(JSON.stringify({ version: 3, type: 'native-print', html: '<html></html>' }))).toEqual({
      kind: 'print',
      html: '<html></html>',
    })
  })

  it('rejects unknown bridge versions and oversized print documents', () => {
    expect(parseNativeActionRequest(JSON.stringify({ version: 2, type: 'native-haptic' }))).toBeNull()
    expect(parseNativeActionRequest(JSON.stringify({ version: 3, type: 'native-print', html: 'x'.repeat(2_000_001) }))).toBeNull()
  })
})

describe('NATIVE_BRIDGE_SCRIPT', () => {
  it('publishes only the version 3 capabilities the shell handles', () => {
    expect(NATIVE_BRIDGE_SCRIPT).toContain("const capabilities = ['battle-active', 'haptic', 'print', 'share']")
    expect(NATIVE_BRIDGE_SCRIPT).toContain('bridgeVersion: 3')
  })

  it('removes executable embedded content before printing', () => {
    expect(NATIVE_BRIDGE_SCRIPT).toContain("querySelectorAll('script, iframe')")
  })
})
