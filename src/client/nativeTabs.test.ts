import { beforeEach, describe, expect, it, vi } from 'vitest'
import { recallTab, rememberTab, tabLocation } from './nativeTabs'

function stubSessionStorage() {
  const entries = new Map<string, string>()
  vi.stubGlobal('window', {})
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => entries.set(key, value),
  })
}

describe('native tab memory', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('names the section a location belongs to', () => {
    expect(tabLocation('/rosters/army-id')).toEqual({ section: 'rosters', href: '/rosters/army-id' })
  })

  it('keeps the query, which names what the page is showing', () => {
    expect(tabLocation('/rosters/army-id?league=spring')?.href).toBe('/rosters/army-id?league=spring')
  })

  it('drops the hash, because the pane it names lives in history state', () => {
    expect(tabLocation('/rosters/army-id#roster-pane')?.href).toBe('/rosters/army-id')
  })

  it('refuses a location outside the tabbed sections', () => {
    expect(tabLocation('/profile')).toBeNull()
  })

  it('returns a tab to where it was left', () => {
    stubSessionStorage()
    rememberTab('/factions/necrons/datasheets/overlord')
    expect(recallTab('factions')).toBe('/factions/necrons/datasheets/overlord')
  })

  it('keeps one memory per section', () => {
    stubSessionStorage()
    rememberTab('/rosters/army-id')
    rememberTab('/factions/necrons')
    expect(recallTab('rosters')).toBe('/rosters/army-id')
  })

  it('has nothing to recall for a section this session has not visited', () => {
    stubSessionStorage()
    expect(recallTab('leagues')).toBeNull()
  })

  it('remembers nothing for a location outside the tabbed sections', () => {
    stubSessionStorage()
    rememberTab('/rosters/army-id')
    rememberTab('/profile')
    expect(recallTab('rosters')).toBe('/rosters/army-id')
  })
})
