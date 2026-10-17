import { describe, expect, it } from 'vitest'
import { fitStarterBudget, starterPicks, type PricedStarterPick, type StarterCandidate } from './starterDraft'

const warriors: StarterCandidate = { entryId: 'warriors', name: 'Warriors', owned: 20, size: { min: 10, max: 20 }, limit: 3 }
const overlord: StarterCandidate = { entryId: 'overlord', name: 'Overlord', owned: 1, size: { min: 1, max: 1 }, limit: 3 }

const priced = (entryId: string, points: number, copy = 0, warlord = false): PricedStarterPick => ({
  entryId,
  name: entryId,
  models: 1,
  copy,
  points,
  warlord,
})

describe('starter picks', () => {
  it('fields nothing from an empty collection', () => {
    expect(starterPicks([])).toEqual({ picks: [], leftOut: [] })
  })

  it('fields one unit as large as the models allow', () => {
    expect(starterPicks([warriors]).picks).toEqual([{ entryId: 'warriors', name: 'Warriors', models: 20, copy: 0 }])
  })

  it('leaves out models too few for the smallest unit', () => {
    expect(starterPicks([{ ...warriors, owned: 9 }]).leftOut).toEqual([
      { entryId: 'warriors', name: 'Warriors', models: 9, reason: 'too-few' },
    ])
  })

  it('splits surplus models into further copies', () => {
    expect(starterPicks([{ ...warriors, owned: 30 }]).picks.map((pick) => pick.models)).toEqual([20, 10])
  })

  it('stops at the copy limit', () => {
    expect(starterPicks([{ ...overlord, owned: 4, limit: 1 }]).leftOut).toEqual([
      { entryId: 'overlord', name: 'Overlord', models: 3, reason: 'limit' },
    ])
  })

  it('fields nothing of a datasheet the detachment forbids', () => {
    expect(starterPicks([{ ...overlord, limit: 0 }]).picks).toEqual([])
  })

  it('uses only the sizes the datasheet lists', () => {
    expect(
      starterPicks([{ ...warriors, owned: 15, size: { min: 10, max: 20, options: [10, 20] } }]).picks.map((pick) => pick.models),
    ).toEqual([10])
  })
})

describe('starter budget', () => {
  it('keeps room for a Warlord before larger units', () => {
    expect(fitStarterBudget([priced('squad', 950), priced('lord', 60, 0, true)], 1000).chosen.map((pick) => pick.entryId)).toEqual(['lord'])
  })

  it('chooses the cheapest of several Warlords', () => {
    expect(
      fitStarterBudget([priced('lord', 100, 0, true), priced('cheap-lord', 60, 0, true)], 100).chosen.map((pick) => pick.entryId),
    ).toEqual(['cheap-lord'])
  })

  it('fields one of each datasheet before second copies', () => {
    expect(fitStarterBudget([priced('a', 100), priced('a', 100, 1), priced('b', 50)], 200).chosen.map((pick) => pick.entryId)).toEqual([
      'a',
      'b',
    ])
  })

  it('reports units the budget cannot hold', () => {
    expect(fitStarterBudget([priced('a', 600), priced('b', 500)], 1000).leftOut).toEqual([
      { entryId: 'b', name: 'b', models: 1, reason: 'points' },
    ])
  })

  it('totals the chosen points', () => {
    expect(fitStarterBudget([priced('a', 600), priced('b', 300)], 1000).points).toBe(900)
  })
})
