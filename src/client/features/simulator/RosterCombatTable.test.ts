import { expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { bestRosterMatches, RosterCombatTable } from './RosterCombatTable'

const answer = (meanDamage: number, meanKills: number, wipe: number) => ({ result: { meanDamage, meanKills, wipe } })
it('highlights damage rather than destruction chance when comparing wounds', () => {
  expect(bestRosterMatches([answer(5, 1, 0.1), answer(3, 2, 0.8)], 'meanDamage')).toEqual([0])
})
it('changes the best target when comparing destruction chance', () => {
  expect(bestRosterMatches([answer(5, 1, 0.1), answer(3, 2, 0.8)], 'wipe')).toEqual([1])
})
it('changes the best target when comparing models', () => {
  expect(bestRosterMatches([answer(5, 1, 0.1), answer(3, 2, 0.8)], 'meanKills')).toEqual([1])
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
