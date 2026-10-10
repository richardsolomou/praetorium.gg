import { expect, it, vi } from 'vitest'
import { app } from './app'
import { offlineActions } from './offlineActions'
import { saveRosterSchema } from '../contracts/schemas'

vi.mock('./app', () => ({ app: vi.fn() }))

it('refuses a queued preview league seal before any server write', async () => {
  const submit = vi.fn()
  vi.mocked(app).mockReturnValue({
    service: { ownRoster: async () => ({ catalogueId: 'codex~cat' }), submitLeagueRoster: submit },
    catalogueFor: async () => ({ edition: { status: 'preview' } }),
  } as never)
  const capturedRoster = saveRosterSchema.parse({
    name: 'Army',
    catalogueId: 'codex~cat',
    detachmentIds: [],
    disposition: null,
    limit: 1000,
    picks: [],
    prep: null,
  })
  const message = await offlineActions
    .submitLeagueRoster('player', {
      token: 'league',
      rosterId: 'roster',
      capturedRoster,
      catalogueRevision: 'revision',
    })
    .catch((response: Response) => response.text())
  expect(message).toBe('preview codex rules cannot be submitted to a league')
  expect(submit).not.toHaveBeenCalled()
})
