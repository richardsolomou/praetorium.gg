import { expect, it } from 'vitest'
import { assertMatchingProjections } from './catalogueProjections'

const first = { projection: 'canonical', sha256: 'a'.repeat(64) }
const second = { projection: 'edition:rules', sha256: 'b'.repeat(64) }
const jsonl = (...records: object[]) => records.map((record) => JSON.stringify(record)).join('\n')

it('accepts identical projections in a different order with diagnostic records', () => {
  expect(() => assertMatchingProjections(jsonl({ stage: 'ready' }, first, second), jsonl(second, first))).not.toThrow()
})

it('rejects changed runtime data', () => {
  expect(() => assertMatchingProjections(jsonl(first), jsonl({ ...first, sha256: 'c'.repeat(64) }))).toThrow('projections differ')
})

it('rejects an omitted runtime projection', () => {
  expect(() => assertMatchingProjections(jsonl(first, second), jsonl(first))).toThrow('projections differ')
})

it('rejects duplicate projection identities', () => {
  expect(() => assertMatchingProjections(jsonl(first, first), jsonl(first))).toThrow('Duplicate projection hashes')
})

it('rejects empty diagnostic output on both sides', () => {
  expect(() => assertMatchingProjections(jsonl({ stage: 'ready' }), jsonl({ stage: 'ready' }))).toThrow('No projection hashes')
})

it('rejects a malformed projection hash', () => {
  expect(() => assertMatchingProjections(jsonl({ ...first, sha256: 'short' }), jsonl(first))).toThrow('Invalid projection hash')
})
