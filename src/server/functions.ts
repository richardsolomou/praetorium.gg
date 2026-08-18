import { createServerFn } from '@tanstack/react-start'
import { app } from './app'
import { configuredProviders } from 'ras-stack/auth'
import { SOCIAL_PROVIDERS } from '../authConfig'
import { routeSlug } from '../core/slug'
import { buildUnit } from '../core/roster'
import { datasheetIn, datasheetInBySlug, rulesReferencedIn } from './catalogue'
import { factionDisplayName } from './factionNames'
import { detachmentCatalogueDetail } from './catalogueDescriptions'
import type { LoadedCatalogue } from './catalogueIndex'
import { unitsIn } from './cataloguePicker'
import { type LoadedRules, slug } from './rules'
import { findAbilityDescription, WAHAPEDIA_ATTRIBUTION } from './wahapedia'
import { mutationRpc, rpc } from './rpc'
import { calculateRosterPrice, rosterDetachments } from './pricing'
import { exportRosterFile, importRosterFile } from './rosterFiles'
import { currentPlayer, currentPlayerId, requirePlayer, requirePlayerId } from './playerSession'
import {
  createBattleSchema,
  deleteBattleSchema,
  datasheetSchema,
  datasheetSlugSchema,
  detachmentRulesSchema,
  detachmentDetailSchema,
  exportRosterSchema,
  favouriteFactionSchema,
  importRosterSchema,
  joinBattleSchema,
  priceSchema,
  ownedSchema,
  rosterIdSchema,
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

export const me = createServerFn({ method: 'GET' }).handler(() => rpc(() => currentPlayer()))

export const myBattles = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => {
    const id = await currentPlayerId()
    return id ? app().service.battles(id, app().rules()) : []
  }),
)

export const opponents = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => {
    const id = await currentPlayerId()
    return id ? app().service.opponents(id) : []
  }),
)

export const openBattle = createServerFn({ method: 'GET' })
  .validator(tokenSchema)
  .handler(({ data }) =>
    rpc(async () => {
      const player = await currentPlayerId()
      return orNull(() => app().service.screen(data.token, player, app().rules()))
    }),
  )

export const createBattle = createServerFn({ method: 'POST' })
  .validator(createBattleSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requirePlayer()
      const result = app().service.createBattle(player.id, data)
      await app().telemetry.capture(player.userId, 'battle_created', { solo: data.solo, limit: data.limit })
      return result
    }),
  )

export const deleteBattle = createServerFn({ method: 'POST' })
  .validator(deleteBattleSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requirePlayer()
      app().service.deleteBattle(data.token, player.id)
      await app().telemetry.capture(player.userId, 'battle_deleted')
      return null
    }),
  )

export const joinBattle = createServerFn({ method: 'POST' })
  .validator(joinBattleSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requirePlayer()
      const result = app().service.join(data.token, player.id)
      await app().telemetry.capture(player.userId, 'battle_joined')
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
      const player = await requirePlayer()
      const result = app().service.submit(data.token, player.id, data.expectedSeq, data.command, app().rules())
      await app().telemetry.capture(player.userId, 'battle_command_submitted', { command: data.command.kind })
      return result
    }),
  )

/** The datasheets this player owns, so the picker can be asked to show only those. */
export const collection = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => {
    const id = await currentPlayerId()
    return id ? app().service.collection(id) : []
  }),
)

export const setOwned = createServerFn({ method: 'POST' })
  .validator(ownedSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requirePlayer()
      const result = app().service.setOwned(player.id, data.entryId, data.owned)
      await app().telemetry.capture(player.userId, 'player_collection_updated', { owned: data.owned })
      return result
    }),
  )

export const favouriteFactions = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => {
    const id = await currentPlayerId()
    return id ? app().service.favouriteFactions(id) : []
  }),
)

export const setFavouriteFaction = createServerFn({ method: 'POST' })
  .validator(favouriteFactionSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requirePlayer()
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
    const rules = app().rules()
    return {
      revision: loaded.index.revision,
      factions: loaded.factions.map((faction) => {
        const displayName = factionDisplayName(faction.name, rules?.factionNames)
        const content = loaded.factionContents.get(routeSlug(displayName))
        const detachments = loaded.detachments.get(faction.id)?.options ?? []
        const referenceDetachments = detachments.filter(
          (detachment) => !content || [...content.detachments].some((name) => slug(name) === slug(detachment.name)),
        )
        return {
          id: faction.id,
          slug: routeSlug(displayName),
          name: faction.name,
          displayName,
          icon: rules?.factionIcons.has(routeSlug(displayName)) ? `/api/faction-icons/${routeSlug(displayName)}` : null,
          armyRule: rules?.factionRules.get(routeSlug(displayName)) ?? null,
          references: faction.references.map((reference) => ({
            ...reference,
            datasheets: content?.datasheets.size ?? reference.datasheets,
            detachments: referenceDetachments.length,
          })),
          referenceDetachmentIds: referenceDetachments.map((detachment) => detachment.id),
          detachments: detachments.map((detachment) => {
            const reference = rules?.detachmentReferences.get(slug(faction.name))?.get(slug(detachment.name))
            const detail = rules?.detachmentDetails.get(slug(faction.name))?.get(slug(detachment.name))
            const forced = detachmentCatalogueDetail(loaded, faction.id, detachment.id, [])?.forcedEnhancements ?? []
            return {
              id: detachment.id,
              slug: slug(detachment.name),
              name: detachment.name,
              disposition: detachment.disposition,
              dispositions: reference?.dispositions.length
                ? reference.dispositions.map((id) => ({ id, name: rules?.dispositions.get(id) ?? id }))
                : detachment.disposition
                  ? [{ id: detachment.disposition, name: rules?.dispositions.get(detachment.disposition) ?? detachment.disposition }]
                  : [],
              reference: reference
                ? {
                    ...reference,
                    enhancements: new Set([
                      ...(detail?.enhancements.map((enhancement) => enhancement.name) ?? []),
                      ...forced.map((entry) => entry.name),
                    ]).size,
                    dispositions: reference.dispositions.map((disposition) => rules?.dispositions.get(disposition) ?? disposition),
                  }
                : null,
            }
          }),
        }
      }),
    }
  }),
)

export const factionIndex = createServerFn({ method: 'GET' }).handler(() =>
  rpc(() => {
    const loaded = app().catalogue()
    if (!loaded) return null
    const rules = app().rules()
    return {
      revision: loaded.index.revision,
      factions: loaded.factions.map((faction) => {
        const displayName = factionDisplayName(faction.name, rules?.factionNames)
        const slugId = routeSlug(displayName)
        const content = loaded.factionContents.get(slugId)
        const referenceDetachments = (loaded.detachments.get(faction.id)?.options ?? []).filter(
          (detachment) => !content || [...content.detachments].some((name) => slug(name) === slug(detachment.name)),
        )
        return {
          id: faction.id,
          slug: slugId,
          name: faction.name,
          displayName,
          icon: rules?.factionIcons.has(slugId) ? `/api/faction-icons/${slugId}` : null,
          references: faction.references.map((reference) => ({
            ...reference,
            datasheets: content?.datasheets.size ?? reference.datasheets,
            detachments: referenceDetachments.length,
          })),
        }
      }),
    }
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
      return describeAbilities(
        loaded,
        datasheetIn(
          loaded,
          data.catalogueId,
          data.entryId,
          selected < 0 ? undefined : { selections, unitSelectionIndex: detachments.length + selected },
        ),
      )
    }),
  )

export const datasheetBySlug = createServerFn({ method: 'GET' })
  .validator(datasheetSlugSchema)
  .handler(({ data }) =>
    rpc(() => {
      const loaded = app().catalogue()
      return loaded ? describeAbilities(loaded, datasheetInBySlug(loaded, data.catalogueId, data.slug)) : null
    }),
  )

function describeAbilities(loaded: LoadedCatalogue, sheet: ReturnType<typeof datasheetIn>) {
  if (!sheet) return null
  const descriptions = app().rules()?.abilityDescriptions
  if (!descriptions) return { ...sheet, attribution: null }
  const supplied = sheet.abilities.some((ability) => !ability.description && findAbilityDescription(descriptions, ability.name))
  const abilities = sheet.abilities.map((ability) => ({
    ...ability,
    description: ability.description ?? findAbilityDescription(descriptions, ability.name),
  }))
  return {
    ...sheet,
    abilities,
    keywordRules: mergeKeywordRules(
      rulesReferencedIn(
        loaded,
        abilities.map((ability) => ability.description),
      ),
      sheet.keywordRules,
    ),
    attribution: supplied ? WAHAPEDIA_ATTRIBUTION : null,
  }
}

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
    const id = await currentPlayerId()
    return id ? app().service.savedRosters(id) : []
  }),
)

export const sharedRoster = createServerFn({ method: 'GET' })
  .validator(rosterIdSchema)
  .handler(({ data }) =>
    rpc(async () => {
      const playerId = await currentPlayerId()
      return app().service.sharedRoster(data.id, playerId)
    }),
  )

/** SSR pricing for a persisted roster: the URL carries only its opaque public id. */
export const savedRosterPrice = createServerFn({ method: 'GET' })
  .validator(rosterIdSchema)
  .handler(({ data }) =>
    rpc(async () => {
      const playerId = await currentPlayerId()
      const roster = app().service.sharedRoster(data.id, playerId)
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
      const player = await requirePlayer()
      const result = app().service.saveRoster(player.id, data)
      await app().telemetry.capture(player.userId, 'roster_saved', { unit_count: data.picks.length })
      return result
    }),
  )

export const deleteRoster = createServerFn({ method: 'POST' })
  .validator(rosterIdSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requirePlayer()
      app().service.deleteRoster(player.id, data.id)
      await app().telemetry.capture(player.userId, 'roster_deleted')
      return null
    }),
  )

export const setRosterVisibility = createServerFn({ method: 'POST' })
  .validator(rosterVisibilitySchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requirePlayer()
      app().service.setRosterVisibility(player.id, data.id, data.visibility)
      await app().telemetry.capture(player.userId, 'roster_visibility_updated', { visibility: data.visibility })
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
      const detachments = faction ? rules.byDetachment.get(slug(faction.name)) : undefined
      return {
        attribution: rules.attribution,
        dataslate: rules.dataslate,
        stratagems: data.detachmentNames.flatMap((name) => detachments?.get(slug(name)) ?? []),
        core: rules.core,
        secondaries: rules.secondaries,
        primaries: rules.primaries,
      }
    }),
  )

export const detachmentDetail = createServerFn({ method: 'GET' })
  .validator(detachmentDetailSchema)
  .handler(({ data }) =>
    rpc(() => {
      const rules = app().rules()
      const catalogue = app().catalogue()
      const faction = catalogue?.index.catalogues.get(data.catalogueId)
      if (!rules || !catalogue || !faction) return null
      const detail = rules.detachmentDetails.get(slug(faction.name))?.get(data.slug)
      const option = catalogue.detachments.get(data.catalogueId)?.options.find((candidate) => slug(candidate.name) === data.slug)
      if (!detail || !option) return null
      const catalogueDetail = detachmentCatalogueDetail(
        catalogue,
        data.catalogueId,
        option.id,
        [...detail.enhancements, ...detail.upgrades].map((enhancement) => enhancement.name),
      )
      const detachmentRuleCards = mergeDetachmentRules(catalogueDetail?.rule ?? null, detail.rules)
      const enhancements = [
        ...detail.enhancements.map((enhancement) => ({
          name: enhancement.name,
          points: enhancement.points,
          description:
            catalogueDetail?.enhancements.find((candidate) => candidate.name.toLocaleLowerCase() === enhancement.name.toLocaleLowerCase())
              ?.description ?? enhancement.description,
        })),
        ...(catalogueDetail?.forcedEnhancements.filter(
          (forced) => !detail.enhancements.some((enhancement) => enhancement.name.toLocaleLowerCase() === forced.name.toLocaleLowerCase()),
        ) ?? []),
      ].toSorted((left, right) => left.name.localeCompare(right.name))
      const upgrades = detail.upgrades.map((upgrade) => ({
        name: upgrade.name,
        points: upgrade.points,
        description:
          catalogueDetail?.enhancements.find((candidate) => candidate.name.toLocaleLowerCase() === upgrade.name.toLocaleLowerCase())
            ?.description ?? upgrade.description,
      }))
      return {
        ...detail,
        dispositions: detail.dispositions.map((disposition) => rules.dispositions.get(disposition) ?? disposition),
        rules: detachmentRuleCards,
        enhancements,
        upgrades,
        keywordRules: rulesReferencedIn(catalogue, [
          ...detachmentRuleCards.map((rule) => rule.description),
          ...enhancements.map((enhancement) => enhancement.description),
          ...upgrades.map((upgrade) => upgrade.description),
          ...detail.stratagems.map((stratagem) => stratagem.description),
        ]),
        attribution: rules.attribution,
      }
    }),
  )

function mergeDetachmentRules(
  catalogueRule: { name: string; description: string | null } | null,
  rules: readonly { name: string; description: string }[],
) {
  if (rules.length || !catalogueRule) return rules
  return [catalogueRule]
}

function mergeKeywordRules<T extends { name: string }>(preferred: readonly T[], fallback: readonly T[]) {
  return [...new Map([...fallback, ...preferred].map((rule) => [rule.name.toLocaleLowerCase(), rule])).values()]
}

/** The battlefields on offer, as polygons, so the interface can draw one. */
export const deployments = createServerFn({ method: 'GET' }).handler(() =>
  rpc(() => {
    const rules = app().rules()
    return rules?.deployments ?? []
  }),
)

function buildGameReferences(rules: LoadedRules) {
  const missions = [
    ...new Map([...rules.missions.values()].map((mission) => [`${mission.packId ?? 'legacy'}:${mission.id}`, mission])).values(),
  ]
  const matchupEntries = [
    ...new Map(
      [...rules.missions.entries()].map(([key, mission]) => {
        const parts = key.split('|')
        const pair = parts.slice(-2).join('|')
        return [`${mission.packId ?? 'legacy'}:${pair}`, [pair, mission] as const]
      }),
    ).values(),
  ]
  const primaryByKey = new Map(rules.primaries.map((card) => [card.key, card]))
  const matchupsByMission = new Map<string, string[]>()
  for (const [pair, mission] of matchupEntries) {
    const missionKey = `${mission.packId ?? 'legacy'}:${mission.id}`
    matchupsByMission.set(missionKey, [...(matchupsByMission.get(missionKey) ?? []), pair])
  }
  const missionsByPack = new Map<string, typeof missions>()
  for (const mission of missions) {
    if (!mission.source) continue
    missionsByPack.set(mission.source, [...(missionsByPack.get(mission.source) ?? []), mission])
  }
  const packs = [...missionsByPack].map(([name, packMissions]) => ({
    id: routeSlug(name),
    name,
    missions: packMissions.map((mission) => ({
      ...mission,
      card: primaryByKey.get(mission.id) ?? null,
      matchups: (matchupsByMission.get(`${mission.packId ?? 'legacy'}:${mission.id}`) ?? []).map((pair) =>
        pair.split('|').map((id) => ({ id, name: rules.dispositions.get(id) ?? id })),
      ),
    })),
  }))
  const dispositionDetails = rules.dispositionDetails ?? [...rules.dispositions].map(([id, name]) => ({ id, name, text: null }))
  return {
    dispositions: dispositionDetails.map((disposition) => ({
      ...disposition,
    })),
    packs,
    secondaries: rules.secondaries,
    deployments: rules.deployments,
    attribution: rules.attribution,
  }
}

const gameReferencesCache = new WeakMap<LoadedRules, ReturnType<typeof buildGameReferences>>()

export const gameReferences = createServerFn({ method: 'GET' }).handler(() =>
  rpc(() => {
    const rules = app().rules()
    if (!rules) return null
    const cached = gameReferencesCache.get(rules)
    if (cached) return cached
    const references = buildGameReferences(rules)
    gameReferencesCache.set(rules, references)
    return references
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
  .handler(({ data }) => rpc(async () => app().service.report(data.token, await requirePlayerId())))

/**
 * Reads a `.ros`, `.rosz`, or BattleBase text export into picks this instance can price.
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
