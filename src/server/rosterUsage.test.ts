import { expect, it, vi } from 'vitest'
import { app } from './app'
import { rosterForUse, rosterUseError } from './rosterUsage'

vi.mock('./app', () => ({ app: vi.fn() }))

const priced = {
  points: 2_000,
  detachmentError: null,
  dispositionError: null,
  errors: [],
  unhandled: ['catalogue rule could not be validated'],
}

it('allows roster validation warnings', () => {
  expect(rosterUseError(priced, 2_000)).toBeNull()
})

it('rejects catalogue legality errors', () => {
  expect(rosterUseError({ ...priced, errors: [{ entryName: 'Captain', message: 'allows at most 1, has 2' }] }, 2_000)).toBe(
    'Captain: allows at most 1, has 2',
  )
})

it('rejects rosters over their points limit', () => {
  expect(rosterUseError({ ...priced, points: 2_005 }, 2_000)).toBe('roster has 2005 points, over its 2000-point limit')
})

it('rejects rosters without a valid force disposition', () => {
  expect(rosterUseError({ ...priced, dispositionError: 'Pick a disposition.' }, 2_000)).toBe('Pick a disposition.')
})

it('does not snapshot a roster when the rules source is unavailable', async () => {
  vi.mocked(app).mockReturnValue({
    service: {
      ownRoster: vi.fn().mockResolvedValue({ id: 'roster' }),
    },
    catalogue: () => ({}),
    rules: () => null,
  } as never)

  await expect(rosterForUse('player', 'roster')).rejects.toMatchObject({ status: 409 })
})
