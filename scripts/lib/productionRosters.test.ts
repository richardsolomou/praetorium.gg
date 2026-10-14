import { expect, it, vi } from 'vitest'
import type { SpacetimeOperator } from '../../src/server/spacetimeOperator'
import {
  fetchProductionRosters,
  boundedResponseText,
  compareRosterAudits,
  importedRosterId,
  importProductionRosters,
  productionRosterSnapshotSchema,
  rosterAuditBaselineSchema,
  type ProductionRosterSnapshot,
} from './productionRosters'

const source = { url: 'https://stdb.example.com', database: 'production', ownerToken: 'owner-secret' }
const roster: ProductionRosterSnapshot['rosters'][number] = {
  id: 'roster',
  catalogueId: 'faction',
  detachmentIds: ['detachment'],
  disposition: null,
  limit: 2000,
  pointsBudget: null,
  picks: [
    {
      entryId: 'retired-unit',
      models: 10,
      choices: { weapons: 'retired-option' },
      spreads: { weapons: { 'retired-option': 2 } },
      toggles: { warlord: 1 },
      attachedTo: 1,
    },
    { entryId: 'host' },
  ],
  waivedRules: [],
  optionalRules: [],
  borrowedDetachmentId: null,
  baseRosterId: null,
  source: 'editable',
  createdAt: 1,
  updatedAt: 2,
}
const snapshot: ProductionRosterSnapshot = {
  version: 1,
  fetchedAt: 3,
  source: { url: source.url, database: source.database },
  rosters: [roster],
}
const some = (value: string) => [0, value]
const none = [1, []]
const sqlRow = [
  roster.id,
  roster.catalogueId,
  some(JSON.stringify(roster.detachmentIds)),
  none,
  roster.limit,
  none,
  JSON.stringify(roster.picks),
  '[]',
  '[]',
  none,
  none,
  roster.source,
  1,
  2,
]

it('exports the original loadout IDs without migrating them or including account fields', async () => {
  const request = vi.fn(async () => Response.json([{ rows: [sqlRow] }]))
  expect((await fetchProductionRosters(source, request)).rosters).toEqual([roster])
})

const auditIdentity = {
  id: 'roster',
  available: true,
  unavailable: [],
  unavailableDetachments: [],
  modelCountChanges: [],
  points: 1000,
  limit: 1000,
  errors: [],
  detachmentError: null,
}

it('blocks a roster that crosses its point limit without losing any selections', () => {
  expect(compareRosterAudits([{ ...auditIdentity, points: 1005 }], [auditIdentity])[0]?.regressed).toBe(true)
})

it('reports a points change even while the roster remains within its limit', () => {
  expect(compareRosterAudits([{ ...auditIdentity, points: 995 }], [auditIdentity])[0]?.pointsChange).toEqual({ before: 1000, after: 995 })
})

it('blocks a new unit legality error', () => {
  const errors = [{ entryId: 'unit', entryName: 'Unit', message: 'too many weapons' }]
  expect(compareRosterAudits([{ ...auditIdentity, errors }], [auditIdentity])[0]?.regressed).toBe(true)
})

it('blocks a new detachment legality error', () => {
  expect(compareRosterAudits([{ ...auditIdentity, detachmentError: 'Too many DP' }], [auditIdentity])[0]?.regressed).toBe(true)
})

it('preserves an existing legality problem in the baseline without reporting a new regression', () => {
  const result = { ...auditIdentity, points: 1005, detachmentError: 'Too many DP' }
  expect(compareRosterAudits([result], [result])[0]?.regressed).toBe(false)
})

it('refuses an identity-only baseline that cannot verify old points and legality', () => {
  const { points: _, ...incomplete } = auditIdentity
  expect(rosterAuditBaselineSchema.safeParse({ fetchedAt: 1, source: snapshot.source, results: [incomplete] }).success).toBe(false)
})

it('does not block on unresolved selections that were already in the baseline', () => {
  const result = {
    ...auditIdentity,
    unavailable: [{ pickIndex: 0, entryId: 'unit', kind: 'choice' as const, key: 'weapon', optionId: 'old' }],
  }
  expect(compareRosterAudits([result], [result])[0]?.regressed).toBe(false)
})

it('blocks a newly lost choice even when the roster still prices', () => {
  const result = {
    ...auditIdentity,
    unavailable: [{ pickIndex: 0, entryId: 'unit', kind: 'choice' as const, key: 'weapon', optionId: 'old' }],
  }
  expect(compareRosterAudits([result], [auditIdentity])[0]?.regressed).toBe(true)
})

it('blocks a newly unavailable catalogue for a roster with no picks', () => {
  expect(compareRosterAudits([{ ...auditIdentity, available: false }], [auditIdentity])[0]?.regressed).toBe(true)
})

it('blocks a removed detachment independently of unit selections', () => {
  expect(compareRosterAudits([{ ...auditIdentity, unavailableDetachments: ['old'] }], [auditIdentity])[0]?.regressed).toBe(true)
})

it('blocks a saved model count that the new data silently clamps', () => {
  expect(
    compareRosterAudits([{ ...auditIdentity, modelCountChanges: [{ pickIndex: 0, saved: 10, current: 5 }] }], [auditIdentity])[0]
      ?.regressed,
  ).toBe(true)
})

it('refuses a baseline from a different roster population', () => {
  expect(() => compareRosterAudits([auditIdentity], [{ ...auditIdentity, id: 'another' }])).toThrow('Baseline roster IDs differ')
})

it('cancels an oversized response before retaining its full body', async () => {
  const cancel = vi.fn()
  const chunk = new Uint8Array(1024 * 1024)
  const response = new Response(
    new ReadableStream({
      pull(controller) {
        controller.enqueue(chunk)
      },
      cancel,
    }),
  )
  await expect(boundedResponseText(response)).rejects.toThrow('exceeds 64 MiB')
  expect(cancel).toHaveBeenCalledOnce()
})

it('only submits the fixed read query and refuses redirects', async () => {
  const request = vi.fn(async () => Response.json([{ rows: [] }]))
  await fetchProductionRosters(source, request)
  const [url, init] = request.mock.calls[0] as unknown as [URL, RequestInit]
  expect([url.pathname, init.method, init.redirect, init.body]).toEqual([
    '/v1/database/production/sql',
    'POST',
    'error',
    'SELECT id, catalogueId, detachmentId, disposition, limit, pointsBudget, picks, waivedRules, optionalRules, borrowedDetachmentId, baseRosterId, source, createdAt, updatedAt FROM rosters',
  ])
})

it('refuses incomplete authentication before contacting production', async () => {
  const request = vi.fn()
  await expect(fetchProductionRosters({ ...source, accessClientId: 'access' }, request)).rejects.toThrow('Supply both Cloudflare')
  expect(request).not.toHaveBeenCalled()
})

it('does not include upstream error bodies that might contain credentials', async () => {
  await expect(fetchProductionRosters(source, async () => new Response('owner-secret', { status: 403 }))).rejects.toThrow(
    /^Production roster read failed with HTTP 403$/,
  )
})

it('rejects malformed saved selections instead of silently dropping them', async () => {
  const row = [...sqlRow]
  row[6] = '[{"entryId":"unit","models":-1}]'
  await expect(fetchProductionRosters(source, async () => Response.json([{ rows: [row] }]))).rejects.toThrow()
})

it('rejects duplicate snapshot identities', () => {
  expect(productionRosterSnapshotSchema.safeParse({ ...snapshot, rosters: [roster, roster] }).success).toBe(false)
})

it('imports every loadout and attachment unchanged into private local copies', async () => {
  const syncRoster = vi.fn<SpacetimeOperator['syncRoster']>(async () => ({
    outcome: 'applied',
    version: 2,
    deleted: false,
    lifecycle: 'created',
  }))
  await importProductionRosters(snapshot, 'local-account', { roster: async () => undefined, syncRoster })
  expect(JSON.parse(syncRoster.mock.calls[0]![0].row)).toMatchObject({
    id: importedRosterId(roster.id),
    userId: 'local-account',
    visibility: 'private',
    picks: JSON.stringify(roster.picks),
    catalogueId: roster.catalogueId,
    detachmentId: JSON.stringify(roster.detachmentIds),
    prep: null,
    tags: '[]',
    now: 2,
  })
})

it('preserves local experiments when an import is repeated', async () => {
  const syncRoster = vi.fn()
  await importProductionRosters(snapshot, 'local-account', { roster: async () => ({ userId: 'local-account' }) as never, syncRoster })
  expect(syncRoster).not.toHaveBeenCalled()
})

it('stops on an ownership collision without overwriting another local account', async () => {
  const syncRoster = vi.fn()
  await expect(
    importProductionRosters(snapshot, 'local-account', { roster: async () => ({ userId: 'another-account' }) as never, syncRoster }),
  ).rejects.toThrow('belongs to another local account')
  expect(syncRoster).not.toHaveBeenCalled()
})

it('preserves roster variant links under the imported IDs', async () => {
  const syncRoster = vi.fn<SpacetimeOperator['syncRoster']>(async () => ({
    outcome: 'applied',
    version: 2,
    deleted: false,
    lifecycle: 'created',
  }))
  await importProductionRosters(
    {
      ...snapshot,
      rosters: [
        { ...roster, baseRosterId: 'base' },
        { ...roster, id: 'base' },
      ],
    },
    'local-account',
    {
      roster: async () => undefined,
      syncRoster,
    },
  )
  expect(
    syncRoster.mock.calls.map(([input]) => {
      const row = JSON.parse(input.row)
      return [row.id, row.baseRosterId]
    }),
  ).toEqual([
    [importedRosterId('base'), null],
    [importedRosterId(roster.id), importedRosterId('base')],
  ])
})

it('imports a variant of a deleted production base as a standalone copy', async () => {
  const syncRoster = vi.fn<SpacetimeOperator['syncRoster']>(async () => ({
    outcome: 'applied',
    version: 2,
    deleted: false,
    lifecycle: 'created',
  }))
  await importProductionRosters({ ...snapshot, rosters: [{ ...roster, baseRosterId: 'deleted' }] }, 'local-account', {
    roster: async () => undefined,
    syncRoster,
  })
  expect(JSON.parse(syncRoster.mock.calls[0]![0].row).baseRosterId).toBeNull()
})

it('stops after a failed write so the next import can resume', async () => {
  await expect(
    importProductionRosters(snapshot, 'local-account', {
      roster: async () => undefined,
      syncRoster: async () => ({ outcome: 'refused', message: 'forbidden' }),
    }),
  ).rejects.toThrow('forbidden')
})

it('uses an atomic insert so an edit racing the import cannot be overwritten', async () => {
  const syncRoster = vi.fn<SpacetimeOperator['syncRoster']>(async () => ({ outcome: 'conflict', message: 'concurrent edit' }))
  const imported = await importProductionRosters(snapshot, 'local-account', { roster: async () => undefined, syncRoster })
  expect([imported, syncRoster.mock.calls[0]![0].expectedVersion]).toEqual([0, null])
})
