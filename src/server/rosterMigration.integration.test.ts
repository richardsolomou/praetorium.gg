import { beforeEach, expect, it, vi } from 'vitest'
import { offlineActions } from './offlineActions'
import { saveRosterSchema } from '../contracts/schemas'
import { rosterForUse } from './rosterUsage'
import { app } from './app'

vi.mock('./app', () => ({ app: vi.fn() }))
vi.mock('./rosterUsage', () => ({ rosterForUse: vi.fn(), withCurrentAlerts: vi.fn() }))

const book = '2261-79a5-19d9-1668'
const raw = {
  id: 'roster',
  name: 'Army',
  catalogueId: `current-rosters~${book}`,
  detachmentIds: ['3caf-c168-c372-51b1'],
  disposition: null,
  limit: 1000,
  picks: [],
  prep: null,
}
const submit = vi.fn()
beforeEach(() => {
  submit.mockReset().mockResolvedValue({ format: '1v1', requiredLimit: 1000 })
  vi.mocked(app).mockReturnValue({
    catalogueFor: async () => ({ index: { revision: 'revision' } }),
    service: { sealedEventService: { submitSealedEventRoster: submit } },
    telemetry: { capture: vi.fn() },
  } as never)
})
function saved(catalogueId: string) {
  vi.mocked(rosterForUse).mockResolvedValue({
    saved: { ...saveRosterSchema.parse(raw), catalogueId },
    snapshot: { name: 'Army' },
  } as never)
}
function seal(catalogueId = raw.catalogueId) {
  return offlineActions.submitSealedEventRoster('player', {
    token: 'event',
    rosterId: 'roster',
    capturedRoster: { ...raw, catalogueId },
    catalogueRevision: 'revision',
  })
}
it('refuses a queued folded capture when the saved roster uses retained rules', async () => {
  saved(`legacy-rosters~${book}`)
  await expect(seal()).rejects.toMatchObject({ status: 409 })
})
it('seals a queued folded capture against the current roster it captured', async () => {
  saved(book)
  await seal()
  expect(submit).toHaveBeenCalledWith('event', 'player', expect.objectContaining({ catalogueId: book }), { name: 'Army' }, undefined)
})
it('seals a capture the device already resolved to the current roster', async () => {
  saved(book)
  await seal(book)
  expect(submit).toHaveBeenCalledWith('event', 'player', expect.objectContaining({ catalogueId: book }), { name: 'Army' }, undefined)
})
it('still recognizes plain older input when checking a queued retained roster', async () => {
  saved(`legacy-rosters~${book}`)
  await seal(book)
  expect(submit).toHaveBeenCalledWith(
    'event',
    'player',
    expect.objectContaining({ catalogueId: `legacy-rosters~${book}` }),
    { name: 'Army' },
    undefined,
  )
})
