import { expect, it } from 'vitest'
import type { LoadedRules } from './rules'
import { tableBattlefields } from './tableBattlefields'

const layout = (id: string, matchupId: string, geometry = true) => ({ id, matchupId, deploymentId: 'dawn', geometry: geometry ? {} : null })
const rules = (...terrainLayouts: ReturnType<typeof layout>[]) => ({ terrainLayouts, missions: new Map() }) as unknown as LoadedRules

it('offers only the layouts of the two armies at the table', () => {
  const { options } = tableBattlefields(
    rules(layout('match', 'purge-vs-recon'), layout('other', 'purge-vs-take')),
    ['recon', 'purge'],
    2000,
    null,
  )
  expect(options).toEqual([{ patternId: 'dawn', terrainLayoutId: 'match' }])
})

it('leaves out a layout whose exact terrain has not loaded', () => {
  expect(tableBattlefields(rules(layout('rough', 'purge-vs-recon', false)), ['recon', 'purge'], 2000, null).options).toEqual([])
})

it('offers nothing when an army has not settled on a disposition', () => {
  expect(tableBattlefields(rules(layout('match', 'purge-vs-recon')), ['recon', null], 2000, null).options).toEqual([])
})
