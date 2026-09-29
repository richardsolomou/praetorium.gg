import { expect, it, vi } from 'vitest'
import type { RepositoryPort } from '../spacetimeRepository'
import { RosterService } from './rosterService'

const row = {
  id: 'roster-1',
  userId: 'user-1',
  name: 'Army',
  automaticName: true,
  catalogueId: 'faction',
  detachmentId: '[]',
  disposition: null,
  limit: 2000,
  picks: '[]',
  prep: 'unused preparation data',
  tags: '[]',
  waivedRules: '[]',
  optionalRules: '[]',
  borrowedDetachmentId: null,
  visibility: 'private',
  source: 'editable',
  createdAt: 1,
  updatedAt: 2,
} as const

it('builds a library summary from compact data without reading full rosters', async () => {
  const rostersByUser = vi.fn()
  const { picks: _picks, prep: _prep, tags: _tags, userId: _userId, ...fields } = row
  const rosterSummariesByUser = vi.fn().mockResolvedValue([{ ...fields, unitCount: 2 }])
  const service = new RosterService({ rostersByUser, rosterSummariesByUser } as unknown as RepositoryPort, () => 0)
  expect(await service.savedRosterSummaries('user-1')).toMatchObject([{ id: 'roster-1', unitCount: 2, name: 'Army' }])
  expect(rostersByUser).not.toHaveBeenCalled()
})

it('loads a bounded roster page without reading the full library', async () => {
  const rostersByUser = vi.fn()
  const rostersByIds = vi.fn().mockResolvedValue([row])
  const service = new RosterService({ rostersByUser, rostersByIds } as unknown as RepositoryPort, () => 0)
  expect(await service.savedRostersByIds('user-1', ['roster-1'])).toMatchObject([{ id: 'roster-1', prep: null }])
  expect(rostersByIds).toHaveBeenCalledWith('user-1', ['roster-1'])
  expect(rostersByUser).not.toHaveBeenCalled()
})

it('reports the write time it stored on a saved roster', async () => {
  const saveRoster = vi.fn().mockResolvedValue('updated')
  const service = new RosterService({ saveRoster } as unknown as RepositoryPort, () => 1_234)
  const roster = {
    id: 'roster-1',
    name: 'Army',
    catalogueId: 'faction',
    detachmentIds: [],
    disposition: null,
    limit: 2000,
    picks: [],
    prep: null,
    visibility: 'private',
    source: 'editable',
  } as const

  const { updatedAt } = await service.saveRoster('user-1', roster)

  expect(updatedAt).toBe(saveRoster.mock.calls[0]![0].now)
})
