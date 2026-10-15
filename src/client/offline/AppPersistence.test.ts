import { expect, it } from 'vitest'
import { refreshesSavedQuery } from './AppPersistence'

it('asks for a saved battle again when saved screens refresh', () => {
  expect(refreshesSavedQuery(['battle', 'token'])).toBe(true)
})

it('keeps a saved roster price when saved screens refresh, since its key holds every input', () => {
  expect(refreshesSavedQuery(['price', 'catalogue', [], null, 1000, [], null, [], 'unit-limits', []])).toBe(false)
})
