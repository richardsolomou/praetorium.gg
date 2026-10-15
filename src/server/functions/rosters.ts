import { createServerFn } from '@tanstack/react-start'
import { changesTouching } from '../../core/catalogueChanges'
import { historySince } from '../../core/catalogueHistory'
import { app } from '../app'
import { currentUserId, requireUser } from '../playerSession'
import { calculateRosterPrice } from '../../shared/pricing'
import { cachedRosterAssessmentsFor, cachedRosterPrice, cachedRosterTotalsFor, cachedRosterVerdictsFor } from '../rosterPrices'
import { mutationRpc, rpc } from '../rpc'
import { exportRosterFile } from '../../shared/rosterFiles'
import { importRosterInput } from '../rosterImport'
import { captureRosterCreated, rosterTelemetryProperties } from '../rosterTelemetry'
import { isRosterExchangeCode } from '../../core/rosterExchange'
import { ROSTER_DISCOVERY_PAGE_SIZE } from '../../core/rosterDiscovery'
import { discoveryScope, inDiscoveryScope } from '../../core/rosterDiscoveryScope'
import { variantDifferences } from '../rosterDifferences'
import { copySavedRoster, saveOwnedRoster } from '../saveOwnedRoster'
import { rosterChangeWithoutPricing, rosterStatus, rosterVerdict } from '../rosterStatus'
import {
  copyRosterSchema,
  exportRosterSchema,
  importRosterSchema,
  priceSchema,
  rosterIdSchema,
  rosterDiscoverySchema,
  rosterIdsSchema,
  rosterInBattleSchema,
  rosterLockSchema,
  rosterLoanSchema,
  rosterVisibilitySchema,
  saveRosterSchema,
  userSchema,
} from '../../contracts/schemas'

export const priceRoster = createServerFn({ method: 'POST' })
  .validator(priceSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const startedAt = performance.now()
      const instance = app()
      const loaded = await instance.catalogueFor(data.catalogueId)
      const rules = await instance.rulesFor(data.catalogueId)
      const result = calculateRosterPrice(data, loaded, rules)
      const userId = await currentUserId()
      if (userId && Math.random() < 0.1)
        await instance.telemetry.capture(userId, 'roster_priced', {
          ...rosterTelemetryProperties(data, loaded, rules),
          sample_rate: 0.1,
          unit_count: data.units.length,
          duration_ms: Math.round(performance.now() - startedAt),
          error_count: result?.errors.length ?? 0,
          unhandled_count: result?.unhandled.length ?? 0,
        })
      return result
    }),
  )

export const savedRosterSummaries = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => {
    const id = await currentUserId()
    return id ? app().service.savedRosterSummaries(id) : []
  }),
)

export const homeRosters = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => {
    const id = await currentUserId()
    if (!id) return { count: 0, rosters: [] }
    const instance = app()
    const { count, summaries, priceable } = await instance.service.homeRosters(id)
    if (!priceable.length) return { count, rosters: [] }
    const [totals, verdicts] = await Promise.all([cachedRosterTotalsFor(priceable), cachedRosterVerdictsFor(priceable)])
    const rosters = priceable.map((_, index) => ({
      roster: summaries[index]!,
      points: totals[index]?.points ?? null,
      label: totals[index]?.label ?? '',
      problem: verdicts[index]!.problem,
    }))
    return { count, rosters }
  }),
)

/**
 * The lists a player has published, for anybody reading their profile.
 *
 * Totalled here rather than in the service, because a total needs the catalogue and
 * a listing does not. The picks never leave the server: the summaries the library
 * row draws carry a unit count, and the points and label come back beside them.
 */
export const playerRosters = createServerFn({ method: 'GET' })
  .validator(userSchema)
  .handler(({ data }) =>
    rpc(async () => {
      const { summaries, priceable } = await app().service.publicRosters(data.userId)
      const values = await cachedRosterTotalsFor(priceable)
      const totals = priceable.map((roster, index) => ({
        id: roster.id,
        points: values[index]?.points ?? null,
        label: values[index]?.label ?? '',
      }))
      return { rosters: summaries, totals }
    }),
  )

/**
 * Public rosters anyone can find, most recently saved first, with their owner's name and
 * whether the current data can field them. A rare page can come back short, when a saved
 * ID read against current data falls outside the filter; its cursor still continues.
 */
export const discoverRosters = createServerFn({ method: 'GET' })
  .validator(rosterDiscoverySchema)
  .handler(({ data: { before, ...filter } }) =>
    rpc(async () => {
      const instance = app()
      const factions = (await instance.factionIndexFor())?.factions ?? []
      const scope = discoveryScope(filter, factions)
      if (!scope) return { rosters: [], nextCursor: null }
      const page = await instance.service.discoverRosters({ ...scope, before, limit: ROSTER_DISCOVERY_PAGE_SIZE })
      const indexed = new Map(factions.map((faction) => [faction.id, faction]))
      const shown = page.rosters.filter(({ summary }) => inDiscoveryScope(summary, filter, indexed))
      const assessments = await cachedRosterAssessmentsFor(shown.map(({ priceable }) => priceable))
      return {
        rosters: shown.map(({ summary, owner }, index) => ({
          roster: summary,
          owner,
          points: assessments[index]!.points,
          problem: assessments[index]!.verdict.problem,
        })),
        nextCursor: page.nextCursor,
      }
    }),
  )

export const sharedRoster = createServerFn({ method: 'GET' })
  .validator(rosterInBattleSchema)
  .handler(({ data }) => rpc(async () => app().service.sharedRoster(data.id, await currentUserId(), data.battle ?? null)))

/** A reader's access to a roster, with the variant group its owner can switch between. */
async function accessToRoster(data: { id: string; battle?: string }) {
  const userId = await currentUserId()
  const access = await app().service.rosterAccess(data.id, userId, data.battle ?? null)
  if (!access) return null
  const copiedFrom = await app().service.copySource(access.roster.copiedFromRosterId, userId)
  if (!access.editable || !userId) return { lentBy: null, ...access, variants: [], differences: null, copiedFrom }
  const [variants, differences] = await Promise.all([
    app().service.rosterGroup(userId, access.roster),
    variantDifferences(userId, [access.roster]),
  ])
  return { lentBy: null, ...access, variants, differences: differences.get(access.roster.id) ?? null, copiedFrom }
}

async function accessibleRoster(data: { id: string; battle?: string }) {
  const access = await accessToRoster(data)
  if (!access) return null
  return { ...access, faction: await app().factionFor(access.roster.catalogueId) }
}

export const rosterAccess = createServerFn({ method: 'GET' })
  .validator(rosterInBattleSchema)
  .handler(({ data }) => rpc(() => accessibleRoster(data)))

/**
 * How many recorded data updates a saved list is compared against, newest first. A list
 * untouched for longer than this many updates is only told about the most recent.
 */
const CHANGE_SETS_READ = 50
const CHANGED_COUNT_BATCH_SIZE = 2

/** Points, legality and changes for the bounded set of library rows currently shown. */
export const savedRosterPage = createServerFn({ method: 'GET' })
  .validator(rosterIdsSchema)
  .handler(({ data }) =>
    rpc(async () => {
      const userId = await currentUserId()
      if (!userId) return []
      const instance = app()
      const saved = await instance.service.savedRostersByIds(userId, data.ids)
      if (!saved.length) return []
      const [assessments, history, differences] = await Promise.all([
        cachedRosterAssessmentsFor(saved),
        instance.catalogueHistoryFor(),
        variantDifferences(userId, saved),
      ])
      const needingTotals = saved.filter((roster, index) => !roster.name || assessments[index]!.points === null)
      const fallbackTotals = await cachedRosterTotalsFor(needingTotals)
      const totalsById = new Map(needingTotals.map((roster, index) => [roster.id, fallbackTotals[index]]))
      const sets = historySince(history ?? [], Math.min(...saved.map((roster) => roster.updatedAt)), CHANGE_SETS_READ)
      return saved.map((roster, index) => ({
        ...rosterStatus(roster, assessments[index]!.verdict, sets),
        points: assessments[index]!.points ?? totalsById.get(roster.id)?.points ?? null,
        label: roster.name || totalsById.get(roster.id)?.label || '',
        differences: differences.get(roster.id) ?? null,
      }))
    }),
  )

/** The lists a data update changed since they were saved; the full-library banner settles after the visible rows without monopolising the server. */
export const savedRosterChangedIds = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async (): Promise<string[]> => {
    const id = await currentUserId()
    if (!id) return []
    const instance = app()
    const history = (await instance.catalogueHistoryFor()) ?? []
    if (!history.length) return []
    const saved = await instance.service.savedRosters(id)
    if (!saved.length) return []
    const sets = historySince(history, Math.min(...saved.map((roster) => roster.updatedAt)), CHANGE_SETS_READ)
    if (!sets.length) return []
    const latestChangeAt = sets.at(-1)!.recordedAt
    const changed: string[] = []
    for (let index = 0; index < saved.length; index += CHANGED_COUNT_BATCH_SIZE) {
      const batch = saved.slice(index, index + CHANGED_COUNT_BATCH_SIZE)
      const uncertain: typeof batch = []
      for (const roster of batch) {
        if (roster.updatedAt >= latestChangeAt) continue
        const result = rosterChangeWithoutPricing(roster, sets)
        if (result === 'changed') changed.push(roster.id)
        else if (result === 'needs-price') uncertain.push(roster)
      }
      if (uncertain.length) {
        const verdicts = await cachedRosterVerdictsFor(uncertain)
        changed.push(...uncertain.filter((roster, at) => rosterStatus(roster, verdicts[at]!, sets).changes > 0).map((roster) => roster.id))
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
    }
    return changed
  }),
)

/** The recorded data updates since a list was saved that reached something it holds. */
async function changesSinceSaved(
  roster: Parameters<typeof cachedRosterPrice>[0] & { updatedAt: number },
  priced: Awaited<ReturnType<typeof cachedRosterPrice>>,
) {
  const sets = historySince((await app().catalogueHistoryFor()) ?? [], roster.updatedAt, CHANGE_SETS_READ)
  return sets.length ? changesTouching(rosterVerdict(roster, priced).contents, roster.updatedAt, sets) : []
}

export const rosterBootstrap = createServerFn({ method: 'GET' })
  .validator(rosterInBattleSchema)
  .handler(({ data }) =>
    rpc(async () => {
      const access = await accessToRoster(data)
      if (!access) return null
      // The faction index omits exact root IDs a saved roster may still carry, so resolve the book as the builder would.
      const [faction, price] = await Promise.all([
        app().factionFor(access.roster.catalogueId),
        cachedRosterPrice(access.roster, access.editable),
      ])
      return { ...access, faction, price, changes: await changesSinceSaved(access.roster, price) }
    }),
  )

export const rosterChanges = createServerFn({ method: 'GET' })
  .validator(rosterInBattleSchema)
  .handler(({ data }) =>
    rpc(async () => {
      const roster = await app().service.sharedRoster(data.id, await currentUserId(), data.battle ?? null)
      return roster ? changesSinceSaved(roster, await cachedRosterPrice(roster)) : []
    }),
  )

export const saveRoster = createServerFn({ method: 'POST' })
  .validator(saveRosterSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      const { id, created, updatedAt } = await saveOwnedRoster(player.id, data)
      // Counted when a row is made, which a visitor's list does while arriving with the id it was built under.
      if (created) await captureRosterCreated(app(), player.id, data)
      return { id, updatedAt }
    }),
  )

export const copyRoster = createServerFn({ method: 'POST' })
  .validator(copyRosterSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      const copied = await copySavedRoster(player.id, data.id, data.variant, data.setup)
      if (!copied) throw new Response('roster not found', { status: 404 })
      await captureRosterCreated(app(), player.id, copied.data, { variant: data.variant })
      return { id: copied.id }
    }),
  )

export const deleteRoster = createServerFn({ method: 'POST' })
  .validator(rosterIdSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      await app().service.deleteRoster(player.id, data.id)
      await app().telemetry.capture(player.id, 'roster_deleted')
      return null
    }),
  )

export const setRosterVisibility = createServerFn({ method: 'POST' })
  .validator(rosterVisibilitySchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      await app().service.setRosterVisibility(player.id, data.id, data.visibility)
      await app().telemetry.capture(player.id, 'roster_visibility_updated', { visibility: data.visibility })
      return null
    }),
  )

export const lendRoster = createServerFn({ method: 'POST' })
  .validator(rosterLoanSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      await app().service.lendRoster(player.id, data.id, data.borrowerId)
      await app().telemetry.capture(player.id, 'roster_lent')
      return null
    }),
  )

/** The owner revokes a loan, or the borrower hands it back. */
export const endRosterLoan = createServerFn({ method: 'POST' })
  .validator(rosterLoanSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      await app().service.endRosterLoan(player.id, data.id, data.borrowerId)
      await app().telemetry.capture(player.id, 'roster_loan_ended', { by: player.id === data.borrowerId ? 'borrower' : 'owner' })
      return null
    }),
  )

export const rosterLoans = createServerFn({ method: 'GET' })
  .validator(rosterIdSchema)
  .handler(({ data }) =>
    rpc(async () => {
      const player = await requireUser()
      return app().service.rosterLoans(player.id, data.id)
    }),
  )

export const rostersLentToMe = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => {
    const id = await currentUserId()
    return id ? app().service.rostersLentTo(id) : []
  }),
)

export const setRosterLocked = createServerFn({ method: 'POST' })
  .validator(rosterLockSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      const saved = await app().service.setRosterLocked(player.id, data.id, data.locked)
      await app().telemetry.capture(player.id, 'roster_lock_updated', { locked: data.locked })
      return saved
    }),
  )

export const importRoster = createServerFn({ method: 'POST' })
  .validator(importRosterSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const instance = app()
      const { result, loaded, rules } = await importRosterInput(data.file)
      const userId = await currentUserId()
      if (userId) {
        await instance.telemetry.capture(userId, 'roster_imported', {
          ...(result.catalogueId && typeof result.limit === 'number' && loaded
            ? rosterTelemetryProperties(
                { catalogueId: result.catalogueId, detachmentIds: result.detachmentIds, limit: result.limit },
                loaded,
                rules,
              )
            : {}),
          unit_count: result.units.length,
          source: result.source,
          input: isRosterExchangeCode(data.file) ? 'exchange-code' : 'text',
          missing_count: result.unknown.length,
          unplaced_count: result.unplaced.length,
        })
      }
      return result
    }),
  )

export const exportRoster = createServerFn({ method: 'POST' })
  .validator(exportRosterSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const instance = app()
      const loaded = await instance.catalogueFor(data.catalogueId)
      if (!loaded) throw new Response('army data is not available', { status: 409 })
      const rules = await instance.rulesFor(data.catalogueId)
      const priced = calculateRosterPrice(data, loaded, rules)
      if (!priced) throw new Response('army data is not available', { status: 409 })
      const dispositionNames = (priced.disposition ? [priced.disposition] : priced.dispositions).map(
        (disposition) => rules?.dispositions.get(disposition) ?? disposition,
      )
      const result = exportRosterFile(data, loaded, { ...priced, disposition: priced.disposition ?? null }, dispositionNames)
      const userId = await currentUserId()
      if (userId)
        await instance.telemetry.capture(userId, 'roster_exported', {
          ...rosterTelemetryProperties(data, loaded, rules),
          unit_count: data.units.length,
        })
      return result
    }),
  )
