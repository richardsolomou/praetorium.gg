import { describe, expect, it } from 'vitest'
import { isSearchShortcut } from './globalSearchShortcut'

describe('isSearchShortcut', () => {
  it('accepts Command K', () => expect(isSearchShortcut({ key: 'k', metaKey: true, ctrlKey: false })).toBe(true))
  it('accepts Control K', () => expect(isSearchShortcut({ key: 'K', metaKey: false, ctrlKey: true })).toBe(true))
  it('rejects an unmodified K', () => expect(isSearchShortcut({ key: 'k', metaKey: false, ctrlKey: false })).toBe(false))
})
