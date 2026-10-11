import { expect, it } from 'vitest'
import {
  collectionDemands,
  collectionRequirements,
  collectionShortages,
  matchesCollectionUpdate,
  updateCollectionStock,
  type CollectionLot,
} from './collection'

const lot = (models: number, builds = ['a'], id = 'd450802f-ae93-4b1c-af7f-a6ba202ab050'): CollectionLot => ({
  id,
  name: 'Physical stock',
  models,
  builds,
})
const demand = (key: string, models: number) => ({ key, models, entryId: key, name: key, equipment: 'Equipment' })

it.each([0, 1, 2])('persists %i physical models without turning a legacy owned mark into stock', (models) => {
  const saved = updateCollectionStock([], { lot: lot(models), expected: null, remove: false })
  expect(collectionShortages([demand('a', 2)], JSON.parse(JSON.stringify(saved)))[0]?.missing).toBe(2 - models)
})
it('allocates shared models only once across simultaneous units', () => {
  expect(collectionShortages([demand('a', 5), demand('b', 5)], [lot(5, ['a', 'b'])]).map((row) => row.missing)).toEqual([0, 5])
})
it('reallocates shared stock when dedicated models can satisfy the first build', () => {
  expect(
    collectionShortages([demand('a', 5), demand('b', 5)], [lot(5, ['a', 'b']), lot(5, ['a'], 'e0bc2518-3c25-4e73-a18f-a2f666ea9cd5')]).map(
      (row) => row.missing,
    ),
  ).toEqual([0, 0])
})
it('does not substitute models with different equipment', () => {
  expect(collectionShortages([demand('rifle', 8), demand('special', 2)], [lot(10, ['rifle'])]).map((row) => row.missing)).toEqual([0, 2])
})
it('compares quantities after a model-count edit', () => {
  expect(collectionShortages([demand('a', 10)], [lot(5)])[0]?.missing).toBe(5)
})
it('leaves stock available for review when a rules version changes the model identity', () => {
  expect(collectionShortages([demand('new-id', 5)], [lot(5)])[0]?.missing).toBe(5)
})
it('does not claim ambiguous equipment allocation can be supplied', () => {
  expect(collectionDemands('a', 'Squad', [{ name: 'Body', models: 5, weapons: [{ name: 'Rifle', count: 3 }] }], 5)[0]?.key).toBeNull()
})
it('does not silently omit selected equipment whose model allocation is unavailable', () => {
  expect(
    collectionDemands('a', 'Squad', [{ name: 'Body', models: 1, weapons: [{ name: 'Sword', count: 1 }] }], 1, [
      { name: 'Shield', count: 1 },
    ])[0]?.key,
  ).toBeNull()
})
it('recognizes the same equipped model when unit size changes', () => {
  const build = (models: number) =>
    collectionDemands('a', 'Squad', [{ name: 'Body', models, weapons: [{ name: 'Rifle', count: models }] }], models)[0]?.key
  expect(build(5)).toBe(build(10))
})
it('refuses an update based on stock another device changed', () => {
  expect(matchesCollectionUpdate(lot(2), { lot: lot(3), expected: lot(1), remove: false })).toBe(false)
})
it('removes only the selected stock lot', () => {
  expect(updateCollectionStock([lot(1)], { lot: lot(1), expected: lot(1), remove: true })).toEqual([])
})

it('combines identical equipped models into one physical requirement', () => {
  expect(collectionRequirements([demand('a', 1), demand('a', 2), demand('b', 1)]).map((row) => row.models)).toEqual([3, 1])
})
