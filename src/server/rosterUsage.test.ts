import { expect, it, vi } from 'vitest'
import { leagueRosterFixture } from './leagueRoster.fixtures'
import { app } from './app'
import { ability, bookOf, points } from './catalogue.fixtures'
import { rosterForUse, rosterUseError, rosterUseProblem, withCurrentAlerts } from './rosterUsage'

vi.mock('./app', () => ({ app: vi.fn() }))

it.each(['preview', 'released', 'retired'] as const)('snapshots a %s league roster with its rules identity', async (status) => {
  const { saved, catalogue, rules, edition } = leagueRosterFixture(status)
  vi.mocked(app).mockReturnValue({
    service: { abilityReminders: async () => [], rosterService: { usableRoster: async () => ({ roster: saved, lentBy: null }) } },
    catalogueFor: async () => catalogue,
    rulesFor: async () => rules,
  } as never)
  const { snapshot } = await rosterForUse('player', 'roster')
  expect(snapshot.built?.edition).toEqual(edition)
})

const priced = {
  points: 2_000,
  detachmentError: null,
  dispositionError: null,
  errors: [],
  unhandled: ['catalogue rule could not be validated'],
}

it('allows roster validation warnings', () => {
  expect(rosterUseError(priced, { limit: 2_000 })).toBeNull()
})

it('rejects catalogue legality errors', () => {
  expect(rosterUseError({ ...priced, errors: [{ entryName: 'Captain', message: 'allows at most 1, has 2' }] }, { limit: 2_000 })).toBe(
    'Captain: allows at most 1, has 2',
  )
})

it('rejects rosters over their points limit', () => {
  expect(rosterUseError({ ...priced, points: 2_005 }, { limit: 2_000 })).toBe('roster has 2005 points, over its 2000-point limit')
})

it('allows an over-points roster that waived the points limit', () => {
  expect(rosterUseError({ ...priced, points: 2_005 }, { limit: 2_000, waivedRules: ['points-limit'] })).toBeNull()
})

it('still rejects other legality errors when the points limit is waived', () => {
  expect(
    rosterUseError(
      { ...priced, points: 2_005, detachmentError: 'Too many detachment points.' },
      { limit: 2_000, waivedRules: ['points-limit'] },
    ),
  ).toBe('Too many detachment points.')
})

it('names a list over its points limit as over the limit, before any other problem', () => {
  expect(rosterUseProblem({ ...priced, points: 2_005, detachmentError: 'Too many detachment points.' }, { limit: 2_000 })?.kind).toBe(
    'over-limit',
  )
})

it('names a list within its limit that breaks a rule as not legal', () => {
  expect(rosterUseProblem({ ...priced, detachmentError: 'Too many detachment points.' }, { limit: 2_000 })?.kind).toBe('not-legal')
})

it('rejects rosters without a valid force disposition', () => {
  expect(rosterUseError({ ...priced, dispositionError: 'Pick a disposition.' }, { limit: 2_000 })).toBe('Pick a disposition.')
})

it('rejects a saved roster with an obsolete detachment when it is used', async () => {
  vi.mocked(app).mockReturnValue({
    service: {
      abilityReminders: async () => [],
      rosterService: {
        usableRoster: vi.fn().mockResolvedValue({
          roster: {
            id: 'roster',
            name: 'Old list',
            catalogueId: 'cat',
            detachmentIds: ['old-detachment'],
            disposition: null,
            limit: 2_000,
            picks: [],
            waivedRules: ['warlord'],
          },
          lentBy: null,
        }),
      },
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
      abilityReminders: async () => [],
      rosterService: { usableRoster: vi.fn().mockResolvedValue({ roster: { id: 'roster' }, lentBy: null }) },
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
    waivedRules: ['warlord', 'points-limit'],
  }
  vi.mocked(app).mockReturnValue({
    service: {
      abilityReminders: async () => [],
      rosterService: { usableRoster: vi.fn().mockResolvedValue({ roster: saved, lentBy: null }) },
    },
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
    waivedRules: ['warlord', 'points-limit'],
  })
})

it('rejects a roster over its custom points budget though within its battle size', () => {
  expect(rosterUseError({ ...priced, points: 1_505 }, { limit: 2_000, pointsBudget: 1_500 })).toBe(
    'roster has 1505 points, over its 1500-point limit',
  )
})

it('allows a roster over its battle size within a larger custom budget', () => {
  expect(rosterUseError({ ...priced, points: 2_400 }, { limit: 2_000, pointsBudget: 2_500 })).toBeNull()
})

const lentRoster = {
  id: 'roster',
  name: 'Lent list',
  catalogueId: 'cat',
  detachmentIds: [],
  disposition: null,
  limit: 1_000,
  picks: [{ entryId: 'squad' }],
  waivedRules: ['warlord'],
}

const alert = {
  key: 'datasheet:charge',
  ability: 'Charge',
  description: '',
  timings: [{ moment: 'turn-start', phase: null, turn: 'your-turn' }],
}

function lentFrom(lentBy: { id: string; name: string } | null, settings: Record<string, (typeof alert)[]> = {}) {
  vi.mocked(app).mockReturnValue({
    service: {
      abilityReminders: async (userId: string) => settings[userId] ?? [],
      rosterService: { usableRoster: vi.fn().mockResolvedValue({ roster: lentRoster, lentBy }) },
    },
    catalogueFor: async () =>
      bookOf({
        selectionEntries: [{ id: 'squad', name: 'Squad', type: 'model', costs: points(100), profiles: [ability('charge', 'Charge')] }],
      }),
    rulesFor: async () => ({
      factionKeys: new Map(),
      detachmentReferences: new Map(),
      detachmentDetails: new Map(),
      factionRestrictions: new Map(),
    }),
  } as never)
}

it('names the friend who lent a roster in the battle snapshot', async () => {
  lentFrom({ id: 'owner', name: 'Owner' })
  const { snapshot } = await rosterForUse('borrower', 'roster', { lent: true })
  expect(snapshot.lentBy).toEqual({ id: 'owner', name: 'Owner' })
})

it('leaves the lender off a snapshot of an owned roster', async () => {
  lentFrom(null)
  const { snapshot } = await rosterForUse('owner', 'roster', { lent: true })
  expect(snapshot).not.toHaveProperty('lentBy')
})

it('refuses a lent roster where only owned rosters may be used', async () => {
  lentFrom({ id: 'owner', name: 'Owner' })
  const message = await rosterForUse('borrower', 'roster').catch((response: Response) => response.text())
  expect(message).toBe('you do not own this roster')
})

it('refuses a roster that is neither owned nor lent', async () => {
  vi.mocked(app).mockReturnValue({
    service: { abilityReminders: async () => [], rosterService: { usableRoster: vi.fn().mockResolvedValue(null) } },
  } as never)
  await expect(rosterForUse('stranger', 'roster', { lent: true })).rejects.toMatchObject({ status: 403 })
})

it('freezes the fielding player’s alert on each unit holding its ability', async () => {
  lentFrom(null, { owner: [alert] })
  const { snapshot } = await rosterForUse('owner', 'roster', { lent: true })
  expect(snapshot.reminders?.map((reminder) => reminder.unit)).toEqual([{ index: 0, name: 'Squad' }])
})

it('fields a borrower’s own alerts rather than the lender’s', async () => {
  const timed = (turn: string) => ({ ...alert, timings: [{ ...alert.timings[0]!, turn }] })
  lentFrom({ id: 'owner', name: 'Owner' }, { owner: [timed('opponent-turn')], borrower: [timed('your-turn')] })
  const { snapshot } = await rosterForUse('borrower', 'roster', { lent: true })
  expect(snapshot.reminders?.map((reminder) => reminder.timings[0]?.turn)).toEqual(['your-turn'])
})

it('seals a list without its player’s alerts', async () => {
  lentFrom(null, { owner: [alert] })
  const { snapshot } = await rosterForUse('owner', 'roster', { sealing: true })
  expect(snapshot.reminders).toEqual([])
})

it('fields alerts set after a list was sealed', async () => {
  lentFrom(null)
  const { snapshot: sealed } = await rosterForUse('owner', 'roster', { sealing: true })
  lentFrom(null, { owner: [alert] })
  const fielded = await withCurrentAlerts(sealed, 'owner')
  expect(fielded.reminders?.map((reminder) => reminder.unit)).toEqual([{ index: 0, name: 'Squad' }])
})
