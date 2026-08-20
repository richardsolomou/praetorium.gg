import { createServerFn } from '@tanstack/react-start'
import { app } from './app'
import { configuredProviders } from 'ras-stack/auth'
import { SOCIAL_PROVIDERS } from '../authConfig'
import { routeSlug } from '../core/slug'
import { nameOf } from '../core/catalogue'
import { buildUnit } from '../core/roster'
import { datasheetIn, datasheetInBySlug, rulesReferencedIn } from './catalogue'
import { datasheetSlug, datasheetsOf } from './catalogueIndex'
import { describeDatasheetAbilities } from './datasheetDescriptions'
import { detachmentReference } from './detachmentReference'
import { factionIndexFor, factionsFor } from './factionReferences'
import { factionDisplayName } from './factionNames'
import { isMatchedPlayDatasheet, unitsIn } from './cataloguePicker'
import { slug } from './rules'
import { gameReferencesFor } from './gameReferences'
import { mutationRpc, rpc } from './rpc'
import { calculateRosterPrice, rosterDetachments } from './pricing'
import { exportRosterFile, importRosterFile } from './rosterFiles'
import { currentUser, currentUserId, requireUser, requireUserId } from './playerSession'
import {
  createBattleSchema,
  deleteBattleSchema,
  datasheetSchema,
  datasheetSlugSchema,
  detachmentRulesSchema,
  detachmentDetailSchema,
  exportRosterSchema,
  favouriteFactionSchema,
  globalSearchSchema,
  friendSchema,
  importRosterSchema,
  priceSchema,
  ownedSchema,
  userSchema,
  rosterIdSchema,
  rosterInBattleSchema,
  saveRosterSchema,
  rosterVisibilitySchema,
  submitSchema,
  terrainReferencesSchema,
  tokenSchema,
  unitsSchema,
} from './schemas'

/** Reads answer null for a link that points at nothing, so the route can render a real 404. */
function orNull<T>(work: () => T) {
  try {
    return work()
  } catch (error) {
    if (error instanceof Response && error.status === 404) return null
    throw error
  }
}

export const me = createServerFn({ method: 'GET' }).handler(() => rpc(() => currentUser()))

export const userProfile = createServerFn({ method: 'GET' })
  .validator(userSchema)
  .handler(({ data }) =>
    rpc(async () => {
      const viewerId = await currentUserId()
      return viewerId ? app().service.userProfile(viewerId, data.userId) : null
    }),
  )

export const myBattles = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => {
    const id = await currentUserId()
    return id ? app().service.battles(id, app().rules()) : []
  }),
)

export const opponents = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => {
    const id = await currentUserId()
    return id ? app().service.opponents(id) : []
  }),
)

export const friendships = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => {
    const id = await currentUserId()
    return id ? app().service.friendships(id) : { friends: [], incoming: [], outgoing: [], people: [] }
  }),
)

export const requestFriend = createServerFn({ method: 'POST' })
  .validator(friendSchema)
  .handler(({ data }) => mutationRpc(async () => app().service.requestFriend(await requireUserId(), data.userId)))

export const acceptFriend = createServerFn({ method: 'POST' })
  .validator(friendSchema)
  .handler(({ data }) => mutationRpc(async () => app().service.acceptFriend(await requireUserId(), data.userId)))

export const removeFriend = createServerFn({ method: 'POST' })
  .validator(friendSchema)
  .handler(({ data }) => mutationRpc(async () => app().service.removeFriend(await requireUserId(), data.userId)))

export const openBattle = createServerFn({ method: 'GET' })
  .validator(tokenSchema)
  .handler(({ data }) =>
    rpc(async () => {
      const player = await currentUserId()
      return orNull(() => app().service.screen(data.token, player, app().rules()))
    }),
  )

export const createBattle = createServerFn({ method: 'POST' })
  .validator(createBattleSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      const result = app().service.createBattle(player.id, data)
      await app().telemetry.capture(player.id, 'battle_created', { solo: data.solo, limit: data.limit })
      return result
    }),
  )

export const deleteBattle = createServerFn({ method: 'POST' })
  .validator(deleteBattleSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      app().service.deleteBattle(data.token, player.id)
      await app().telemetry.capture(player.id, 'battle_deleted')
      return null
    }),
  )

export const joinBattle = createServerFn({ method: 'POST' })
  .validator(tokenSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      const result = app().service.join(data.token, player.id)
      await app().telemetry.capture(player.id, 'battle_joined')
      return result
    }),
  )

/**
 * Every change to a battle comes through here. The result is the domain's answer,
 * not an exception: a refusal is something to show the player, and a stale seq is
 * something the answer's own screen already corrects.
 */
export const submit = createServerFn({ method: 'POST' })
  .validator(submitSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      const result = app().service.submit(data.token, player.id, data.expectedSeq, data.command, app().rules())
      await app().telemetry.capture(player.id, 'battle_command_submitted', { command: data.command.kind })
      return result
    }),
  )

/** The datasheets this player owns, so the picker can be asked to show only those. */
export const collection = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => {
    const id = await currentUserId()
    return id ? app().service.collection(id) : []
  }),
)

export const setOwned = createServerFn({ method: 'POST' })
  .validator(ownedSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      const result = app().service.setOwned(player.id, data.entryId, data.owned)
      await app().telemetry.capture(player.id, 'player_collection_updated', { owned: data.owned })
      return result
    }),
  )

export const favouriteFactions = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => {
    const id = await currentUserId()
    return id ? app().service.favouriteFactions(id) : []
  }),
)

export const setFavouriteFaction = createServerFn({ method: 'POST' })
  .validator(favouriteFactionSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      app().service.setFavouriteFaction(player.id, data.catalogueId, data.favourite)
      return null
    }),
  )

/** How the community data is doing, so a fresh instance can say so rather than look broken. */
export const catalogueStatus = createServerFn({ method: 'GET' }).handler(() => rpc(() => app().sync()))

/** Null on an instance with no catalogue data, so the interface can simply not offer list building. */
export const factions = createServerFn({ method: 'GET' }).handler(() =>
  rpc(() => {
    const loaded = app().catalogue()
    if (!loaded) return null
    return factionsFor(loaded, app().rules())
  }),
)

export const factionIndex = createServerFn({ method: 'GET' }).handler(() =>
  rpc(() => {
    const loaded = app().catalogue()
    if (!loaded) return null
    return factionIndexFor(loaded, app().rules())
  }),
)

export type GlobalSearchResult = {
  id: string
  group: 'Pages' | 'Factions' | 'Datasheets' | 'Detachments' | 'Missions' | 'Your rosters' | 'Your battles'
  label: string
  detail: string
  href: string
}

export const globalSearch = createServerFn({ method: 'GET' })
  .validator(globalSearchSchema)
  .handler(({ data }) =>
    rpc(async () => {
      const wanted = data.query.toLowerCase()
      const results: GlobalSearchResult[] = []
      const loaded = app().catalogue()
      const rules = app().rules()

      if (loaded) {
        const available = factionsFor(loaded, rules)
        for (const faction of available.factions) {
          const factionMatches = `${faction.displayName} ${faction.name}`.toLowerCase().includes(wanted)
          if (factionMatches) {
            results.push({
              id: `faction:${faction.id}`,
              group: 'Factions',
              label: faction.displayName,
              detail: 'Faction reference',
              href: `/factions/${faction.slug}`,
            })
          }
          for (const detachment of faction.detachments) {
            if (!detachment.name.toLowerCase().includes(wanted)) continue
            results.push({
              id: `detachment:${faction.id}:${detachment.id}`,
              group: 'Detachments',
              label: detachment.name,
              detail: faction.displayName,
              href: `/factions/${faction.slug}/reference/detachments/${detachment.slug}`,
            })
          }
          for (const entryId of datasheetsOf(loaded.index, faction.id)) {
            const entry = loaded.index.definitions.get(entryId)
            if (!entry || !isMatchedPlayDatasheet(loaded.index, entry)) continue
            const name = nameOf(entry, loaded.index.definitions)
            if (!name.toLowerCase().includes(wanted)) continue
            results.push({
              id: `datasheet:${faction.id}:${entryId}`,
              group: 'Datasheets',
              label: name,
              detail: faction.displayName,
              href: `/factions/${faction.slug}/datasheets/${datasheetSlug(loaded, faction.id, entryId)}`,
            })
          }
        }
      }

      if (rules) {
        const references = gameReferencesFor(rules)
        for (const pack of references.packs) {
          if (pack.name.toLowerCase().includes(wanted)) {
            results.push({
              id: `pack:${pack.id}`,
              group: 'Missions',
              label: pack.name,
              detail: 'Mission pack',
              href: `/mission-packs/${pack.id}`,
            })
          }
          for (const mission of pack.missions) {
            if (!mission.name.toLowerCase().includes(wanted)) continue
            results.push({
              id: `mission:${pack.id}:${mission.id}`,
              group: 'Missions',
              label: mission.name,
              detail: pack.name,
              href: `/mission-packs/${pack.id}`,
            })
          }
        }
        const firstPack = references.packs[0]
        if (firstPack) {
          for (const mission of references.secondaries) {
            if (!mission.name.toLowerCase().includes(wanted)) continue
            results.push({
              id: `secondary:${mission.key}`,
              group: 'Missions',
              label: mission.name,
              detail: 'Secondary mission',
              href: `/mission-packs/${firstPack.id}`,
            })
          }
        }
      }

      const userId = await currentUserId()
      if (userId) {
        for (const roster of app().service.savedRosters(userId)) {
          if (!roster.name.toLowerCase().includes(wanted)) continue
          results.push({
            id: `roster:${roster.id}`,
            group: 'Your rosters',
            label: roster.name,
            detail: `${roster.limit} points`,
            href: `/rosters/${roster.id}`,
          })
        }
        for (const battle of app().service.battles(userId, rules)) {
          const label = battle.armies.filter(Boolean).join(' vs ') || battle.players.join(' vs ')
          const searchable = `${label} ${battle.players.join(' ')} ${battle.mission?.name ?? ''}`.toLowerCase()
          if (!searchable.includes(wanted)) continue
          results.push({
            id: `battle:${battle.token}`,
            group: 'Your battles',
            label,
            detail: battle.mission?.name ?? battle.status,
            href: `/battles/${battle.token}`,
          })
        }
      }

      return ['Factions', 'Datasheets', 'Detachments', 'Missions', 'Your rosters', 'Your battles'].flatMap((group) =>
        results.filter((result) => result.group === group).slice(0, 12),
      )
    }),
  )

export const units = createServerFn({ method: 'GET' })
  .validator(unitsSchema)
  .handler(({ data }) =>
    rpc(() => {
      const loaded = app().catalogue()
      if (!loaded) return []
      const rules = app().rules()
      const names = rules?.factionNames
      const faction = loaded.factions.find((entry) => entry.id === data.catalogueId)
      const displayName = faction ? factionDisplayName(faction.name, names) : ''
      const restrictions = rules?.factionRestrictions.get(routeSlug(displayName))
      return unitsIn(loaded, data.catalogueId, data.query, { restrictions }).map((unit) => ({
        ...unit,
        alliedFaction: unit.alliedFaction ? factionDisplayName(unit.alliedFaction, names) : null,
      }))
    }),
  )

export const factionDatasheets = createServerFn({ method: 'GET' })
  .validator(unitsSchema)
  .handler(({ data }) =>
    rpc(() => {
      const loaded = app().catalogue()
      if (!loaded) return []
      const names = loaded.factionContents.get(
        routeSlug(
          factionDisplayName(loaded.factions.find((entry) => entry.id === data.catalogueId)?.name ?? '', app().rules()?.factionNames),
        ),
      )?.datasheets
      return unitsIn(loaded, data.catalogueId, data.query, { includeNames: names, limit: Number.POSITIVE_INFINITY })
    }),
  )

export const datasheet = createServerFn({ method: 'GET' })
  .validator(datasheetSchema)
  .handler(({ data }) =>
    rpc(() => {
      const loaded = app().catalogue()
      if (!loaded) return null
      const detachments = rosterDetachments(loaded, data.catalogueId, data.detachmentIds).selections
      const builtUnits = data.picks.flatMap((pick, index) => {
        const unit = buildUnit(pick.entryId, loaded.index, pick.models, pick.choices, {
          primaryCatalogueId: data.catalogueId,
          roster: detachments,
          spreads: pick.spreads,
          toggles: pick.toggles,
        })
        return unit ? [{ index, selection: unit.selection }] : []
      })
      const selected = builtUnits.findIndex((unit) => unit.index === data.pickIndex)
      const selections = [...detachments, ...builtUnits.map((unit) => unit.selection)]
      // A character and the unit it leads are one unit, so each is told about the
      // other: a relic that speaks of the bearer's unit has to reach both.
      const attachedTo = data.pickIndex === null ? undefined : data.picks[data.pickIndex]?.attachedTo
      const companions = builtUnits.flatMap((unit, at) =>
        data.picks[unit.index]?.attachedTo === data.pickIndex || unit.index === attachedTo ? [detachments.length + at] : [],
      )
      return describeDatasheetAbilities(
        loaded,
        data.catalogueId,
        datasheetIn(
          loaded,
          data.catalogueId,
          data.entryId,
          selected < 0
            ? undefined
            : { selections, unitSelectionIndex: detachments.length + selected, everyWeapon: data.everyWeapon, companions },
        ),
        app().rules(),
      )
    }),
  )

export const datasheetBySlug = createServerFn({ method: 'GET' })
  .validator(datasheetSlugSchema)
  .handler(({ data }) =>
    rpc(() => {
      const loaded = app().catalogue()
      return loaded
        ? describeDatasheetAbilities(loaded, data.catalogueId, datasheetInBySlug(loaded, data.catalogueId, data.slug), app().rules())
        : null
    }),
  )

/**
 * Prices a list in progress and says what is wrong with it.
 *
 * A POST because a list is too big for a query string, and it goes through
 * `mutationRpc` for the origin check even though it changes nothing. Each entry is
 * expanded to the smallest selection the data accepts, and the expansion is
 * returned so the roster that gets attached is exactly the one that was priced.
 */
export const priceRoster = createServerFn({ method: 'POST' })
  .validator(priceSchema)
  .handler(({ data }) => mutationRpc(() => calculateRosterPrice(data)))

/** Lists a player keeps between battles. Their own only; unlisted reads use the opaque-id route. */
export const savedRosters = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => {
    const id = await currentUserId()
    return id ? app().service.savedRosters(id) : []
  }),
)

export const sharedRoster = createServerFn({ method: 'GET' })
  .validator(rosterInBattleSchema)
  .handler(({ data }) =>
    rpc(async () => {
      const userId = await currentUserId()
      return app().service.sharedRoster(data.id, userId, data.battle ?? null)
    }),
  )

/** SSR pricing for a persisted roster: the URL carries only its opaque public id. */
export const savedRosterPrice = createServerFn({ method: 'GET' })
  .validator(rosterInBattleSchema)
  .handler(({ data }) =>
    rpc(async () => {
      const userId = await currentUserId()
      const roster = app().service.sharedRoster(data.id, userId, data.battle ?? null)
      return roster
        ? calculateRosterPrice({
            catalogueId: roster.catalogueId,
            detachmentIds: roster.detachmentIds,
            disposition: roster.disposition,
            limit: roster.limit,
            units: roster.picks,
          })
        : null
    }),
  )

export const saveRoster = createServerFn({ method: 'POST' })
  .validator(saveRosterSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      const result = app().service.saveRoster(player.id, data)
      await app().telemetry.capture(player.id, 'roster_saved', { unit_count: data.picks.length })
      return result
    }),
  )

export const deleteRoster = createServerFn({ method: 'POST' })
  .validator(rosterIdSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      app().service.deleteRoster(player.id, data.id)
      await app().telemetry.capture(player.id, 'roster_deleted')
      return null
    }),
  )

export const setRosterVisibility = createServerFn({ method: 'POST' })
  .validator(rosterVisibilitySchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      app().service.setRosterVisibility(player.id, data.id, data.visibility)
      await app().telemetry.capture(player.id, 'roster_visibility_updated', { visibility: data.visibility })
      return null
    }),
  )

/**
 * The stratagems a detachment brings and the secondary cards on offer.
 *
 * Null when the rules source has not been synced, so the interface falls back to
 * letting a player write their own down rather than offering nothing.
 */
export const detachmentRules = createServerFn({ method: 'GET' })
  .validator(detachmentRulesSchema)
  .handler(({ data }) =>
    rpc(() => {
      const rules = app().rules()
      const catalogue = app().catalogue()
      if (!rules || !catalogue) return null

      const faction = catalogue.index.catalogues.get(data.catalogueId)
      const factionSlug = faction ? slug(faction.name) : null
      const detachments = factionSlug ? rules.byDetachment.get(factionSlug) : undefined
      const details = factionSlug ? rules.detachmentDetails.get(factionSlug) : undefined
      // The same text the detachment page prints, so a stratagem reads the same wherever it is opened.
      const written = data.detachmentNames.flatMap((name) => details?.get(slug(name))?.stratagems ?? [])
      return {
        attribution: rules.attribution,
        dataslate: rules.dataslate,
        stratagems: data.detachmentNames.flatMap((name) => detachments?.get(slug(name)) ?? []),
        core: rules.core,
        secondaries: rules.secondaries,
        primaries: rules.primaries,
        written: written.map(({ id, type, description }) => ({ key: id, type, description })),
        keywordRules: rulesReferencedIn(
          catalogue,
          written.map((stratagem) => stratagem.description),
        ),
      }
    }),
  )

export const detachmentDetail = createServerFn({ method: 'GET' })
  .validator(detachmentDetailSchema)
  .handler(({ data }) =>
    rpc(() => {
      const rules = app().rules()
      const catalogue = app().catalogue()
      return rules && catalogue ? detachmentReference(catalogue, rules, data.catalogueId, data.slug) : null
    }),
  )

/** The battlefields on offer, as polygons, so the interface can draw one. */
export const deployments = createServerFn({ method: 'GET' }).handler(() =>
  rpc(() => {
    const rules = app().rules()
    return rules?.deployments ?? []
  }),
)

export const gameReferences = createServerFn({ method: 'GET' }).handler(() =>
  rpc(() => {
    const rules = app().rules()
    if (!rules) return null
    return gameReferencesFor(rules)
  }),
)

export const terrainReferences = createServerFn({ method: 'GET' })
  .validator(terrainReferencesSchema)
  .handler(({ data }) =>
    rpc(() => {
      const rules = app().rules()
      if (!rules) return { layouts: [], templates: [] }
      const wanted = new Set(data.matchupIds)
      return {
        layouts: rules.terrainLayouts.filter((layout) => wanted.has(layout.matchupId)),
        templates: rules.terrainTemplates,
      }
    }),
  )

/** Fetched only when someone opens the account of the battle, not on every nudge. */
export const battleReport = createServerFn({ method: 'GET' })
  .validator(tokenSchema)
  .handler(({ data }) => rpc(async () => app().service.report(data.token, await requireUserId())))

/**
 * Reads a `.ros`, `.rosz`, BattleBase, or NewRecruit export into picks this instance can price.
 *
 * Both sides read the same community catalogues, so an entry id from another tool
 * is the same id here. Anything that cannot be placed is named in the answer rather
 * than dropped quietly.
 */
export const importRoster = createServerFn({ method: 'POST' })
  .validator(importRosterSchema)
  .handler(({ data }) =>
    mutationRpc(() => {
      const loaded = app().catalogue()
      if (!loaded) throw new Response('this instance has no catalogue', { status: 409 })

      return importRosterFile(data, loaded)
    }),
  )

/** A human-readable GW-style document for the list the builder is showing. */
export const exportRoster = createServerFn({ method: 'POST' })
  .validator(exportRosterSchema)
  .handler(({ data }) =>
    mutationRpc(() => {
      const loaded = app().catalogue()
      if (!loaded) throw new Response('this instance has no catalogue', { status: 409 })

      const priced = calculateRosterPrice(data)
      if (!priced) throw new Response('this instance has no catalogue', { status: 409 })
      const dispositionName = priced.disposition ? (app().rules()?.dispositions.get(priced.disposition) ?? priced.disposition) : null
      return exportRosterFile(data, loaded, priced, dispositionName)
    }),
  )

/** What this instance can actually offer at sign-in, so the page shows only that. */
export const signInOptions = createServerFn({ method: 'GET' }).handler(() =>
  rpc(() => ({ providers: configuredProviders(SOCIAL_PROVIDERS) })),
)
