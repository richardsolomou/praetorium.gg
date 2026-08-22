import { describe, expect, it } from 'vitest'
import { sortRosters } from './rosterSort'

const alpha = { id: 'alpha', name: 'Alpha', limit: 2000, updatedAt: 20 }
const beta = { id: 'beta', name: 'Beta', limit: 1000, updatedAt: 30 }
const gamma = { id: 'gamma', name: 'Gamma', limit: 3000, updatedAt: 10 }

describe('roster sorting', () => {
  it('keeps the default name order independent of updates', () => {
    expect(sortRosters([{ ...alpha, updatedAt: 99 }, beta, gamma], 'name-asc').map((roster) => roster.name)).toEqual([
      'Alpha',
      'Beta',
      'Gamma',
    ])
  })

  it('sorts by the chosen roster fact in either direction', () => {
    expect(sortRosters([alpha, beta, gamma], 'updated-desc').map((roster) => roster.name)).toEqual(['Beta', 'Alpha', 'Gamma'])
    expect(sortRosters([alpha, beta, gamma], 'size-asc').map((roster) => roster.name)).toEqual(['Beta', 'Alpha', 'Gamma'])
    expect(sortRosters([alpha, beta, gamma], 'name-desc').map((roster) => roster.name)).toEqual(['Gamma', 'Beta', 'Alpha'])
  })
})
