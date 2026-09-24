import { describe, expect, it } from 'vitest'
import { isSearchShortcut, searchShortcutModifier } from './globalSearchShortcut'
import { matchingPages } from './globalSearchPages'

describe('isSearchShortcut', () => {
  it('accepts Command K', () => expect(isSearchShortcut({ key: 'k', metaKey: true, ctrlKey: false })).toBe(true))
  it('accepts Control K', () => expect(isSearchShortcut({ key: 'K', metaKey: false, ctrlKey: true })).toBe(true))
  it('rejects an unmodified K', () => expect(isSearchShortcut({ key: 'k', metaKey: false, ctrlKey: false })).toBe(false))
  it('rejects an event without a key', () => expect(isSearchShortcut({ metaKey: true, ctrlKey: false })).toBe(false))
})

describe('search shortcut label', () => {
  it('uses Command on Apple platforms', () => {
    expect(searchShortcutModifier('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('⌘')
    expect(searchShortcutModifier('Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)')).toBe('⌘')
  })

  it('uses Control on Windows and Linux', () => {
    expect(searchShortcutModifier('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('Ctrl')
    expect(searchShortcutModifier('Mozilla/5.0 (X11; Linux x86_64)')).toBe('Ctrl')
  })
})

describe('matchingPages', () => {
  it('finds a page after typing', () => expect(matchingPages('build').map((page) => page.label)).toEqual(['New roster']))
})
