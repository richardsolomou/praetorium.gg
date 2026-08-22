import { describe, expect, it } from 'vitest'
import { sortRosters } from './rosterSort'

const alpha = { id: 'alpha', name: 'Alpha', limit: 2000, createdAt: 30, updatedAt: 20 }
const beta = { id: 'beta', name: 'Beta', limit: 1000, createdAt: 20, updatedAt: 30 }
const gamma = { id: 'gamma', name: 'Gamma', limit: 3000, createdAt: 10, updatedAt: 10 }

describe('roster sorting', () => {
  it('keeps newest-created order independent of updates', () => {
    expect(
      sortRosters([{ ...alpha, updatedAt: 99 }, { ...beta, updatedAt: 100 }, gamma], 'created-desc').map((roster) => roster.name),
    ).toEqual(['Alpha', 'Beta', 'Gamma'])
  })

  it('sorts by the chosen roster fact in either direction', () => {
    expect(sortRosters([alpha, beta, gamma], 'updated-desc').map((roster) => roster.name)).toEqual(['Beta', 'Alpha', 'Gamma'])
    expect(sortRosters([alpha, beta, gamma], 'size-asc').map((roster) => roster.name)).toEqual(['Beta', 'Alpha', 'Gamma'])
    expect(sortRosters([alpha, beta, gamma], 'name-desc').map((roster) => roster.name)).toEqual(['Gamma', 'Beta', 'Alpha'])
  })
})
