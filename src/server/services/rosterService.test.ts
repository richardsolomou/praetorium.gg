import { describe, expect, it, vi } from 'vitest'
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

it('reports the persisted version when the database advances it beyond the clock', async () => {
  const saveRoster = vi.fn().mockResolvedValue('updated')
  const service = new RosterService(
    { saveRoster, roster: vi.fn().mockResolvedValue({ ...row, updatedAt: 1_235 }) } as unknown as RepositoryPort,
    () => 1_234,
  )
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

  expect(updatedAt).toBe(1_235)
})

it('retains the original Marine codex for a library summary saved against it', async () => {
  const { picks: _picks, prep: _prep, tags: _tags, userId: _userId, ...fields } = row
  const rosterSummariesByUser = vi.fn().mockResolvedValue([{ ...fields, catalogueId: 'a603-5039-f08d-e841', unitCount: 1 }])
  const service = new RosterService({ rosterSummariesByUser } as unknown as RepositoryPort, () => 0)
  expect(await service.savedRosterSummaries('user-1')).toMatchObject([{ catalogueId: 'legacy-profiles~a603-5039-f08d-e841' }])
})

describe('unit notes on a shared roster', () => {
  const picks = JSON.stringify([
    { entryId: 'intercessors', nickname: 'Alpha', note: 'Hold home.' },
    { entryId: 'intercessors', nickname: 'Bravo', note: 'Push midfield.' },
  ])
  const prep = (shareNotes?: boolean) =>
    JSON.stringify({ stratagems: [], secondaries: [], ...(shareNotes === undefined ? {} : { shareNotes }) })
  const read = async (saved: { picks: string; prep: string | null; visibility: 'private' | 'unlisted' | 'public' }, readerId: string) => {
    const service = new RosterService({ roster: vi.fn().mockResolvedValue({ ...row, ...saved }) } as unknown as RepositoryPort, () => 0)
    return (await service.rosterAccess('roster-1', readerId))?.roster.picks
  }

  it('shows another reader of a public roster the nicknames', async () => {
    expect((await read({ picks, prep: prep(), visibility: 'public' }, 'user-2'))?.map((pick) => pick.nickname)).toEqual(['Alpha', 'Bravo'])
  })

  it('keeps notes from another reader of a public roster', async () => {
    expect((await read({ picks, prep: prep(), visibility: 'public' }, 'user-2'))?.map((pick) => pick.note)).toEqual([undefined, undefined])
  })

  it('keeps notes from another reader of an unlisted roster with no preparation saved', async () => {
    expect((await read({ picks, prep: null, visibility: 'unlisted' }, 'user-2'))?.map((pick) => pick.note)).toEqual([undefined, undefined])
  })

  it('shows another reader the notes once the owner shares them', async () => {
    expect((await read({ picks, prep: prep(true), visibility: 'unlisted' }, 'user-2'))?.map((pick) => pick.note)).toEqual([
      'Hold home.',
      'Push midfield.',
    ])
  })

  it('shows the owner their notes on a private roster', async () => {
    expect((await read({ picks, prep: prep(), visibility: 'private' }, 'user-1'))?.map((pick) => pick.note)).toEqual([
      'Hold home.',
      'Push midfield.',
    ])
  })
})
