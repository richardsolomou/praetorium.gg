import { createServerFn } from '@tanstack/react-start'
import { attachedUnitCount } from '../../core/attachedUnits'
import { changesTouching } from '../../core/catalogueChanges'
import { historySince } from '../../core/catalogueHistory'
import { app } from '../app'
import { currentUserId, requireUser } from '../playerSession'
import { calculateRosterPrice } from '../pricing'
import { cachedRosterPrice, cachedRosterTotals, cachedRosterVerdict } from '../rosterPrices'
import { mutationRpc, rpc } from '../rpc'
import { exportRosterFile, importRosterFaction, importRosterFile, matchesImportFaction } from '../rosterFiles'
import { rosterTelemetryProperties } from '../rosterTelemetry'
import { rosterStatus, rosterVerdict } from '../rosterStatus'
import {
  exportRosterSchema,
  importRosterSchema,
  priceSchema,
  rosterIdSchema,
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
      const totals = []
      for (const roster of priceable) {
        const value = await cachedRosterTotals(roster)
        totals.push({ id: roster.id, points: value?.points ?? null, label: value?.label ?? '' })
      }
      return { rosters: summaries, totals }
    }),
  )

export const savedRosterTotals = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => {
    const id = await currentUserId()
    if (!id) return []
    const saved = await app().service.savedRosters(id)
    const totals = []
    for (const roster of saved) {
      const value = await cachedRosterTotals(roster)
      totals.push({ id: roster.id, points: value?.points ?? null, label: value?.label ?? '' })
    }
    return totals
  }),
)

export const sharedRoster = createServerFn({ method: 'GET' })
  .validator(rosterInBattleSchema)
  .handler(({ data }) => rpc(async () => app().service.sharedRoster(data.id, await currentUserId(), data.battle ?? null)))

async function accessibleRoster(data: { id: string; battle?: string }) {
  const access = await app().service.rosterAccess(data.id, await currentUserId(), data.battle ?? null)
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

/**
 * Which of a player's lists the current data says they cannot field, and how many data
 * updates since each was saved reached something in it.
 *
 * Asked separately from the totals, which the library row cannot draw without: judging a
 * list prices every unit's projection, and a row's points should not wait for it.
 */
export const savedRosterStatus = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => {
    const id = await currentUserId()
    if (!id) return []
    const instance = app()
    const saved = await instance.service.savedRosters(id)
    if (!saved.length) return []
    const sets = historySince(
      (await instance.catalogueHistoryFor()) ?? [],
      Math.min(...saved.map((roster) => roster.updatedAt)),
      CHANGE_SETS_READ,
    )
    const statuses = []
    for (const roster of saved) statuses.push(rosterStatus(roster, await cachedRosterVerdict(roster), sets))
    return statuses
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
      const access = await accessibleRoster(data)
      if (!access) return null
      const price = await cachedRosterPrice(access.roster)
      return { ...access, price, changes: await changesSinceSaved(access.roster, price) }
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
      const { id, created } = await instance.service.saveRoster(player.id, data)
      // Counted when a row is made, which a visitor's list does while arriving with the id it was built under.
      if (created)
        await instance.telemetry.capture(player.id, 'roster_created', {
          ...rosterTelemetryProperties(data, await instance.catalogueFor(data.catalogueId), await instance.rulesFor()),
          unit_count: attachedUnitCount(data.picks.map((pick, key) => ({ key, attachedTo: pick.attachedTo }))),
          source: data.source,
          visibility: data.visibility,
        })
      return { id }
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
