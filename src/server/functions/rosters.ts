import { createServerFn } from '@tanstack/react-start'
import { attachedUnitCount } from '../../core/attachedUnits'
import { changesTouching } from '../../core/catalogueChanges'
import { historySince } from '../../core/catalogueHistory'
import { app } from '../app'
import { currentUserId, requireUser } from '../playerSession'
import { calculateRosterPrice } from '../pricing'
import { cachedRosterAssessmentsFor, cachedRosterPrice, cachedRosterTotalsFor, cachedRosterVerdictsFor } from '../rosterPrices'
import { mutationRpc, rpc } from '../rpc'
import { exportRosterFile, importRosterFaction, importRosterFile, matchesImportFaction } from '../rosterFiles'
import { rosterTelemetryProperties } from '../rosterTelemetry'
import { saveOwnedRoster } from '../saveOwnedRoster'
import { rosterChangeWithoutPricing, rosterStatus, rosterVerdict } from '../rosterStatus'
import {
  exportRosterSchema,
  importRosterSchema,
  priceSchema,
  rosterIdSchema,
  rosterIdsSchema,
  rosterInBattleSchema,
  rosterVisibilitySchema,
  saveRosterSchema,
  userSchema,
} from '../schemas'

export const priceRoster = createServerFn({ method: 'POST' })
  .validator(priceSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const startedAt = performance.now()
      const instance = app()
      const loaded = await instance.catalogueFor(data.catalogueId)
      const rules = await instance.rulesFor()
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

export const savedRosterTotals = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => {
    const id = await currentUserId()
    if (!id) return []
    const saved = await app().service.savedRosters(id)
    const values = await cachedRosterTotalsFor(saved)
    return saved.map((roster, index) => ({ id: roster.id, points: values[index]?.points ?? null, label: values[index]?.label ?? '' }))
  }),
)

export const sharedRoster = createServerFn({ method: 'GET' })
  .validator(rosterInBattleSchema)
  .handler(({ data }) => rpc(async () => app().service.sharedRoster(data.id, await currentUserId(), data.battle ?? null)))

async function accessToRoster(data: { id: string; battle?: string }) {
  return app().service.rosterAccess(data.id, await currentUserId(), data.battle ?? null)
}

async function accessibleRoster(data: { id: string; battle?: string }) {
  const access = await accessToRoster(data)
  if (!access) return null
  const faction = (await app().factionsFor())?.factions.find((candidate) => candidate.id === access.roster.catalogueId) ?? null
  return { ...access, faction }
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
      const [assessments, history] = await Promise.all([cachedRosterAssessmentsFor(saved), instance.catalogueHistoryFor()])
      const needingTotals = saved.filter((roster, index) => !roster.name || assessments[index]!.points === null)
      const fallbackTotals = await cachedRosterTotalsFor(needingTotals)
      const totalsById = new Map(needingTotals.map((roster, index) => [roster.id, fallbackTotals[index]]))
      const sets = historySince(history ?? [], Math.min(...saved.map((roster) => roster.updatedAt)), CHANGE_SETS_READ)
      return saved.map((roster, index) => ({
        ...rosterStatus(roster, assessments[index]!.verdict, sets),
        points: assessments[index]!.points ?? totalsById.get(roster.id)?.points ?? null,
        label: roster.name || totalsById.get(roster.id)?.label || '',
      }))
    }),
  )

/** The full-library banner settles after the visible rows without monopolising the server. */
export const savedRosterChangedCount = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => {
    const id = await currentUserId()
    if (!id) return 0
    const instance = app()
    const history = (await instance.catalogueHistoryFor()) ?? []
    if (!history.length) return 0
    const saved = await instance.service.savedRosters(id)
    if (!saved.length) return 0
    const sets = historySince(history, Math.min(...saved.map((roster) => roster.updatedAt)), CHANGE_SETS_READ)
    if (!sets.length) return 0
    const latestChangeAt = sets.at(-1)!.recordedAt
    let changed = 0
    for (let index = 0; index < saved.length; index += CHANGED_COUNT_BATCH_SIZE) {
      const batch = saved.slice(index, index + CHANGED_COUNT_BATCH_SIZE)
      const uncertain: typeof batch = []
      for (const roster of batch) {
        if (roster.updatedAt >= latestChangeAt) continue
        const result = rosterChangeWithoutPricing(roster, sets)
        if (result === 'changed') changed++
        else if (result === 'needs-price') uncertain.push(roster)
      }
      if (uncertain.length) {
        const verdicts = await cachedRosterVerdictsFor(uncertain)
        changed += uncertain.filter((roster, at) => rosterStatus(roster, verdicts[at]!, sets).changes > 0).length
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
      const [navigation, price] = await Promise.all([app().factionsFor(), cachedRosterPrice(access.roster)])
      const faction = navigation?.factions.find((candidate) => candidate.id === access.roster.catalogueId) ?? null
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

export const savedRosterPrice = createServerFn({ method: 'GET' })
  .validator(rosterInBattleSchema)
  .handler(({ data }) =>
    rpc(async () => {
      const roster = await app().service.sharedRoster(data.id, await currentUserId(), data.battle ?? null)
      return roster ? cachedRosterPrice(roster) : null
    }),
  )

export const saveRoster = createServerFn({ method: 'POST' })
  .validator(saveRosterSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      const instance = app()
      const { id, created, updatedAt } = await saveOwnedRoster(player.id, data)
      // Counted when a row is made, which a visitor's list does while arriving with the id it was built under.
      if (created)
        await instance.telemetry.capture(player.id, 'roster_created', {
          ...rosterTelemetryProperties(data, await instance.catalogueFor(data.catalogueId), await instance.rulesFor()),
          unit_count: attachedUnitCount(data.picks.map((pick, key) => ({ key, attachedTo: pick.attachedTo }))),
          source: data.source,
          visibility: data.visibility,
        })
      return { id, updatedAt }
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

export const importRoster = createServerFn({ method: 'POST' })
  .validator(importRosterSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const instance = app()
      const factionName = importRosterFaction(data.file)
      const factions = (await instance.factionsFor())?.factions ?? []
      const faction = factionName ? factions.find((candidate) => matchesImportFaction(factionName, candidate.name)) : null
      const loaded = faction ? await instance.catalogueFor(faction.id) : null
      if (faction && !loaded) throw new Response('army data is not available', { status: 409 })
      const rules = await instance.rulesFor()
      const result = importRosterFile(
        data,
        loaded,
        factions.map((candidate) => candidate.name),
      )
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
      const rules = await instance.rulesFor()
      const priced = calculateRosterPrice(data, loaded, rules)
      if (!priced) throw new Response('army data is not available', { status: 409 })
      const dispositionNames = priced.dispositions.map((disposition) => rules?.dispositions.get(disposition) ?? disposition)
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
