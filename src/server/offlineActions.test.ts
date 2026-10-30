import { expect, it, vi } from 'vitest'
import { app } from './app'
import { offlineActions } from './offlineActions'
import { saveRosterSchema } from '../contracts/schemas'
import { sealedEventRosterFixture } from './sealedEventRoster.fixtures'

vi.mock('./app', () => ({ app: vi.fn() }))

it.each(['preview', 'released', 'retired'] as const)('submits a queued %s sealed event seal with frozen rules metadata', async (status) => {
  const { saved, catalogue, rules, edition } = sealedEventRosterFixture(status)
  const submit = vi.fn().mockResolvedValue({ format: '1v1', requiredLimit: 1000 })
  vi.mocked(app).mockReturnValue({
    telemetry: { capture: vi.fn() },
    repository: { abilityRemindersByUser: async () => [] },
    service: {
      rosterService: { usableRoster: async () => ({ roster: saved, lentBy: null }) },
      sealedEventService: { submitSealedEventRoster: submit },
    },
    catalogueFor: async () => catalogue,
    rulesFor: async () => rules,
  } as never)
  await offlineActions.submitLeagueRoster('player', {
    token: 'league',
    rosterId: saved.id,
    capturedRoster: saveRosterSchema.parse(saved),
    catalogueRevision: catalogue.index.revision,
  })
  expect(submit).toHaveBeenCalledWith(
    'league',
    'player',
    saved,
    expect.objectContaining({ built: expect.objectContaining({ edition }) }),
    undefined,
  )
})

it('seals a roster a device captured before its alerts moved to the account', async () => {
  const { saved, catalogue, rules } = sealedEventRosterFixture('released')
  const submit = vi.fn().mockResolvedValue({ format: '1v1', requiredLimit: 1000 })
  const prep = { stratagems: [], secondaries: [], remindersEnabled: true }
  vi.mocked(app).mockReturnValue({
    telemetry: { capture: vi.fn() },
    repository: { abilityRemindersByUser: async () => [] },
    service: {
      rosterService: { usableRoster: async () => ({ roster: { ...saved, prep }, lentBy: null }) },
      sealedEventService: { submitSealedEventRoster: submit },
    },
    catalogueFor: async () => catalogue,
    rulesFor: async () => rules,
  } as never)
  const reminder = {
    key: 'datasheet:charge:0',
    ability: 'Charge',
    description: '',
    unit: { index: 0, name: 'Squad' },
    timings: [{ moment: 'turn-start', phase: null, turn: 'your-turn' }],
  }
  await offlineActions.submitLeagueRoster('player', {
    token: 'league',
    rosterId: saved.id,
    capturedRoster: saveRosterSchema.parse({ ...saved, prep: { ...prep, reminders: [reminder] } }),
    catalogueRevision: catalogue.index.revision,
  })
  expect(submit).toHaveBeenCalled()
})
