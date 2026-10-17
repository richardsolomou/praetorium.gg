import { describe, expect, it } from 'vitest'
import { keptRosterSort } from './rosterSort'

describe('the kept roster order', () => {
  it('reads back an order the player chose', () => {
    expect(keptRosterSort('name-asc')).toBe('name-asc')
  })

  it('defaults to recently updated without a cookie', () => {
    expect(keptRosterSort(undefined)).toBe('updated-desc')
  })

  it('defaults to recently updated for a value that names no order', () => {
    expect(keptRosterSort('points-desc')).toBe('updated-desc')
  })
})
