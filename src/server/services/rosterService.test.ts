import { describe, expect, it, vi } from 'vitest'
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

describe('unit notes on a shared roster', () => {
  const picks = JSON.stringify([
    { entryId: 'intercessors', nickname: 'Alpha', note: 'Hold home.' },
    { entryId: 'intercessors', note: 'Push midfield.' },
  ])
  const prep = (shareNotes?: boolean) =>
    JSON.stringify({ stratagems: [], secondaries: [], ...(shareNotes === undefined ? {} : { shareNotes }) })
  const read = async (saved: { picks: string; prep: string | null; visibility: 'private' | 'unlisted' | 'public' }, readerId: string) => {
    const service = new RosterService({ roster: vi.fn().mockResolvedValue({ ...row, ...saved }) } as unknown as RepositoryPort, () => 0)
    return (await service.rosterAccess('roster-1', readerId))?.roster.picks
  }

  it('keeps notes from another reader of a public roster', async () => {
    expect((await read({ picks, prep: prep(), visibility: 'public' }, 'user-2'))?.map((pick) => pick.note)).toEqual([undefined, undefined])
  })

  it('keeps notes from another reader of an unlisted roster with no preparation saved', async () => {
    expect((await read({ picks, prep: null, visibility: 'unlisted' }, 'user-2'))?.map((pick) => pick.note)).toEqual([undefined, undefined])
  })

  it('keeps notes from another reader of a roster saved while its notes were shared', async () => {
    expect((await read({ picks, prep: prep(true), visibility: 'unlisted' }, 'user-2'))?.map((pick) => pick.note)).toEqual([
      undefined,
      undefined,
    ])
  })

  it('shows the owner their notes on a private roster', async () => {
    expect((await read({ picks, prep: prep(), visibility: 'private' }, 'user-1'))?.map((pick) => pick.note)).toEqual([
      'Hold home.',
      'Push midfield.',
    ])
  })

  it('leaves out a unit nickname saved before nicknames were removed', async () => {
    expect((await read({ picks, prep: prep(), visibility: 'private' }, 'user-1'))?.[0]).not.toHaveProperty('nickname')
  })
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

it('reports the version an archive change wrote', async () => {
  const setRosterArchived = vi.fn().mockResolvedValue(true)
  const service = new RosterService(
    { setRosterArchived, roster: vi.fn().mockResolvedValue({ ...row, archived: true, updatedAt: 9 }) } as unknown as RepositoryPort,
    () => 8,
  )
  expect(await service.setRosterArchived('user-1', 'roster-1', true)).toEqual({ updatedAt: 9 })
  expect(setRosterArchived).toHaveBeenCalledWith('roster-1', 'user-1', true, 8)
})

it('refuses to archive a roster somebody else owns', async () => {
  const service = new RosterService({ setRosterArchived: vi.fn().mockResolvedValue(false) } as unknown as RepositoryPort, () => 0)
  const refusal = await service.setRosterArchived('user-2', 'roster-1', true).catch((error: unknown) => error)
  expect(refusal instanceof Response && refusal.status).toBe(403)
})

it('reads a migrated library row as unlocked', async () => {
  const { picks: _picks, prep: _prep, tags: _tags, userId: _userId, ...fields } = row
  const service = new RosterService(
    { rosterSummariesByUser: vi.fn().mockResolvedValue([{ ...fields, locked: false, unitCount: 0 }]) } as unknown as RepositoryPort,
    () => 0,
  )
  expect((await service.savedRosterSummaries('user-1'))[0]?.locked).toBe(false)
})

describe('public roster discovery', () => {
  const picks = JSON.stringify([{ entryId: 'intercessors', nickname: 'Alpha', note: 'Hold home.' }])
  const prep = JSON.stringify({
    stratagems: [],
    secondaries: [],
    shareNotes: true,
    reminders: [
      {
        key: 'r',
        ability: 'Oath',
        description: 'Pick a target.',
        timings: [{ moment: 'phase-start', phase: 'command', turn: 'your-turn' }],
      },
    ],
  })
  const listed = { ...row, visibility: 'public' as const, picks, prep, baseRosterId: 'unlisted-base' }
  const discover = async (rows: (typeof listed)[], names = new Map([['user-1', { id: 'user-1', name: 'Owner' }]])) => {
    const discoverRosters = vi.fn().mockResolvedValue({ rows, nextCursor: { at: 2, id: 'roster-1' } })
    const namesByIds = vi.fn().mockResolvedValue(names)
    const service = new RosterService({ discoverRosters, namesByIds } as unknown as RepositoryPort, () => 0)
    return service.discoverRosters({ audience: 'public', viewerId: null, catalogueIds: null, detachmentIds: null, before: null, limit: 24 })
  }

  it('names the owner of a discovered roster', async () => {
    expect((await discover([listed])).rosters.map((entry) => entry.owner.name)).toEqual(['Owner'])
  })

  it('leaves out a roster whose owner has no account', async () => {
    expect((await discover([listed], new Map())).rosters).toEqual([])
  })

  it('keeps the next page cursor when a roster is left out', async () => {
    expect((await discover([listed], new Map())).nextCursor).toEqual({ at: 2, id: 'roster-1' })
  })

  it('keeps unit notes and reminders out of a discovered roster summary', async () => {
    const [entry] = (await discover([listed])).rosters
    expect(JSON.stringify(entry!.summary)).not.toMatch(/Hold home|Pick a target/)
  })

  it('keeps the variant base out of a discovered roster summary', async () => {
    expect((await discover([listed])).rosters[0]!.summary.baseRosterId).toBeNull()
  })

  it('keeps the variant base out of a public profile roster', async () => {
    const publicRostersByUser = vi.fn().mockResolvedValue([listed])
    const service = new RosterService({ publicRostersByUser } as unknown as RepositoryPort, () => 0)
    expect((await service.publicRosters('user-1')).summaries[0]!.baseRosterId).toBeNull()
  })

  it('keeps the variant base from another reader of a public roster', async () => {
    const service = new RosterService({ roster: vi.fn().mockResolvedValue(listed) } as unknown as RepositoryPort, () => 0)
    expect((await service.rosterAccess('roster-1', 'user-2'))?.roster.baseRosterId).toBeNull()
  })

  it('shows the owner their own variant base', async () => {
    const service = new RosterService({ roster: vi.fn().mockResolvedValue(listed) } as unknown as RepositoryPort, () => 0)
    expect((await service.rosterAccess('roster-1', 'user-1'))?.roster.baseRosterId).toBe('unlisted-base')
  })
})

describe('the roster a copy came from', () => {
  const source = (visibility: 'private' | 'unlisted' | 'public', lentBy: string | null = null) => {
    const stored = { ...row, id: 'source', name: 'Original army', prep: null, visibility }
    const roster = vi.fn().mockResolvedValue(stored)
    const usableRoster = vi.fn().mockResolvedValue(lentBy ? { roster: stored, lentBy } : null)
    const namesByIds = vi.fn().mockResolvedValue(new Map([['user-1', { id: 'user-1', name: 'Original owner' }]]))
    return new RosterService({ roster, usableRoster, namesByIds } as unknown as RepositoryPort, () => 0)
  }

  it('opens a private roster read-only to a friend it is lent to, naming the lender', async () => {
    expect(await source('private', 'user-1').rosterAccess('source', 'user-2')).toMatchObject({
      editable: false,
      lentBy: { id: 'user-1', name: 'Original owner' },
    })
  })

  it('names a public source and its owner for another reader', async () => {
    expect(await source('public').copySource('source', 'user-2')).toEqual({
      id: 'source',
      name: 'Original army',
      ownerId: 'user-1',
      ownerName: 'Original owner',
    })
  })

  it('names nothing once the source is private to another reader', async () => {
    expect(await source('private').copySource('source', 'user-2')).toBeNull()
  })

  it('names a private source to its own owner', async () => {
    expect((await source('private').copySource('source', 'user-1'))?.name).toBe('Original army')
  })

  it('names nothing when the source was deleted', async () => {
    const service = new RosterService({ roster: vi.fn().mockResolvedValue(undefined) } as unknown as RepositoryPort, () => 0)
    expect(await service.copySource('source', 'user-2')).toBeNull()
  })
})
