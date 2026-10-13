import { expect, it } from 'vitest'
import { Route } from './search'

const validate = Route.options.validateSearch as (search: Record<string, unknown>) => { q: string }

it('preserves punctuation and spaces while typing unit names', () => {
  expect(validate({ q: "C'tan Shard " })).toEqual({ q: "C'tan Shard " })
})

it.each([undefined, 42, ['Immortals'], { name: 'Immortals' }])('ignores a non-string search value %j', (q) => {
  expect(validate({ q })).toEqual({ q: '' })
})

it('bounds browser queries to the existing search limit', () => {
  expect(validate({ q: 'a'.repeat(81) }).q).toHaveLength(80)
})
