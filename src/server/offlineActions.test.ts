import { expect, it, vi } from 'vitest'
import { app } from './app'
import { offlineActions } from './offlineActions'
import { saveRosterSchema } from '../contracts/schemas'
import { leagueRosterFixture } from './leagueRoster.fixtures'

vi.mock('./app', () => ({ app: vi.fn() }))

it.each(['preview', 'released', 'retired'] as const)('submits a queued %s league seal with frozen rules metadata', async (status) => {
  const { saved, catalogue, rules, edition } = leagueRosterFixture(status)
  const submit = vi.fn()
  vi.mocked(app).mockReturnValue({
    service: {
      rosterService: { usableRoster: async () => ({ roster: saved, lentBy: null }) },
      leagueService: { submitLeagueRoster: submit },
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
