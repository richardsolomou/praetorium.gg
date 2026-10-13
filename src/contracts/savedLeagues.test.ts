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
