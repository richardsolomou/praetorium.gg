import { expect, it } from 'vitest'
import { migrateSavedLeague } from './savedLeagues'

it.each([{ ids: [] }, { ids: ['admin'] }, { ids: ['admin', 'other'] }])('preserves current admin membership $ids', ({ ids }) => {
  const league = { admins: ids.map((id) => ({ id, name: id, image: null })) }
  expect(migrateSavedLeague(league)).toBe(league)
})

it.each([{ ids: [] }, { ids: ['admin'] }, { ids: ['admin', 'other'] }])('preserves current summary admin IDs $ids', ({ ids }) => {
  const summary = { adminIds: ids }
  expect(migrateSavedLeague(summary, 'adminIds')).toBe(summary)
})

it.each(['admins', 'adminIds'] as const)('gives a league saved before admins an empty %s list', (field) => {
  expect(migrateSavedLeague({ name: 'League' }, field)).toEqual({ name: 'League', [field]: [] })
})
