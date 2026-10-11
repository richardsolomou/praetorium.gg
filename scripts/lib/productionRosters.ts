import { z } from 'zod'
import { createHash, randomUUID } from 'node:crypto'
import { rosterPickSchema } from '../../src/core/commands'
import { FORMAT_RULE_IDS, OPTIONAL_RULE_IDS } from '../../src/core/battle'
import { ROSTER_SOURCES } from '../../src/core/savedRoster'
import { currentRosterIds } from '../../src/core/retiredCatalogueIds'
import { detachmentIds } from '../../src/server/rosterPersistence'
import { calculateRosterPrice, savedRosterPriceInput, unavailablePriceSelections } from '../../src/shared/pricing'
import type { LoadedCatalogue } from '../../src/shared/catalogueIndex'
import type { LoadedRules } from '../../src/shared/rules'
import type { SpacetimeOperator } from '../../src/server/spacetimeOperator'
import { spacetimeSqlEndpoint } from './spacetimeSqlEndpoint'

const rosterSchema = z.strictObject({
  id: z.string().min(1).max(64),
  catalogueId: z.string().min(1).max(64),
  detachmentIds: z.array(z.string().max(128)).max(20),
  disposition: z.string().nullable(),
  limit: z.number().int().min(0).max(10_000),
  picks: z.array(rosterPickSchema.strict()).max(100),
  waivedRules: z.array(z.enum(FORMAT_RULE_IDS)),
  optionalRules: z.array(z.enum(OPTIONAL_RULE_IDS)),
  borrowedDetachmentId: z.string().nullable(),
  baseRosterId: z.string().nullable(),
  source: z.enum(ROSTER_SOURCES),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
})
export const productionRosterSnapshotSchema = z
  .strictObject({
    version: z.literal(1),
    fetchedAt: z.number().int().nonnegative(),
    source: z.strictObject({ url: z.url(), database: z.string() }),
    rosters: z.array(rosterSchema).max(10_000),
  })
  .superRefine(({ rosters }, context) => {
    if (new Set(rosters.map((roster) => roster.id)).size !== rosters.length) {
      context.addIssue({ code: 'custom', message: 'Duplicate roster IDs' })
    }
  })
export type ProductionRosterSnapshot = z.infer<typeof productionRosterSnapshotSchema>
export const importedRosterId = (id: string) => `production-${createHash('sha256').update(id).digest('hex').slice(0, 32)}`
const unavailableSchema = z.object({
  pickIndex: z.number().int().nonnegative(),
  entryId: z.string(),
  kind: z.enum(['datasheet', 'choice', 'spread', 'toggle']),
  key: z.string().optional(),
  optionId: z.string().optional(),
})
const modelChangeSchema = z.object({ pickIndex: z.number().int().nonnegative(), saved: z.number(), current: z.number() })
const auditIdentitySchema = z.object({
  id: z.string(),
  available: z.boolean(),
  unavailable: z.array(unavailableSchema),
  unavailableDetachments: z.array(z.string()),
  modelCountChanges: z.array(modelChangeSchema),
  points: z.number().nullable(),
  limit: z.number(),
  errors: z.array(z.object({ entryId: z.string(), entryName: z.string(), message: z.string() })),
  detachmentError: z.string().nullable(),
})
export const rosterAuditBaselineSchema = z.object({
  fetchedAt: z.number(),
  source: productionRosterSnapshotSchema.shape.source,
  results: z.array(auditIdentitySchema).max(10_000),
})
type AuditIdentity = z.infer<typeof auditIdentitySchema>

export function compareRosterAudits(current: readonly AuditIdentity[], previous?: readonly AuditIdentity[]) {
  const baseline = previous && new Map(previous.map((result) => [result.id, result]))
  if (baseline && (baseline.size !== current.length || current.some((result) => !baseline.has(result.id))))
    throw new Error('Baseline roster IDs differ from the snapshot')
  return current.map((result) => {
    const old = baseline?.get(result.id)
    const newUnavailable = result.unavailable.filter(
      (problem) => !old?.unavailable.some((before) => JSON.stringify(before) === JSON.stringify(problem)),
    )
    const newUnavailableDetachments = result.unavailableDetachments.filter((id) => !old?.unavailableDetachments.includes(id))
    const newModelCountChanges = result.modelCountChanges.filter(
      (change) => !old?.modelCountChanges.some((before) => JSON.stringify(before) === JSON.stringify(change)),
    )
    const newErrors = result.errors.filter(
      (error) => !old?.errors.some((before) => before.entryId === error.entryId && before.message === error.message),
    )
    const newDetachmentError = result.detachmentError && result.detachmentError !== old?.detachmentError ? result.detachmentError : null
    const overLimit = result.points !== null && result.points > result.limit
    const newlyOverLimit = overLimit && (!old || old.points === null || old.points <= old.limit)
    return {
      id: result.id,
      newUnavailable,
      newUnavailableDetachments,
      newModelCountChanges,
      pointsChange: old && old.points !== result.points ? { before: old.points, after: result.points } : null,
      overLimit,
      newlyOverLimit,
      newErrors,
      newDetachmentError,
      regressed: Boolean(
        newUnavailable.length ||
        newUnavailableDetachments.length ||
        newModelCountChanges.length ||
        newlyOverLimit ||
        newErrors.length ||
        newDetachmentError ||
        (!result.available && (!baseline || old?.available)),
      ),
    }
  })
}

// A single read captures all roster rows together, without account data or free-text fields.
export const productionRosterQuery =
  'SELECT id, catalogueId, detachmentId, disposition, limit, picks, waivedRules, optionalRules, borrowedDetachmentId, baseRosterId, source, createdAt, updatedAt FROM rosters'
export const MAX_ROSTER_SNAPSHOT_BYTES = 64 * 1024 * 1024

export async function boundedResponseText(response: Response) {
  if (!response.body) throw new Error('Missing SpacetimeDB response body')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > MAX_ROSTER_SNAPSHOT_BYTES) throw new Error('Roster snapshot exceeds 64 MiB')
      chunks.push(value)
    }
    return Buffer.concat(chunks).toString('utf8')
  } finally {
    await reader.cancel()
    reader.releaseLock()
  }
}

export async function fetchProductionRosters(
  source: { url: string; database: string; ownerToken: string; accessClientId?: string; accessClientSecret?: string },
  request: typeof fetch = fetch,
): Promise<ProductionRosterSnapshot> {
  const endpoint = spacetimeSqlEndpoint(source.url, source.database)
  if (!source.ownerToken) throw new Error('Production SpacetimeDB owner token is required for private roster SQL reads')
  if (Boolean(source.accessClientId) !== Boolean(source.accessClientSecret)) throw new Error('Supply both Cloudflare Access credentials')
  const response = await request(endpoint, {
    method: 'POST',
    redirect: 'error',
    headers: {
      authorization: `Bearer ${source.ownerToken}`,
      'content-type': 'text/plain',
      ...(source.accessClientId
        ? { 'CF-Access-Client-Id': source.accessClientId, 'CF-Access-Client-Secret': source.accessClientSecret! }
        : {}),
    },
    body: productionRosterQuery,
    signal: AbortSignal.timeout(60_000),
  })
  if (!response.ok) throw new Error(`Production roster read failed with HTTP ${response.status}`)
  const [result] = z
    .array(z.object({ rows: z.array(z.array(z.unknown())).max(10_000) }))
    .length(1)
    .parse(JSON.parse(await boundedResponseText(response)))
  const nullable = z.union([
    z.tuple([z.literal(0), z.string()]).transform(([, value]) => value),
    z.tuple([z.literal(1), z.tuple([])]).transform(() => null),
  ])
  const rowSchema = z.tuple([
    rosterSchema.shape.id,
    rosterSchema.shape.catalogueId,
    nullable,
    nullable,
    rosterSchema.shape.limit,
    z.string(),
    z.string(),
    z.string(),
    nullable,
    nullable,
    rosterSchema.shape.source,
    rosterSchema.shape.createdAt,
    rosterSchema.shape.updatedAt,
  ])
  const rosters = result!.rows.map((raw) => {
    const [
      id,
      catalogueId,
      detachmentId,
      disposition,
      limit,
      picks,
      waivedRules,
      optionalRules,
      borrowedDetachmentId,
      baseRosterId,
      rosterSource,
      createdAt,
      updatedAt,
    ] = rowSchema.parse(raw)
    return {
      id,
      catalogueId,
      detachmentIds: detachmentIds(detachmentId),
      disposition,
      limit,
      picks: JSON.parse(picks),
      waivedRules: JSON.parse(waivedRules),
      optionalRules: JSON.parse(optionalRules),
      borrowedDetachmentId,
      baseRosterId,
      source: rosterSource,
      createdAt,
      updatedAt,
    }
  })
  return productionRosterSnapshotSchema.parse({
    version: 1,
    fetchedAt: Date.now(),
    source: { url: source.url, database: source.database },
    rosters,
  })
}

export function auditProductionRosters(
  snapshot: ProductionRosterSnapshot,
  catalogueFor: (id: string) => LoadedCatalogue | null,
  rulesFor: (id: string) => LoadedRules | null,
) {
  return snapshot.rosters.map((stored) => {
    const roster = currentRosterIds(stored)
    const catalogue = catalogueFor(roster.catalogueId)
    const rules = rulesFor(roster.catalogueId)
    const price = calculateRosterPrice(savedRosterPriceInput(roster), catalogue, rules)
    return {
      id: stored.id,
      importedId: importedRosterId(stored.id),
      catalogueId: roster.catalogueId,
      migrated: JSON.stringify(stored) !== JSON.stringify(roster),
      revision: catalogue?.index.revision ?? null,
      available: Boolean(price),
      unavailable: unavailablePriceSelections(savedRosterPriceInput(roster), catalogue),
      unavailableDetachments: roster.detachmentIds.filter(
        (id) => !catalogue?.detachments.get(roster.catalogueId)?.options.some((option) => option.id === id),
      ),
      modelCountChanges:
        price?.units.flatMap((unit) => {
          const saved = roster.picks[unit.key]?.models
          return saved !== undefined && saved !== unit.size.models ? [{ pickIndex: unit.key, saved, current: unit.size.models }] : []
        }) ?? [],
      points: price?.points ?? null,
      limit: roster.limit,
      errors: price?.errors ?? [],
      detachmentError: price?.detachmentError ?? null,
    }
  })
}

export async function importProductionRosters(
  snapshot: ProductionRosterSnapshot,
  userId: string,
  operator: Pick<SpacetimeOperator, 'roster' | 'syncRoster'>,
) {
  let imported = 0
  const byId = new Map(snapshot.rosters.map((roster) => [roster.id, roster]))
  for (const roster of snapshot.rosters) {
    if (roster.baseRosterId) {
      const base = byId.get(roster.baseRosterId)
      if (base?.baseRosterId) throw new Error(`Roster ${roster.id} has a nested base roster`)
    }
  }
  for (const roster of snapshot.rosters.toSorted(
    (left, right) => Number(Boolean(left.baseRosterId)) - Number(Boolean(right.baseRosterId)),
  )) {
    const id = importedRosterId(roster.id)
    const existing = await operator.roster(id)
    if (existing) {
      if (existing.userId !== userId) throw new Error(`Imported roster ${id} belongs to another local account`)
      continue
    }
    const row = JSON.stringify({
      id,
      userId,
      name: `Production roster ${roster.id.slice(0, 48)}`,
      automaticName: false,
      catalogueId: roster.catalogueId,
      detachmentId: JSON.stringify(roster.detachmentIds),
      disposition: roster.disposition,
      limit: roster.limit,
      picks: JSON.stringify(roster.picks),
      waivedRules: JSON.stringify(roster.waivedRules),
      optionalRules: JSON.stringify(roster.optionalRules),
      borrowedDetachmentId: roster.borrowedDetachmentId,
      baseRosterId: roster.baseRosterId && byId.has(roster.baseRosterId) ? importedRosterId(roster.baseRosterId) : null,
      prep: null,
      tags: '[]',
      visibility: 'private',
      source: roster.source,
      now: roster.updatedAt,
    })
    const outcome = await operator.syncRoster({
      row,
      expectedVersion: null,
      deleted: false,
      operationId: randomUUID(),
      fingerprint: createHash('sha256').update(row).digest('hex'),
    })
    if (outcome.outcome === 'conflict') continue
    if (outcome.outcome !== 'applied') throw new Error(`Could not insert local roster ${id}: ${outcome.message}`)
    imported++
  }
  return imported
}
