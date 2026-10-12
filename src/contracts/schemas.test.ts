import { expect, it } from 'vitest'
import { saveRosterSchema } from './schemas'

const roster = { name: 'Army', catalogueId: 'necrons', detachmentIds: [], disposition: null, limit: 2000, picks: [], prep: null }

it('keeps a custom points budget beside the battle size', () => {
  expect(saveRosterSchema.parse({ ...roster, pointsBudget: 1500 })).toMatchObject({ limit: 2000, pointsBudget: 1500 })
})

it('saves a budget equal to the battle size as the standard total', () => {
  expect(saveRosterSchema.parse({ ...roster, pointsBudget: 2000 }).pointsBudget).toBeNull()
})

it('leaves an unstated budget unstated, so a save from an older client keeps the stored one', () => {
  expect(saveRosterSchema.parse(roster)).not.toHaveProperty('pointsBudget')
})

it.each([499, 10_001, 1500.5])('refuses a %s-point budget', (pointsBudget) => {
  expect(saveRosterSchema.safeParse({ ...roster, pointsBudget }).success).toBe(false)
})

it('refuses a custom budget for a battle size with a fixed points total', () => {
  expect(saveRosterSchema.safeParse({ ...roster, limit: 600, pointsBudget: 750 }).success).toBe(false)
})
