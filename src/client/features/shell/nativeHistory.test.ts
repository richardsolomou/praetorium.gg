import { beforeEach, describe, expect, it, vi } from 'vitest'
import { historyStaysInSection, rememberHistorySection } from './nativeHistory'

describe('native history sections', () => {
  beforeEach(() => {
    const entries = new Map<string, string>()
    vi.stubGlobal('window', {})
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => entries.set(key, value),
    })
  })

  it('goes back inside the tab the previous screen belongs to', () => {
    rememberHistorySection(0, 'rosters')
    rememberHistorySection(1, 'rosters')

    expect(historyStaysInSection(1, 'rosters')).toBe(true)
  })

  it('does not go back into the tab the player came from', () => {
    rememberHistorySection(0, 'factions')
    rememberHistorySection(1, 'rosters')

    expect(historyStaysInSection(1, 'rosters')).toBe(false)
  })

  it('has nothing behind the first screen of the session', () => {
    rememberHistorySection(0, 'rosters')

    expect(historyStaysInSection(0, 'rosters')).toBe(false)
  })

  it('forgets the screens a new branch of history replaced', () => {
    rememberHistorySection(0, 'rosters')
    rememberHistorySection(1, 'rosters')
    rememberHistorySection(2, 'rosters')
    rememberHistorySection(1, 'factions')

    expect(historyStaysInSection(2, 'rosters')).toBe(false)
  })

  it('answers nothing for a screen outside every tab', () => {
    rememberHistorySection(0, 'rosters')
    rememberHistorySection(1, undefined)

    expect(historyStaysInSection(1, undefined)).toBe(false)
  })
})
