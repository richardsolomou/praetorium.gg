import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { rosterContentSchema } from '../contracts/schemas'
import type { Roster } from '../core/battle'
import { app } from './app'
import { submitSealedEventRoster } from './productActions'
import { rosterFromRow } from './rosterPersistence'
import { rosterForUse } from './rosterUsage'
import { savedPicks, servedLoadout, servedRoster, servedSealedRoster } from './savedPicks'
import { RosterService } from './services/rosterService'
import type { RepositoryPort } from './spacetimeRepository'

const fixture = vi.hoisted(() => ({
  catalogueId: 'mfm-1-6~book',
  copiedAt: '2026-11-20T00:00:00.000Z',
  pick: { entryId: 'intercessors', models: 10 },
  vs: { models: { 'space-marines.intercessor': 10 }, options: {} },
  text: '',
}))

vi.mock('../shared/savedPicks.pin.json', async () => {
  const { hash } = await import('node:crypto')
  const { savedPickKey } = await import('../core/savedPicks')
  const listKey = savedPickKey({ rulesVersion: 'mfm-1-6', catalogueId: fixture.catalogueId, detachmentIds: [] }, fixture.pick)
  fixture.text = JSON.stringify({ format: 'praetorium.saved-picks.v1', picks: { [listKey]: fixture.vs } })
  return { default: { format: 'praetorium.saved-picks-pin.v1', sha256: hash('sha256', fixture.text), copiedAt: fixture.copiedAt } }
})
vi.mock('./app', () => ({ app: vi.fn() }))
vi.mock('./rosterUsage', () => ({ rosterForUse: vi.fn(), fieldedSealedList: vi.fn() }))
vi.mock('./mutationTelemetry', () => ({
  captureMutation: vi.fn(),
  captureBattleCreated: vi.fn(),
  captureSealedEventCreated: vi.fn(),
  captureSealedEventBattleCreated: vi.fn(),
}))

const before = Date.parse(fixture.copiedAt) - 1
const after = Date.parse(fixture.copiedAt) + 1
const row = (updatedAt: number) => ({
  id: 'roster-1',
  userId: 'user-1',
  name: 'Army',
  automaticName: true,
  catalogueId: fixture.catalogueId,
  detachmentId: '[]',
  disposition: null,
  limit: 2000,
  pointsBudget: null,
  picks: JSON.stringify([fixture.pick]),
  prep: null,
  tags: '[]',
  waivedRules: '[]',
  optionalRules: '[]',
  borrowedDetachmentId: null,
  baseRosterId: null,
  locked: false,
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
    limit: 2000,
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

beforeAll(async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'saved-picks-'))
  fs.mkdirSync(path.join(directory, 'saved-picks'))
  const { savedPicksPin } = await import('./savedPicks')
  fs.writeFileSync(path.join(directory, 'saved-picks', `${savedPicksPin.sha256}.json`), fixture.text)
  vi.stubEnv('DATA_DIR', directory)
  await vi.waitFor(() => expect(savedPicks()).toBeDefined())
})

describe('served saved records', () => {
  it('give a roster last saved before the copy its translation', () => {
    expect(servedRoster(roster(before)).picks[0]?.vs).toEqual(fixture.vs)
  })

  it('give a roster saved since the copy none', () => {
    expect(servedRoster(roster(after)).picks[0]?.vs).toBeUndefined()
  })

  it('give a loadout created since the copy none', () => {
    expect(servedLoadout({ catalogueId: fixture.catalogueId, pick: fixture.pick, createdAt: after }).pick.vs).toBeUndefined()
  })

  it('give a list sealed since the copy none', () => {
    expect(servedSealedRoster(sealed, after).built?.picks?.[0]?.vs).toBeUndefined()
  })

  it('give the owner’s roster its translation', async () => {
    expect((await service(before).rosterAccess('roster-1', 'user-1'))?.roster.picks[0]?.vs).toEqual(fixture.vs)
  })

  it('leave a battle fielding a saved roster without one', async () => {
    expect((await service(before).usableRoster('user-1', 'roster-1'))?.roster.picks[0]?.vs).toBeUndefined()
  })
})

it('seals a list the device read with its translation', async () => {
  const saved = rosterFromRow(row(before))
  vi.mocked(rosterForUse).mockResolvedValue({ saved, snapshot: sealed } as never)
  vi.mocked(app).mockReturnValue({
    catalogueFor: async () => ({ index: { revision: 'r' } }),
    service: { sealedEventService: { submitSealedEventRoster: async () => ({ format: 'tournament', requiredLimit: 2000 }) } },
  } as never)
  const captured = rosterContentSchema.parse(servedRoster(saved))
  await expect(
    submitSealedEventRoster('user-1', { token: 't', rosterId: 'roster-1', capturedRoster: captured, catalogueRevision: 'r' } as never),
  ).resolves.toBeNull()
})
