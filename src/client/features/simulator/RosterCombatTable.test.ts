import { expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { bestRosterMatches, matchupShade, ownerRuns, RosterCombatTable } from './RosterCombatTable'

const answer = (meanDamage: number, meanKills: number, wipe: number) => ({ result: { meanDamage, meanKills, wipe } })
it('highlights damage rather than destruction chance when comparing wounds', () => {
  expect(bestRosterMatches([answer(5, 1, 0.1), answer(3, 2, 0.8)], 'meanDamage')).toEqual([0])
})
it('changes the best target when comparing destruction chance', () => {
  expect(bestRosterMatches([answer(5, 1, 0.1), answer(3, 2, 0.8)], 'wipe')).toEqual([1])
})
it('highlights every tied target', () => {
  expect(bestRosterMatches([answer(3, 1, 0), answer(3, 1, 0)], 'meanDamage')).toEqual([0, 1])
})
it('waits for the entire row before ranking its targets', () => {
  expect(bestRosterMatches([answer(3, 1, 0), undefined], 'meanDamage')).toEqual([])
})
it('does not recommend a zero-damage target', () => {
  expect(bestRosterMatches([answer(0, 0, 0), { error: 'Unsupported' }], 'meanDamage')).toEqual([])
})

it('shows every attacking unit without paging', () => {
  const units = Array.from({ length: 12 }, (_, pickIndex) => ({
    rosterIndex: 0,
    pickIndex,
    name: `Squad ${pickIndex + 1}`,
    snapshot: null,
  }))
  const markup = renderToStaticMarkup(
    createElement(RosterCombatTable, { attackers: units, defenders: [units[0]!], results: {}, onSelect: () => {} }),
  )
  expect([...markup.matchAll(/scope="row"/g)]).toHaveLength(12)
})

it('shades a matchup by its share of the largest result', () => {
  expect([matchupShade(8, 8), matchupShade(4, 8), matchupShade(0, 8), matchupShade(undefined, 8)]).toEqual([28, 16, 0, 0])
})

it('groups consecutive units by whose list they come from', () => {
  const unit = (name?: string) => ({ rosterIndex: 0, pickIndex: 0, name: 'Squad', snapshot: null, owner: name ? { name } : undefined })
  expect(ownerRuns([unit('Ana'), unit('Ana'), unit('Ben')])).toEqual([
    { owner: { name: 'Ana' }, start: 0, count: 2 },
    { owner: { name: 'Ben' }, start: 2, count: 1 },
  ])
})

it('names no groups for a side that is one owner’s list', () => {
  const unit = { rosterIndex: 0, pickIndex: 0, name: 'Squad', snapshot: null, owner: { name: 'Ana' } }
  expect(ownerRuns([unit, { ...unit, pickIndex: 1 }])).toEqual([])
})

it('names no groups for a single unlabelled roster', () => {
  expect(ownerRuns([{ rosterIndex: 0, pickIndex: 0, name: 'Squad', snapshot: null }])).toEqual([])
})

it('explains once why a unit that cannot attack has no results', () => {
  const squad = { rosterIndex: 0, pickIndex: 0, name: 'Squad', snapshot: null }
  const ancient = { ...squad, pickIndex: 1, name: 'Ancient', error: 'must be attached to a Bodyguard unit' }
  const failed = { ranged: { error: 'must be attached to a Bodyguard unit' }, melee: {}, combined: {} }
  const markup = renderToStaticMarkup(
    createElement(RosterCombatTable, {
      attackers: [ancient],
      defenders: [squad, { ...squad, pickIndex: 2 }],
      results: { '0:0': failed, '0:1': failed },
      onSelect: () => {},
    }),
  )
  expect([...markup.matchAll(/Not calculated: must be attached to a Bodyguard unit/g)]).toHaveLength(1)
})
