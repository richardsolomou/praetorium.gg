import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { saveRosterSchema } from '../contracts/schemas'
import type { Roster } from '../core/battle'
import type { RosterPick } from '../core/roster'
import { lockedRosterRefusal, storedRosterContent } from '../core/rosterLock'
import { app } from './app'
import { sealedEventRosterFixture } from './sealedEventRoster.fixtures'
import { rosterFromRow, rosterRow } from './rosterPersistence'
import { rosterForUse } from './rosterUsage'
import { savedPicks, servedLoadout, servedRoster, servedSealedRoster } from './savedPicks'
import { RosterService } from './services/rosterService'
import { SealedEventService } from './services/sealedEventService'
import type { RepositoryPort } from './spacetimeRepository'

const fixture = vi.hoisted(() => ({
  catalogueId: 'codex~cat',
  copiedAt: '2026-11-20T00:00:00.000Z',
  pick: { entryId: 'captain', toggles: { warlord: 1 } } as RosterPick,
  vs: { models: { 'host.captain': 1 }, options: {} },
  text: '',
}))

vi.mock('../shared/savedPicks.pin.json', async () => {
  const { hash } = await import('node:crypto')
  const { savedPickKey } = await import('../core/savedPicks')
  const key = savedPickKey({ rulesVersion: 'codex', catalogueId: fixture.catalogueId, detachmentIds: [] }, fixture.pick)
  fixture.text = JSON.stringify({ format: 'praetorium.saved-picks.v1', picks: { [key]: fixture.vs } })
  return { default: { format: 'praetorium.saved-picks-pin.v1', sha256: hash('sha256', fixture.text), copiedAt: fixture.copiedAt } }
})
vi.mock('./app', () => ({ app: vi.fn() }))

const copiedAt = Date.parse(fixture.copiedAt)
const before = copiedAt - 1
const after = copiedAt + 1
const row = (updatedAt: number) => ({
  id: 'roster-1',
  userId: 'user-1',
  name: 'Army',
  automaticName: false,
  catalogueId: fixture.catalogueId,
  detachmentId: '[]',
  disposition: null,
  limit: 1000,
  pointsBudget: null,
  picks: JSON.stringify([fixture.pick]),
  prep: null,
  tags: '[]',
  waivedRules: '[]',
  optionalRules: '[]',
  borrowedDetachmentId: null,
  baseRosterId: null,
  locked: true,
  archived: false,
  sharingDeclined: false,
  printedDefaults: true,
  copiedFromRosterId: null,
  visibility: 'private' as const,
  source: 'editable' as const,
  createdAt: updatedAt,
  updatedAt,
})
const roster = (updatedAt: number) => ({ catalogueId: fixture.catalogueId, detachmentIds: [], picks: [fixture.pick], updatedAt })
const sealed = {
  name: 'Army',
  text: '',
  built: {
    catalogueId: fixture.catalogueId,
    revision: 'r',
    limit: 1000,
    detachment: null,
    disposition: null,
    picks: [fixture.pick],
    units: [],
  },
} as Roster
const service = (updatedAt: number) =>
  new RosterService(
    {
      roster: vi.fn().mockResolvedValue(row(updatedAt)),
      usableRoster: vi.fn().mockResolvedValue({ roster: row(updatedAt), lentBy: null }),
    } as unknown as RepositoryPort,
    () => 0,
  )
const fielding = () => {
  const { catalogue, rules } = sealedEventRosterFixture('released')
  vi.mocked(app).mockReturnValue({
    repository: { abilityRemindersByUser: async () => [] },
    service: { rosterService: service(before) },
    catalogueFor: async () => catalogue,
    rulesFor: async () => rules,
  } as never)
}

beforeAll(async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'saved-picks-'))
  fs.mkdirSync(path.join(directory, 'saved-picks'))
  const { savedPicksPin } = await import('./savedPicks')
  fs.writeFileSync(path.join(directory, 'saved-picks', `${savedPicksPin.sha256}.json`), fixture.text)
  vi.stubEnv('DATA_DIR', directory)
  await vi.waitFor(() => {
    if (!savedPicks()) throw new Error('the translations are still loading')
  })
})

describe('served saved records', () => {
  it('give a roster last saved before the copy its translation', () => {
    expect(servedRoster(roster(before)).picks[0]?.translatedVs).toEqual(fixture.vs)
  })

  it('give a roster last saved as the copy was taken its translation', () => {
    expect(servedRoster(roster(copiedAt)).picks[0]?.translatedVs).toEqual(fixture.vs)
  })

  it('give a roster saved since the copy none', () => {
    expect(servedRoster(roster(after)).picks[0]?.translatedVs).toBeUndefined()
  })

  it('keep a translation out of the pick’s own vs', () => {
    expect(servedRoster(roster(before)).picks[0]?.vs).toBeUndefined()
  })

  it('give a loadout created before the copy its translation', () => {
    expect(servedLoadout({ catalogueId: fixture.catalogueId, pick: fixture.pick, createdAt: before }).pick.translatedVs).toEqual(fixture.vs)
  })

  it('give a loadout created since the copy none', () => {
    expect(servedLoadout({ catalogueId: fixture.catalogueId, pick: fixture.pick, createdAt: after }).pick.translatedVs).toBeUndefined()
  })

  it('give a list sealed before the copy its translation', () => {
    expect(servedSealedRoster(sealed, before).built?.picks?.[0]?.translatedVs).toEqual(fixture.vs)
  })

  it('give a list sealed since the copy none', () => {
    expect(servedSealedRoster(sealed, after).built?.picks?.[0]?.translatedVs).toBeUndefined()
  })

  it('give a list with no submission time none', () => {
    expect(servedSealedRoster(sealed, null).built?.picks?.[0]?.translatedVs).toBeUndefined()
  })

  it('give the owner’s roster its translation', async () => {
    const translatedOf = (picks: readonly RosterPick[]) => picks[0]?.translatedVs
    expect(translatedOf((await service(before).rosterAccess('roster-1', 'user-1'))?.roster.picks ?? [])).toEqual(fixture.vs)
  })
})

it('serves no unrevealed sealed list to a reader who may not see it', async () => {
  const sealedEventRoster = vi.fn().mockResolvedValue({
    snapshot: JSON.stringify(sealed),
    submittedAt: before,
    format: 'tournament',
    revealedAt: null,
    sealed: { userId: 'ada', status: 'accepted', teamId: null },
    reader: null,
  })
  const events = new SealedEventService({ sealedEventRoster } as Partial<RepositoryPort> as RepositoryPort, () => 0, { notify: vi.fn() })
  expect(await events.sealedEventRoster('tournament', 'ada', undefined, 'grace')).toBeNull()
})

it('lets a locked roster saved back as it was served through the lock', async () => {
  const served = (await service(before).rosterAccess('roster-1', 'user-1'))!.roster
  // As a sync stores it: parsed as a save, then written as a row.
  const saved = storedRosterContent({ ...rosterRow(saveRosterSchema.parse(served)), automaticName: served.automaticName })
  expect(lockedRosterRefusal({ ...storedRosterContent(row(before)), locked: true }, saved)).toBeNull()
})

it('fields a saved roster in battle as it is stored', async () => {
  fielding()
  const { snapshot } = await rosterForUse('user-1', 'roster-1')
  expect(snapshot.built?.picks?.map((pick) => pick.translatedVs ?? pick.vs)).toEqual([undefined])
})

it('seals a saved roster as it is stored', async () => {
  fielding()
  const { snapshot } = await rosterForUse('user-1', 'roster-1', { sealing: true })
  expect(snapshot.built?.picks?.map((pick) => pick.translatedVs ?? pick.vs)).toEqual([undefined])
})

describe('a write to a list saved before the copy', () => {
  const writer = () => {
    const keepRosterTranslations = vi.fn().mockResolvedValue(true)
    const saveRoster = vi.fn().mockResolvedValue('updated')
    const repository = {
      roster: vi.fn().mockResolvedValue(row(before)),
      keepRosterTranslations,
      saveRoster,
      setRosterLocked: vi.fn().mockResolvedValue(true),
      setRosterVisibility: vi.fn().mockResolvedValue(true),
      setRosterArchived: vi.fn().mockResolvedValue(true),
      splitRosterVariant: vi.fn().mockResolvedValue(true),
      rosterGroupByUser: vi.fn().mockResolvedValue([{ id: 'roster-1' }, { id: 'roster-2' }]),
    }
    const kept = () => keepRosterTranslations.mock.calls[0]?.[2]?.[0]?.vs
    return { rosters: new RosterService(repository as unknown as RepositoryPort, () => after), kept, saveRoster, keepRosterTranslations }
  }

  it('keeps its translations as its own when it is locked', async () => {
    const { rosters, kept } = writer()
    await rosters.setRosterLocked('user-1', 'roster-1', true)
    expect(kept()).toEqual(fixture.vs)
  })

  it('keeps its translations as its own when its visibility changes', async () => {
    const { rosters, kept } = writer()
    await rosters.setRosterVisibility('user-1', 'roster-1', 'public')
    expect(kept()).toEqual(fixture.vs)
  })

  it('keeps its translations as its own when it is archived', async () => {
    const { rosters, kept } = writer()
    await rosters.setRosterArchived('user-1', 'roster-1', true)
    expect(kept()).toEqual(fixture.vs)
  })

  it('keeps every variant a split moves on its translations', async () => {
    const { rosters, keepRosterTranslations } = writer()
    await rosters.splitRosterVariant('user-1', 'roster-1')
    expect(keepRosterTranslations.mock.calls.map(([id]) => id)).toEqual(['roster-1', 'roster-2'])
  })

  it('lets a locked list saved back as stored through the lock with them', async () => {
    const { rosters, saveRoster } = writer()
    const stored = rosterFromRow(row(before), true)
    await rosters.saveRoster('user-1', {
      ...saveRosterSchema.parse(stored),
      id: 'roster-1',
      automaticName: stored.automaticName,
      visibility: stored.visibility,
      source: stored.source,
    })
    const written = { ...row(before), picks: JSON.stringify([{ ...fixture.pick, vs: fixture.vs }]) }
    const saved = { ...saveRoster.mock.calls[0]![0], automaticName: stored.automaticName }
    expect(lockedRosterRefusal({ ...storedRosterContent(written), locked: true }, storedRosterContent(saved))).toBeNull()
  })
})

it('waits for translations still loading before a write moves a list past them', async () => {
  vi.resetModules()
  const { keepServedTranslations } = await import('./services/rosterService')
  const keepRosterTranslations = vi.fn().mockResolvedValue(true)
  const repository = { roster: vi.fn().mockResolvedValue(row(before)), keepRosterTranslations }
  await keepServedTranslations(repository as unknown as RepositoryPort, 'roster-1', 'user-1')
  expect(keepRosterTranslations.mock.calls[0]?.[2]?.[0]?.vs).toEqual(fixture.vs)
})
