import { expect, it } from 'vitest'
import { benchmarkRosters, defaultBenchmarkTargets, parseBenchmarkTargets, type CombatUnitIndex } from './benchmarks'

const expected = [
  ['Astra Militarum', 'Cadian Shock Troops'],
  ['Necrons', 'Necron Warriors'],
  ['Space Marines', 'Intercessor Squad'],
  ['Space Marines', 'Heavy Intercessor Squad'],
  ['Space Marines', 'Terminator Assault Squad'],
  ['Space Marines', 'Rhino'],
  ['Space Marines', 'Ballistus Dreadnought'],
  ['Astra Militarum', 'Leman Russ Battle Tank'],
  ['Space Marines', 'Land Raider'],
]

const index: CombatUnitIndex = [...new Set(expected.map(([faction]) => faction!))].map((name) => ({
  name,
  catalogueId: name,
  units: expected
    .filter(([faction]) => faction === name)
    .map(([, unitName]) => ({ id: unitName!, slug: unitName!, name: unitName!, points: 100 })),
}))

it('includes all nine requested benchmarks from their own factions', () => {
  expect(defaultBenchmarkTargets(index).targets.map((target) => [target.catalogueId, target.name])).toEqual(expected)
})
it('reports missing defaults without substituting similarly named units', () => {
  expect(defaultBenchmarkTargets(index.filter((book) => book.name !== 'Necrons')).missing).toEqual(['Necron Warriors'])
})
it('builds each mixed-faction benchmark in its own independent catalogue context', () => {
  expect(
    benchmarkRosters(defaultBenchmarkTargets(index).targets, index).map((roster) => [
      roster.catalogueId,
      roster.picks[0]!.entryId,
      roster.picks.length,
      roster.detachmentIds,
    ]),
  ).toEqual(expected.map(([faction, name]) => [faction, name, 1, []]))
})
it('retains custom model counts when restoring a target set', () => {
  const target = { catalogueId: 'Necrons', entryId: 'Necron Warriors', name: 'Necron Warriors', models: 20 }
  expect(benchmarkRosters(parseBenchmarkTargets(JSON.stringify([target]))!, index)[0]!.picks[0]!.models).toBe(20)
})
it.each([
  '{',
  JSON.stringify([{ catalogueId: 'Necrons', entryId: 'Necron Warriors', name: 'Necron Warriors', models: 0 }]),
  'x'.repeat(32_001),
  JSON.stringify(Array.from({ length: 51 }, () => ({ catalogueId: 'Necrons', entryId: 'Necron Warriors', name: 'Necron Warriors' }))),
])('refuses damaged or unbounded stored targets', (raw) => {
  expect(parseBenchmarkTargets(raw)).toBeNull()
})
it('refuses a removed benchmark rather than silently dropping it', () => {
  expect(() => benchmarkRosters([{ key: 'missing', catalogueId: 'old rules', entryId: 'gone', name: 'Missing unit' }], index)).toThrow(
    'Missing unit is unavailable',
  )
})
it('refuses an empty benchmark comparison', () => {
  expect(() => benchmarkRosters([], index)).toThrow('Add at least one')
})
