import { expect, it } from 'vitest'
import { matchesQuery } from './RosterSetupDialog'

it('finds a detachment whose name was typed without its accents', () => {
  expect(matchesQuery({ name: 'Ynnari Côterie', dispositions: [] }, 'coterie')).toBe(true)
})
