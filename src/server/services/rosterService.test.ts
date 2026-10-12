import { expect, it, vi } from 'vitest'
import type { RepositoryPort } from '../spacetimeRepository'
import { RosterService } from './rosterService'
import { LOCKED_ROSTER_MESSAGE } from '../../core/rosterLock'

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

const edit = {
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

it('explains that a locked roster refused a save', async () => {
  const service = new RosterService({ saveRoster: vi.fn().mockResolvedValue('locked') } as unknown as RepositoryPort, () => 0)
  const refusal = await service.saveRoster('user-1', edit).catch((error: unknown) => error)
  expect(refusal instanceof Response && { status: refusal.status, message: await refusal.text() }).toEqual({
    status: 409,
    message: LOCKED_ROSTER_MESSAGE,
  })
})

it('reports the version a lock change wrote', async () => {
  const setRosterLocked = vi.fn().mockResolvedValue(true)
  const service = new RosterService(
    { setRosterLocked, roster: vi.fn().mockResolvedValue({ ...row, locked: true, updatedAt: 9 }) } as unknown as RepositoryPort,
    () => 8,
  )
  expect(await service.setRosterLocked('user-1', 'roster-1', true)).toEqual({ updatedAt: 9 })
  expect(setRosterLocked).toHaveBeenCalledWith('roster-1', 'user-1', true, 8)
})

it('refuses to lock a roster somebody else owns', async () => {
  const service = new RosterService({ setRosterLocked: vi.fn().mockResolvedValue(false) } as unknown as RepositoryPort, () => 0)
  const refusal = await service.setRosterLocked('user-2', 'roster-1', true).catch((error: unknown) => error)
  expect(refusal instanceof Response && refusal.status).toBe(403)
})

it('reads a library row saved before locking existed as unlocked', async () => {
  const { picks: _picks, prep: _prep, tags: _tags, userId: _userId, ...fields } = row
  const service = new RosterService(
    { rosterSummariesByUser: vi.fn().mockResolvedValue([{ ...fields, locked: null, unitCount: 0 }]) } as unknown as RepositoryPort,
    () => 0,
  )
  expect((await service.savedRosterSummaries('user-1'))[0]?.locked).toBe(false)
})
