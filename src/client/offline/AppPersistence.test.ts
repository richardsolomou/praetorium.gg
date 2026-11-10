import { expect, it } from 'vitest'
import { RECENT_ANSWER_MS, refreshesSavedQuery } from './AppPersistence'

const now = 1_000_000
const answered = (queryKey: readonly unknown[], dataUpdatedAt = 0) => ({ queryKey, state: { dataUpdatedAt } })

it('asks for a saved battle again when saved screens refresh', () => {
  expect(refreshesSavedQuery(answered(['battle', 'token']), now)).toBe(true)
})

it('keeps a saved roster price when saved screens refresh, since its key holds every input', () => {
  expect(refreshesSavedQuery(answered(['price', 'catalogue', [], null, 1000, [], null, [], 'unit-limits', []]), now)).toBe(false)
})

it('keeps a saved list the service answered moments ago', () => {
  expect(refreshesSavedQuery(answered(['battles'], now - RECENT_ANSWER_MS + 1), now)).toBe(false)
})

it('asks again for a saved list answered before that', () => {
  expect(refreshesSavedQuery(answered(['battles'], now - RECENT_ANSWER_MS), now)).toBe(true)
})
