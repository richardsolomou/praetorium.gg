import { createServerFn } from '@tanstack/react-start'
import { setImmediate as yieldToEventLoop } from 'node:timers/promises'
import { changesTouching } from '../../core/catalogueChanges'
import { historySince } from '../../core/catalogueHistory'
import { app } from '../app'
import { currentUserId, forSignedIn, requireUserId } from '../playerSession'
import { calculateRosterPrice } from '../../shared/pricing'
import { cachedRosterAssessmentsFor, cachedRosterPrice, cachedRosterTotalsFor, cachedRosterVerdictsFor } from '../rosterPrices'
import { mutationRpc, rpc } from '../rpc'
import { exportRosterFile } from '../../shared/rosterFiles'
import { importRosterInput } from '../rosterImport'
import { captureRosterCreated } from '../rosterTelemetry'
import { ROSTER_PRICED_SAMPLE_RATE, rosterPricedProperties, rosterTelemetryProperties } from '../../shared/rosterTelemetry'
import { isRosterExchangeCode } from '../../core/rosterExchange'
import { ROSTER_DISCOVERY_MAX_PAGE_SIZE, ROSTER_DISCOVERY_PAGE_SIZE } from '../../core/rosterDiscovery'
import { discoveryScope, inDiscoveryScope } from '../../core/rosterDiscoveryScope'
import { variantDifferences } from '../rosterDifferences'
import { copySavedRoster, saveOwnedRoster } from '../saveOwnedRoster'
import { rosterActions } from '../rosterActions'
import { copiedArmy } from '../../core/rosterCopies'
import { currentCatalogueFamilyId, currentEntryId } from '../../core/retiredCatalogueIds'
import { byId, groupBy, chunks } from '../../core/collections'
import type { RosterPick } from '../../core/roster'
import { wishlistSuggestions as suggestFromRosters } from '../../core/wishlistSuggestions'
import { ROSTER_NAME_MAX_LENGTH } from '../../core/battle'
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
  rosterArchiveSchema,
  rosterLockSchema,
  renameUnitLoadoutSchema,
  playedArmiesSchema,
  playedArmySchema,
  saveUnitLoadoutSchema,
  unitLoadoutIdSchema,
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
      if (userId && Math.random() < ROSTER_PRICED_SAMPLE_RATE)
        await instance.telemetry.capture(userId, 'roster_priced', {
          ...rosterPricedProperties(data, loaded, rules, result),
          duration_ms: Math.round(performance.now() - startedAt),
        })
      return result
    }),
  )

export const savedRosterSummaries = createServerFn({ method: 'GET' }).handler(() =>
  rpc(() => forSignedIn([], (id) => app().service.rosterService.savedRosterSummaries(id))),
)

export const homeRosters = createServerFn({ method: 'GET' }).handler(() =>
  rpc(() =>
    forSignedIn({ count: 0, rosters: [] }, async (id) => {
      const instance = app()
      const { count, summaries, priceable } = await instance.service.rosterService.homeRosters(id)
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
  ),
)

const WISHLIST_ARMIES = 3

const fieldedEntryIds = (roster: { catalogueId: string; picks: readonly RosterPick[] }) => ({
  entryIds: roster.picks.map((pick) => currentEntryId(pick.entryId, pick.catalogueId ?? roster.catalogueId)),
})

/**
 * Datasheets in the player's most-built armies, counting only unarchived rosters, that none of their rosters use, ranked by how many of other players' recent
 * public rosters field them, followed by other unused datasheets.
 */
export const wishlistSuggestions = createServerFn({ method: 'GET' }).handler(() =>
  rpc(() =>
    forSignedIn([], async (viewerId) => {
      const instance = app()
      const [own, factionIndex, books] = await Promise.all([
        instance.service.rosterService.savedRosters(viewerId),
        instance.factionIndexFor(),
        instance.combatUnitsFor(),
      ])
      const factions = factionIndex?.factions ?? []
      const indexed = byId(factions)
      const armies = [
        ...groupBy(
          own.filter((roster) => !roster.archived),
          (roster) => currentCatalogueFamilyId(roster.catalogueId),
        ).entries(),
      ]
        .toSorted(([, a], [, b]) => b.length - a.length)
        .slice(0, WISHLIST_ARMIES)
        .map(([faction]) => ({ faction, rules: 'current' as const }))
      const published = await Promise.all(
        armies.map(async (filter) => {
          const scope = discoveryScope(filter, factions)
          if (!scope) return []
          const { rosters } = await instance.service.rosterService.discoverRosters({
            ...scope,
            audience: 'public',
            viewerId,
            sort: 'updated-desc',
            before: null,
            limit: ROSTER_DISCOVERY_MAX_PAGE_SIZE,
          })
          return rosters
            .filter(({ summary }) => inDiscoveryScope(summary, filter, indexed))
            .map(({ priceable }) => fieldedEntryIds(priceable))
        }),
      )
      return suggestFromRosters(
        own.map(fieldedEntryIds),
        armies.map((filter, index) => ({
          rosters: published[index]!,
          datasheets: books.filter((book) => currentCatalogueFamilyId(book.catalogueId) === filter.faction).flatMap((book) => book.units),
        })),
      )
    }),
  ),
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
      const { summaries, priceable } = await app().service.rosterService.publicRosters(data.userId)
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
 * Public rosters, most recently saved first, with their owner's name and whether the current
 * data can field them: other players' for anyone, or a signed-in player's friends'. A rare page
 * can come back short, when a saved ID read against current data falls outside the filter; its
 * cursor still continues.
 */
export const discoverRosters = createServerFn({ method: 'GET' })
  .validator(rosterDiscoverySchema)
  .handler(({ data: { audience, sort, before, ...filter } }) =>
    rpc(async () => {
      const instance = app()
      const [viewerId, factionIndex] = await Promise.all([currentUserId(), instance.factionIndexFor()])
      const factions = factionIndex?.factions ?? []
      const scope = discoveryScope(filter, factions)
      if (!scope || (audience === 'friends' && !viewerId)) return { rosters: [], total: 0, nextCursor: null }
      const page = await instance.service.rosterService.discoverRosters({
        ...scope,
        audience,
        viewerId,
        sort,
        before,
        limit: ROSTER_DISCOVERY_PAGE_SIZE,
      })
      const indexed = byId(factions)
      const shown = page.rosters.filter(({ summary }) => inDiscoveryScope(summary, filter, indexed))
      const assessments = await cachedRosterAssessmentsFor(shown.map(({ priceable }) => priceable))
      return {
        rosters: shown.map(({ summary, owner }, index) => ({
          roster: summary,
          owner,
          points: assessments[index]!.points,
          problem: assessments[index]!.verdict.problem,
        })),
        total: page.total,
        nextCursor: page.nextCursor,
      }
    }),
  )

export const sharedRoster = createServerFn({ method: 'GET' })
  .validator(rosterInBattleSchema)
  .handler(({ data }) => rpc(async () => app().service.rosterService.sharedRoster(data.id, await currentUserId(), data.battle ?? null)))

/** A reader's access to a roster, with the variant group its owner can switch between. */
async function accessToRoster(data: { id: string; battle?: string }) {
  const userId = await currentUserId()
  const access = await app().service.rosterService.rosterAccess(data.id, userId, data.battle ?? null)
  if (!access) return null
  const copiedFrom = await app().service.rosterService.copySource(access.roster.copiedFromRosterId, userId)
  if (!access.editable || !userId) return { lentBy: null, ...access, variants: [], differences: null, copiedFrom }
  const [variants, differences] = await Promise.all([
    app().service.rosterService.rosterGroup(userId, access.roster),
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
    rpc(() =>
      forSignedIn([], async (userId) => {
        const instance = app()
        const saved = await instance.service.rosterService.savedRostersByIds(userId, data.ids)
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
    ),
  )

/** The lists a data update changed since they were saved; the full-library banner settles after the visible rows without monopolising the server. */
export const savedRosterChangedIds = createServerFn({ method: 'GET' }).handler(() =>
  rpc(() =>
    forSignedIn([], async (id): Promise<string[]> => {
      const instance = app()
      const history = (await instance.catalogueHistoryFor()) ?? []
      if (!history.length) return []
      const saved = await instance.service.rosterService.savedRosters(id)
      if (!saved.length) return []
      const sets = historySince(history, Math.min(...saved.map((roster) => roster.updatedAt)), CHANGE_SETS_READ)
      if (!sets.length) return []
      const latestChangeAt = sets.at(-1)!.recordedAt
      const changed: string[] = []
      for (const batch of chunks(saved, CHANGED_COUNT_BATCH_SIZE)) {
        const uncertain: typeof batch = []
        for (const roster of batch) {
          if (roster.updatedAt >= latestChangeAt) continue
          const result = rosterChangeWithoutPricing(roster, sets)
          if (result === 'changed') changed.push(roster.id)
          else if (result === 'needs-price') uncertain.push(roster)
        }
        if (uncertain.length) {
          const verdicts = await cachedRosterVerdictsFor(uncertain)
          changed.push(
            ...uncertain.filter((roster, at) => rosterStatus(roster, verdicts[at]!, sets).changes > 0).map((roster) => roster.id),
          )
        }
        await yieldToEventLoop()
      }
      return changed
    }),
  ),
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
      const roster = await app().service.rosterService.sharedRoster(data.id, await currentUserId(), data.battle ?? null)
      return roster ? changesSinceSaved(roster, await cachedRosterPrice(roster)) : []
    }),
  )

export const saveRoster = createServerFn({ method: 'POST' })
  .validator(saveRosterSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      const { id, updatedAt } = await rosterActions.save(userId, data)
      return { id, updatedAt }
    }),
  )

/**
 * Armies from finished battles anyone may watch, newest first, with their player and whether the
 * rules version they were fielded under fields them with today's data. Picks stay on the server.
 */
export const discoverPlayedArmies = createServerFn({ method: 'GET' })
  .validator(playedArmiesSchema)
  .handler(({ data: { before, ...filter } }) =>
    rpc(async () => {
      const instance = app()
      const [viewerId, factionIndex, battleFactions] = await Promise.all([
        currentUserId(),
        instance.factionIndexFor(),
        instance.battleFactionsFor(),
      ])
      const factions = factionIndex?.factions ?? []
      if (!discoveryScope(filter, factions)) return { armies: [], nextCursor: null }
      const page = await instance.service.playedArmies(viewerId, before ?? undefined, battleFactions)
      const indexed = byId(factions)
      const shown = page.armies.flatMap((army) => {
        const copy = copiedArmy(army)
        return inDiscoveryScope(copy, filter, indexed) ? [{ army, copy }] : []
      })
      const assessments = await cachedRosterAssessmentsFor(
        shown.map(({ army, copy }) => ({
          ...copy,
          id: `${army.battle}:${army.player.id}`,
          updatedAt: army.playedAt,
          optionalRules: [],
          borrowedDetachmentId: null,
        })),
      )
      return {
        armies: shown.map(({ army: { picks: _picks, ...army } }, index) => ({
          ...army,
          points: assessments[index]!.points,
          problem: assessments[index]!.verdict.problem,
        })),
        nextCursor: page.nextCursor,
      }
    }),
  )

/** An army from a finished battle, as a roster that would copy it; nothing is saved. */
async function playedArmyCopy(data: { token: string; playerId: string }) {
  const army = await app().service.playedArmy(data.token, data.playerId)
  if (!army) throw new Response('That army is no longer available to copy.', { status: 404 })
  const copy = copiedArmy(army)
  return saveRosterSchema.parse({
    name: `Copy of ${army.name}`.slice(0, ROSTER_NAME_MAX_LENGTH),
    catalogueId: copy.catalogueId,
    detachmentIds: copy.detachmentIds,
    disposition: army.disposition,
    limit: army.limit,
    pointsBudget: army.pointsBudget,
    picks: copy.picks,
    waivedRules: army.waivedRules,
    optionalRules: [],
    prep: null,
    visibility: 'private',
  })
}

/** A new roster holding an army from a finished battle the player may watch. The battle is not changed. */
export const copyPlayedArmy = createServerFn({ method: 'POST' })
  .validator(playedArmySchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      const instance = app()
      const { rosterVisibility } = await instance.service.playerDefaults(userId)
      const roster = { ...(await playedArmyCopy(data)), visibility: rosterVisibility }
      const saved = await saveOwnedRoster(userId, roster)
      await captureRosterCreated(instance, userId, roster, { played: true })
      return { id: saved.id }
    }),
  )

/** A played army as a visitor's copy would hold it, which their device keeps rather than an account. */
export const playedArmyDraft = createServerFn({ method: 'GET' })
  .validator(playedArmySchema)
  .handler(({ data }) => rpc(async () => playedArmyCopy(data)))

export const copyRoster = createServerFn({ method: 'POST' })
  .validator(copyRosterSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      const copied = await copySavedRoster(userId, data.id, data.variant, data.setup)
      if (!copied) throw new Response('roster not found', { status: 404 })
      await captureRosterCreated(app(), userId, copied.data, { variant: data.variant })
      return { id: copied.id }
    }),
  )

export const deleteRoster = createServerFn({ method: 'POST' })
  .validator(rosterIdSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      await app().service.rosterService.deleteRoster(userId, data.id)
      await app().telemetry.capture(userId, 'roster_deleted')
      return null
    }),
  )

export const setRosterVisibility = createServerFn({ method: 'POST' })
  .validator(rosterVisibilitySchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      await rosterActions.setVisibility(userId, data)
      return null
    }),
  )

export const lendRoster = createServerFn({ method: 'POST' })
  .validator(rosterLoanSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      await app().service.rosterService.lendRoster(userId, data.id, data.borrowerId)
      await app().telemetry.capture(userId, 'roster_lent')
      return null
    }),
  )

/** The owner revokes a loan, or the borrower hands it back. */
export const endRosterLoan = createServerFn({ method: 'POST' })
  .validator(rosterLoanSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      await app().service.rosterService.endRosterLoan(userId, data.id, data.borrowerId)
      await app().telemetry.capture(userId, 'roster_loan_ended', { by: userId === data.borrowerId ? 'borrower' : 'owner' })
      return null
    }),
  )

export const rosterLoans = createServerFn({ method: 'GET' })
  .validator(rosterIdSchema)
  .handler(({ data }) =>
    rpc(async () => {
      const userId = await requireUserId()
      return app().service.rosterService.rosterLoans(userId, data.id)
    }),
  )

/** Rosters friends have lent this player, with the points and legality their cards show. */
export const rostersLentToMe = createServerFn({ method: 'GET' }).handler(() =>
  rpc(() =>
    forSignedIn([], async (id) => {
      const lent = await app().service.rosterService.rostersLentTo(id)
      const assessments = await cachedRosterAssessmentsFor(lent.map(({ priceable }) => priceable))
      return lent.map(({ priceable: _priceable, ...entry }, index) => ({
        ...entry,
        points: assessments[index]!.points,
        problem: assessments[index]!.verdict.problem,
      }))
    }),
  ),
)

export const setRosterLocked = createServerFn({ method: 'POST' })
  .validator(rosterLockSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      const saved = await app().service.rosterService.setRosterLocked(userId, data.id, data.locked)
      await app().telemetry.capture(userId, 'roster_lock_updated', { locked: data.locked })
      return saved
    }),
  )

export const setRosterArchived = createServerFn({ method: 'POST' })
  .validator(rosterArchiveSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      const saved = await app().service.rosterService.setRosterArchived(userId, data.id, data.archived)
      await app().telemetry.capture(userId, 'roster_archive_updated', { archived: data.archived })
      return saved
    }),
  )

/**
 * Reads a Praetorium, BattleBase or New Recruit text export into picks this instance
 * can price. Anything that cannot be placed is named in the answer rather than dropped
 * quietly.
 */
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
          source: result.format,
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

/** The signed-in player's saved unit loadouts; a visitor has none. */
export const unitLoadouts = createServerFn({ method: 'GET' }).handler(() =>
  rpc(() => forSignedIn([], (id) => app().service.rosterService.unitLoadouts(id))),
)

export const saveUnitLoadout = createServerFn({ method: 'POST' })
  .validator(saveUnitLoadoutSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      await app().service.rosterService.saveUnitLoadout(userId, data)
      await app().telemetry.capture(userId, 'unit_loadout_saved')
      return null
    }),
  )

export const deleteUnitLoadout = createServerFn({ method: 'POST' })
  .validator(unitLoadoutIdSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      await app().service.rosterService.deleteUnitLoadout(userId, data.id)
      await app().telemetry.capture(userId, 'unit_loadout_deleted')
      return null
    }),
  )

export const renameUnitLoadout = createServerFn({ method: 'POST' })
  .validator(renameUnitLoadoutSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      await app().service.rosterService.renameUnitLoadout(userId, data.id, data.name)
      await app().telemetry.capture(userId, 'unit_loadout_renamed')
      return null
    }),
  )
