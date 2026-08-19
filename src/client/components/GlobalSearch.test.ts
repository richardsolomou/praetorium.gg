import { describe, expect, it } from 'vitest'
import { isSearchShortcut } from './globalSearchShortcut'
import { matchingPages } from './globalSearchPages'

describe('isSearchShortcut', () => {
  it('accepts Command K', () => expect(isSearchShortcut({ key: 'k', metaKey: true, ctrlKey: false })).toBe(true))
  it('accepts Control K', () => expect(isSearchShortcut({ key: 'K', metaKey: false, ctrlKey: true })).toBe(true))
  it('rejects an unmodified K', () => expect(isSearchShortcut({ key: 'k', metaKey: false, ctrlKey: false })).toBe(false))
  it('rejects an event without a key', () => expect(isSearchShortcut({ metaKey: true, ctrlKey: false })).toBe(false))
})

describe('matchingPages', () => {
  it('finds a page after typing', () => expect(matchingPages('build').map((page) => page.label)).toEqual(['New roster']))
})
