import { expect, it } from 'vitest'
import { STARTUP_BUDGET_MS, startupRemainingMs } from './startupBudget'

it('leaves later startup waits only what earlier ones did not use', () => {
  expect(startupRemainingMs(20 * 60_000)).toBe(STARTUP_BUDGET_MS - 20 * 60_000)
})

it('leaves no time once the process has used the whole budget', () => {
  expect(startupRemainingMs(STARTUP_BUDGET_MS + 1)).toBe(0)
})

it('counts the budget from process start', () => {
  expect(startupRemainingMs()).toBeLessThan(STARTUP_BUDGET_MS)
})

it('leaves whole milliseconds for a timeout signal', () => {
  expect(Number.isInteger(startupRemainingMs(0.5))).toBe(true)
})
