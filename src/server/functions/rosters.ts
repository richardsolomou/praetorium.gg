import { createServerFn } from '@tanstack/react-start'
import { app } from '../app'
import { currentUserId, requireUser } from '../playerSession'
import { calculateRosterPoints, calculateRosterPrice } from '../pricing'
import { mutationRpc, rpc } from '../rpc'
import { exportRosterFile, importRosterFile } from '../rosterFiles'
import {
  exportRosterSchema,
  importRosterSchema,
  priceSchema,
  rosterIdSchema,
  rosterInBattleSchema,
  rosterVisibilitySchema,
  saveRosterSchema,
} from '../schemas'

export const priceRoster = createServerFn({ method: 'POST' })
  .validator(priceSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const startedAt = performance.now()
      const result = calculateRosterPrice(data)
      const userId = await currentUserId()
      if (userId && Math.random() < 0.1)
        await app().telemetry.capture(userId, 'roster_priced', {
          sample_rate: 0.1,
          unit_count: data.units.length,
          duration_ms: Math.round(performance.now() - startedAt),
          error_count: result?.errors.length ?? 0,
          unhandled_count: result?.unhandled.length ?? 0,
        })
      return result
    }),
  )

export const savedRosters = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => {
    const id = await currentUserId()
    return id ? app().service.savedRosters(id) : []
  }),
)

export const savedRosterSummaries = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => {
    const id = await currentUserId()
    return id ? app().service.savedRosterSummaries(id) : []
  }),
)

/**
 * A list's points change only when the list or the catalogue does, and both are in
 * the key: `updatedAt` moves with every save and the revision with every snapshot.
 * A stale entry can therefore never be served, only evicted.
 */
const rosterPointsCache = new Map<string, number | null>()
const ROSTER_POINTS_CACHE_LIMIT = 10_000

function rosterRevisionKey(roster: { id: string; updatedAt: Date | number }) {
  const revision = app().catalogue()?.index.revision ?? 'none'
  return `${roster.id}:${new Date(roster.updatedAt).getTime()}:${revision}`
}

function cachedRosterPoints(roster: {
  id: string
  updatedAt: Date | number
  catalogueId: string
  detachmentIds: string[]
  disposition: string | null
  limit: number
  picks: Parameters<typeof calculateRosterPoints>[0]['units']
}) {
  const key = rosterRevisionKey(roster)
  const cached = rosterPointsCache.get(key)
  if (cached !== undefined || rosterPointsCache.has(key)) return cached ?? null
  const points = calculateRosterPoints({
    catalogueId: roster.catalogueId,
    detachmentIds: roster.detachmentIds,
    disposition: roster.disposition,
    limit: roster.limit,
    units: roster.picks,
  })
  if (rosterPointsCache.size >= ROSTER_POINTS_CACHE_LIMIT) {
    const oldest = rosterPointsCache.keys().next().value
    if (oldest !== undefined) rosterPointsCache.delete(oldest)
  }
  rosterPointsCache.set(key, points)
  return points
}

export const savedRosterPoints = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => {
    const id = await currentUserId()
    if (!id) return []
    const saved = await app().service.savedRosters(id)
    return saved.map((roster) => ({ id: roster.id, points: cachedRosterPoints(roster) }))
  }),
)

const rosterPriceCache = new Map<string, ReturnType<typeof calculateRosterPrice>>()
const ROSTER_PRICE_CACHE_LIMIT = 500

function cachedRosterPrice(roster: {
  id: string
  updatedAt: Date | number
  catalogueId: string
  detachmentIds: string[]
  disposition: string | null
  limit: number
  picks: Parameters<typeof calculateRosterPrice>[0]['units']
}) {
  const key = rosterRevisionKey(roster)
  const cached = rosterPriceCache.get(key)
  if (cached !== undefined || rosterPriceCache.has(key)) return cached ?? null
  const price = calculateRosterPrice({
    catalogueId: roster.catalogueId,
    detachmentIds: roster.detachmentIds,
    disposition: roster.disposition,
    limit: roster.limit,
    units: roster.picks,
  })
  if (rosterPriceCache.size >= ROSTER_PRICE_CACHE_LIMIT) {
    const oldest = rosterPriceCache.keys().next().value
    if (oldest !== undefined) rosterPriceCache.delete(oldest)
  }
  rosterPriceCache.set(key, price)
  return price
}

export const sharedRoster = createServerFn({ method: 'GET' })
  .validator(rosterInBattleSchema)
  .handler(({ data }) => rpc(async () => app().service.sharedRoster(data.id, await currentUserId(), data.battle ?? null)))

export const rosterAccess = createServerFn({ method: 'GET' })
  .validator(rosterInBattleSchema)
  .handler(({ data }) =>
    rpc(async () => {
      const access = await app().service.rosterAccess(data.id, await currentUserId(), data.battle ?? null)
      return access ? { ...access, price: cachedRosterPrice(access.roster) } : null
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
      const result = await app().service.saveRoster(player.id, data)
      if (!data.id)
        await app().telemetry.capture(player.id, 'roster_created', {
          unit_count: data.picks.length,
          source: data.source,
          visibility: data.visibility,
        })
      return result
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
      const loaded = app().catalogue()
      if (!loaded) throw new Response('this instance has no catalogue', { status: 409 })
      const result = importRosterFile(data, loaded)
      const userId = await currentUserId()
      if (userId) await app().telemetry.capture(userId, 'roster_imported', { unit_count: result.units.length, source: result.source })
      return result
    }),
  )

export const exportRoster = createServerFn({ method: 'POST' })
  .validator(exportRosterSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const loaded = app().catalogue()
      if (!loaded) throw new Response('this instance has no catalogue', { status: 409 })
      const priced = calculateRosterPrice(data)
      if (!priced) throw new Response('this instance has no catalogue', { status: 409 })
      const dispositionNames = priced.dispositions.map((disposition) => app().rules()?.dispositions.get(disposition) ?? disposition)
      const result = exportRosterFile(data, loaded, { ...priced, disposition: priced.disposition ?? null }, dispositionNames)
      const userId = await currentUserId()
      if (userId) await app().telemetry.capture(userId, 'roster_exported', { unit_count: data.units.length })
      return result
    }),
  )
