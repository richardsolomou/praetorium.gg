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

  it('keeps the hash that names an open pane', () => {
    expect(tabLocation('/rosters/army-id#roster-pane')?.href).toBe('/rosters/army-id#roster-pane')
  })

  it('refuses a location outside the tabbed sections', () => {
    expect(tabLocation('/profile')).toBeNull()
  })

  it('returns a tab to where it was left', () => {
    stubSessionStorage()
    rememberTab('/factions/necrons/datasheets/overlord')
    expect(recallTab('factions')).toMatchObject({ href: '/factions/necrons/datasheets/overlord', scrollY: 0 })
  })

  it('keeps one memory per section', () => {
    stubSessionStorage()
    rememberTab('/rosters/army-id')
    rememberTab('/factions/necrons')
    expect(recallTab('rosters')).toMatchObject({ href: '/rosters/army-id', scrollY: 0 })
  })

  it('has nothing to recall for a section this session has not visited', () => {
    stubSessionStorage()
    expect(recallTab('leagues')).toBeNull()
  })

  it('remembers nothing for a location outside the tabbed sections', () => {
    stubSessionStorage()
    rememberTab('/rosters/army-id')
    rememberTab('/profile')
    expect(recallTab('rosters')).toMatchObject({ href: '/rosters/army-id', scrollY: 0 })
  })

  it('remembers an open snapshot roster pane', () => {
    stubSessionStorage()
    const rosterSnapshotPane = { workspace: '/battles/battle-id/rosters/player-id', unitKey: 'unit-id' }
    rememberTab('/battles/battle-id/rosters/player-id#roster-pane', {
      state: { rosterSnapshotPane },
    })

    expect(recallTab('battles')?.state).toEqual({ rosterSnapshotPane })
  })

  it('keeps both supported pane states and ignores unrelated router state', () => {
    stubSessionStorage()
    const rosterPane = { workspace: '/rosters/army-id', pane: 'picker' }
    const rosterSnapshotPane = { workspace: '/battles/battle-id/rosters/player-id', unitKey: 'unit-id' }
    rememberTab('/rosters/army-id#roster-pane', {
      state: { rosterPane, rosterSnapshotPane, unrelated: 'discard me' },
    })

    expect(recallTab('rosters')?.state).toEqual({ rosterPane, rosterSnapshotPane })
  })

  it('remembers an open roster pane and each scroll region', () => {
    stubSessionStorage()
    const rosterPane = { workspace: '/rosters/army-id', pane: 'loadout', selectedKey: 2 }
    rememberTab('/rosters/army-id#roster-pane', {
      scrollY: 120,
      regions: { roster: 240, loadout: 360 },
      state: { rosterPane },
    })

    expect(recallTab('rosters')).toEqual({
      href: '/rosters/army-id#roster-pane',
      scrollY: 120,
      regions: { roster: 240, loadout: 360 },
      state: { rosterPane },
    })
  })
})
