import { expect, it } from 'vitest'
import { Route } from './rosters.index'

const validate = Route.options.validateSearch as (search: Record<string, unknown>) => Record<string, unknown>

it('keeps a request for a new roster with the library filters', () => {
  expect(validate({ new: true, limit: 2000 })).toEqual({ new: true, limit: 2000 })
})

it.each([1, '1', 'yes'])('ignores a new roster request of %j', (value) => {
  expect(validate({ new: value })).toEqual({})
})

it('leaves a new roster request out of the friends and public views', () => {
  expect(validate({ new: true, view: 'public' })).toEqual({ view: 'public' })
})
