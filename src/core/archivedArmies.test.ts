import { expect, it } from 'vitest'
import { archivedArmies } from './archivedArmies'

it('names an army whose every roster is archived', () => {
  expect([...archivedArmies([{ catalogueId: 'necrons', archived: true }])]).toEqual(['necrons'])
})

it('keeps an army with any roster still in use', () => {
  expect(
    archivedArmies([
      { catalogueId: 'necrons', archived: true },
      { catalogueId: 'necrons', archived: false },
    ]).size,
  ).toBe(0)
})
