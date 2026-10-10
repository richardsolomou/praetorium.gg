import { expect, it, vi } from 'vitest'
import { app } from './app'
import { bookOf, points } from './catalogue.fixtures'
import { rosterForUse, rosterUseError, rosterUseProblem } from './rosterUsage'

vi.mock('./app', () => ({ app: vi.fn() }))

it('refuses a preview league roster before trying to price it', async () => {
  vi.mocked(app).mockReturnValue({
    service: { ownRoster: async () => ({ catalogueId: 'codex~cat' }) },
    catalogueFor: async () => ({ edition: { status: 'preview' } }),
  } as never)
  const message = await rosterForUse('player', 'roster', { releasedOnly: true }).catch((response: Response) => response.text())
  expect(message).toBe('preview codex rules cannot be submitted to a league')
})

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

it('allows an over-points roster that waived the points limit', () => {
  expect(rosterUseError({ ...priced, points: 2_005 }, 2_000, ['points-limit'])).toBeNull()
})

it('still rejects other legality errors when the points limit is waived', () => {
  expect(rosterUseError({ ...priced, points: 2_005, detachmentError: 'Too many detachment points.' }, 2_000, ['points-limit'])).toBe(
    'Too many detachment points.',
  )
})

it('names a list over its points limit as over the limit, before any other problem', () => {
  expect(rosterUseProblem({ ...priced, points: 2_005, detachmentError: 'Too many detachment points.' }, 2_000)?.kind).toBe('over-limit')
})

it('names a list within its limit that breaks a rule as not legal', () => {
  expect(rosterUseProblem({ ...priced, detachmentError: 'Too many detachment points.' }, 2_000)?.kind).toBe('not-legal')
})

it('rejects rosters without a valid force disposition', () => {
  expect(rosterUseError({ ...priced, dispositionError: 'Pick a disposition.' }, 2_000)).toBe('Pick a disposition.')
})

it('rejects a saved roster with an obsolete detachment when it is used', async () => {
  vi.mocked(app).mockReturnValue({
    service: {
      ownRoster: vi.fn().mockResolvedValue({
        id: 'roster',
        name: 'Old list',
        catalogueId: 'cat',
        detachmentIds: ['old-detachment'],
        disposition: null,
        limit: 2_000,
        picks: [],
        waivedRules: [],
      }),
    },
    catalogueFor: async () => bookOf({ selectionEntries: [{ id: 'unit', name: 'Unit', type: 'unit' }] }),
    rulesFor: async () => ({
      factionKeys: new Map(),
      detachmentReferences: new Map(),
      detachmentDetails: new Map(),
      factionRestrictions: new Map(),
    }),
  } as never)

  const message = await rosterForUse('player', 'roster').then(
    () => '',
    (response: Response) => response.text(),
  )
  expect(message).toBe(
    'fix roster errors before using it: This roster has a detachment that is no longer available. Choose a current detachment.',
  )
})

it('does not snapshot a roster when the rules source is unavailable', async () => {
  vi.mocked(app).mockReturnValue({
    service: {
      ownRoster: vi.fn().mockResolvedValue({ id: 'roster' }),
    },
    catalogueFor: async () => ({}),
    rulesFor: async () => null,
  } as never)

  await expect(rosterForUse('player', 'roster')).rejects.toMatchObject({ status: 409 })
})

it('snapshots an over-points saved roster when its points limit is waived', async () => {
  const saved = {
    id: 'roster',
    name: 'Test roster',
    catalogueId: 'cat',
    detachmentIds: [],
    disposition: null,
    limit: 1_000,
    picks: [{ entryId: 'squad' }],
    waivedRules: ['points-limit'],
  }
  vi.mocked(app).mockReturnValue({
    service: { ownRoster: vi.fn().mockResolvedValue(saved) },
    catalogueFor: async () => bookOf({ selectionEntries: [{ id: 'squad', name: 'Squad', type: 'model', costs: points(1_080) }] }),
    rulesFor: async () => ({
      factionKeys: new Map(),
      detachmentReferences: new Map(),
      detachmentDetails: new Map(),
      factionRestrictions: new Map(),
    }),
  } as never)

  const { snapshot } = await rosterForUse('player', 'roster')
  expect({ points: snapshot.text.split('\n')[0], waivedRules: snapshot.built?.waivedRules }).toEqual({
    points: '1080 / 1000 pts',
    waivedRules: ['points-limit'],
  })
})
