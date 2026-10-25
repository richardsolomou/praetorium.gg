import { z } from 'zod'
import { hash, randomUUID } from 'node:crypto'
import { rosterPickSchema } from '../../src/core/commands'
import { FORMAT_RULE_IDS, OPTIONAL_RULE_IDS, pointsBudgetOf } from '../../src/core/battle'
import { ROSTER_SOURCES } from '../../src/core/savedRoster'
import { currentRosterIds } from '../../src/core/retiredCatalogueIds'
import { migrateStoredRoster } from '../../src/core/savedRosterMigrations'
import type { RosterPick } from '../../src/core/roster'
import { builtPickSelections } from '../../src/core/rosterSelections'
import { detachmentIds, rosterRow } from '../../src/server/rosterPersistence'
import { calculateRosterPrice, savedRosterPriceInput, unavailablePriceSelections } from '../../src/shared/pricing'
import type { LoadedCatalogue } from '../../src/shared/catalogueIndex'
import type { LoadedRules } from '../../src/shared/rules'
import type { SpacetimeOperator } from '../../src/server/spacetimeOperator'
import { spacetimeDatabaseUrl } from 'ras-stack/spacetime'

const rosterSchema = z.strictObject({
  id: z.string().min(1).max(64),
  catalogueId: z.string().min(1).max(64),
  detachmentIds: z.array(z.string().max(128)).max(20),
  disposition: z.string().nullable(),
  limit: z.number().int().min(0).max(10_000),
  /** Absent from snapshots fetched before custom budgets existed. */
  pointsBudget: z.number().int().nullable().optional(),
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
export const importedRosterId = (id: string) => `production-${hash('sha256', id).slice(0, 32)}`
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
const productionRosterQuery =
  'SELECT id, catalogueId, detachmentId, disposition, limit, pointsBudget, picks, waivedRules, optionalRules, borrowedDetachmentId, baseRosterId, source, createdAt, updatedAt FROM rosters'
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
  const endpoint = spacetimeDatabaseUrl({ url: source.url, database: source.database }, '/sql')
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
  const option = <T extends z.ZodType>(value: T) =>
    z.union([z.tuple([z.literal(0), value]).transform(([, some]) => some), z.tuple([z.literal(1), z.tuple([])]).transform(() => null)])
  const nullable = option(z.string())
  const rowSchema = z.tuple([
    rosterSchema.shape.id,
    rosterSchema.shape.catalogueId,
    nullable,
    nullable,
    rosterSchema.shape.limit,
    option(z.number().int()),
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
      pointsBudget,
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
      pointsBudget,
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

/** A saved roster as it reads once the deploy's product data migration has rewritten its stored row. */
function deployedRosterIds(stored: ProductionRosterSnapshot['rosters'][number]) {
  const row = migrateStoredRoster({ name: '', catalogueId: stored.catalogueId, picks: JSON.stringify(stored.picks) })
  return currentRosterIds({ ...stored, catalogueId: row.catalogueId, picks: JSON.parse(row.picks) as typeof stored.picks })
}

export function auditProductionRosters(
  snapshot: ProductionRosterSnapshot,
  catalogueFor: (id: string) => LoadedCatalogue | null,
  rulesFor: (id: string) => LoadedRules | null,
) {
  return snapshot.rosters.map((stored) => {
    const roster = deployedRosterIds(stored)
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
      limit: pointsBudgetOf(roster),
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
      ...rosterRow({
        ...roster,
        prep: null,
        baseRosterId: roster.baseRosterId && byId.has(roster.baseRosterId) ? importedRosterId(roster.baseRosterId) : null,
      }),
      id,
      userId,
      name: `Production roster ${roster.id.slice(0, 48)}`,
      automaticName: false,
      pointsBudget: roster.pointsBudget ?? null,
      visibility: 'private',
      now: roster.updatedAt,
    })
    const outcome = await operator.syncRoster({
      row,
      expectedVersion: null,
      deleted: false,
      operationId: randomUUID(),
      fingerprint: hash('sha256', row),
    })
    if (outcome.outcome === 'conflict') continue
    if (outcome.outcome !== 'applied') throw new Error(`Could not insert local roster ${id}: ${outcome.message}`)
    imported++
  }
  return imported
}

type RosterPrice = NonNullable<ReturnType<typeof calculateRosterPrice>>
type Selections = Pick<RosterPick, 'choices' | 'spreads'>

/** Everything a player sees of a built roster, so a rewrite that changes any of it is refused. */
const builtIdentity = (price: RosterPrice) =>
  JSON.stringify({
    points: price.points,
    errors: price.errors,
    detachmentError: price.detachmentError,
    units: price.units.map((unit) => ({
      key: unit.key,
      models: unit.size.models,
      points: unit.points,
      wargear: unit.wargear,
      groups: unit.choices.map((choice) => [choice.key, choice.options.map((option) => [option.id, option.count])]),
    })),
  })

/** Each saved group a rewrite changes, named the way the loadout pane shows it. */
function selectionChanges(before: Selections, after: Selections, unit: RosterPrice['units'][number] | undefined) {
  const describe = (key: string, value: string | Record<string, number> | null) => {
    const options = unit?.choices.find((choice) => choice.key === key)?.options ?? []
    const name = (id: string) => options.find((option) => option.id === id)?.name ?? id
    if (value === null) return 'nothing saved'
    if (typeof value === 'string') return name(value)
    const held = Object.entries(value).filter(([, count]) => count > 0)
    return held.length ? held.map(([id, count]) => `${name(id)} ×${count}`).join(', ') : 'none'
  }
  const changed = <T extends string | Record<string, number>>(field: 'choices' | 'spreads') =>
    [...new Set([...Object.keys(before[field] ?? {}), ...Object.keys(after[field] ?? {})])].flatMap((key) => {
      const was = (before[field] as Record<string, T> | undefined)?.[key] ?? null
      const now = (after[field] as Record<string, T> | undefined)?.[key] ?? null
      if (JSON.stringify(was) === JSON.stringify(now)) return []
      const group = unit?.choices.find((choice) => choice.key === key)?.name ?? key
      return [{ field, key, group, before: was, after: now, summary: `${group}: ${describe(key, was)} → ${describe(key, now)}` }]
    })
  return [...changed<string>('choices'), ...changed<Record<string, number>>('spreads')]
}

export type NormalisedRoster = ReturnType<typeof normaliseProductionRosters>[number]

/**
 * Saved loadouts rewritten to what the app builds from them, roster by roster.
 *
 * A rewrite is kept only when the rebuilt roster is identical to the one players see
 * today and normalising it again changes nothing; anything else is reported and left
 * alone. It is computed on the IDs the app reads, so a roster whose saved IDs have a
 * reviewed migration is written translated, as any save from the builder would.
 */
export function normaliseProductionRosters(
  snapshot: ProductionRosterSnapshot,
  catalogueFor: (id: string) => LoadedCatalogue | null,
  rulesFor: (id: string) => LoadedRules | null,
) {
  return snapshot.rosters.map((stored) => {
    const roster = deployedRosterIds(stored)
    const base = { id: stored.id, updatedAt: stored.updatedAt, migrated: JSON.stringify(roster) !== JSON.stringify(stored) }
    const skipped = (reason: string, units: ReturnType<typeof unitChanges> = []) => ({
      ...base,
      status: 'skipped' as const,
      reason,
      units,
      write: null,
    })
    const price = (picks: readonly RosterPick[]) =>
      calculateRosterPrice(
        savedRosterPriceInput({ ...roster, picks: [...picks] }),
        catalogueFor(roster.catalogueId),
        rulesFor(roster.catalogueId),
      )
    const normalise = (picks: readonly RosterPick[], built: RosterPrice) => {
      const units = new Map(built.units.map((unit) => [unit.key, unit]))
      return picks.map((pick, index) => {
        const unit = units.get(index)
        return unit ? builtPickSelections(pick, unit) : pick
      })
    }
    const unitChanges = (picks: readonly RosterPick[], built: RosterPrice) =>
      picks.flatMap((pick, pickIndex) => {
        const unit = built.units.find((candidate) => candidate.key === pickIndex)
        const changes = selectionChanges(roster.picks[pickIndex]!, pick, unit)
        return changes.length ? [{ pickIndex, entryId: pick.entryId, name: unit?.name ?? pick.entryId, changes }] : []
      })
    const before = price(roster.picks)
    if (!before) return skipped('catalogue unavailable')
    const picks = normalise(roster.picks, before)
    const units = unitChanges(picks, before)
    if (!units.length) return { ...base, status: 'unchanged' as const, reason: null, units, write: null }
    const after = price(picks)
    if (!after || builtIdentity(after) !== builtIdentity(before)) return skipped('the rewrite would change the built roster', units)
    if (normalise(picks, after).some((pick, index) => pick !== picks[index])) return skipped('a second pass would change it again', units)
    const write = {
      catalogueId: roster.catalogueId,
      detachmentIds: roster.detachmentIds,
      borrowedDetachmentId: roster.borrowedDetachmentId,
      picks,
    }
    return { ...base, status: 'changed' as const, reason: null, units, write }
  })
}
