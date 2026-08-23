import { createServerFn } from '@tanstack/react-start'
import { app } from './app'
import { routeSlug } from '../core/slug'
import { attachedUnit } from '../core/attach'
import { buildUnit, type RosterPick } from '../core/roster'
import { datasheetIn, datasheetInBySlug, datasheetViewsIn, rulesReferencedIn } from './catalogue'
import { isReferenceDatasheet } from './catalogueIndex'
import { describeDatasheetAbilities } from './datasheetDescriptions'
import { detachmentReference } from './detachmentReference'
import { factionIndexFor, factionsFor } from './factionReferences'
import { factionDisplayName } from './factionNames'
import { unitsIn } from './cataloguePicker'

import { gameReferencesFor } from './gameReferences'
import { rulesFaction } from './rules'
import { type GlobalSearchResult, searchEverything } from './globalSearch'
import { mutationRpc, rpc } from './rpc'
import { rosterDetachments } from './pricing'
import { currentUserId } from './playerSession'
import {
  datasheetSchema,
  datasheetSlugSchema,
  detachmentRulesSchema,
  detachmentDetailSchema,
  globalSearchSchema,
  savedRosterDatasheetSchema,
  terrainReferencesSchema,
  unitsSchema,
} from './schemas'

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

export const globalSearch = createServerFn({ method: 'GET' })
  .validator(globalSearchSchema)
  .handler(({ data }) =>
    rpc(async () =>
      searchEverything(data.query, {
        catalogue: app().catalogue(),
        rules: app().rules(),
        own: async () => {
          const userId = await currentUserId()
          if (!userId) return null
          const [rosters, battles] = await Promise.all([app().service.savedRosters(userId), app().service.battles(userId, app().rules())])
          return { rosters, battles }
        },
      }),
    ),
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
      return unitsIn(loaded, data.catalogueId, data.query, { includeNames: names }).filter((unit) =>
        isReferenceDatasheet(loaded, data.catalogueId, unit.id),
      )
    }),
  )

export const datasheet = createServerFn({ method: 'GET' })
  .validator(datasheetSchema)
  .handler(({ data }) =>
    rpc(() => {
      const loaded = app().catalogue()
      if (!loaded) return null
      const context = rosterDatasheetContext(loaded, data)
      return rosterDatasheet(loaded, data, context, data.everyWeapon)
    }),
  )

/**
 * Both views the loadout needs, after expanding the roster once.
 *
 * The chosen and offered weapon views differ only at the final datasheet
 * projection. Expanding every unit once per view made opening a unit scale at
 * twice the cost of its roster for no domain reason. A complete roster is too
 * large for a reliable query string, so this read uses POST and the same origin
 * check as roster pricing.
 */
export const loadoutDatasheets = createServerFn({ method: 'POST' })
  .validator(datasheetSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const startedAt = performance.now()
      const loaded = app().catalogue()
      if (!loaded) return null
      const result = rosterLoadoutDatasheets(loaded, data)
      const userId = await currentUserId()
      if (userId)
        await app().telemetry.capture(userId, 'roster_datasheet_loaded', {
          unit_count: data.picks.length,
          duration_ms: Math.round(performance.now() - startedAt),
          persisted: false,
        })
      return result
    }),
  )

/** A persisted read-only roster needs only its opaque id on the wire. */
export const savedRosterLoadoutDatasheets = createServerFn({ method: 'GET' })
  .validator(savedRosterDatasheetSchema)
  .handler(({ data }) =>
    rpc(async () => {
      const startedAt = performance.now()
      const userId = await currentUserId()
      const roster = await app().service.sharedRoster(data.id, userId, data.battle ?? null)
      const pick = roster?.picks[data.pickIndex]
      const loaded = app().catalogue()
      if (!roster || !pick || !loaded) return null
      const result = rosterLoadoutDatasheets(loaded, {
        catalogueId: roster.catalogueId,
        entryId: pick.entryId,
        detachmentIds: roster.detachmentIds,
        picks: roster.picks,
        pickIndex: data.pickIndex,
      })
      if (userId)
        await app().telemetry.capture(userId, 'roster_datasheet_loaded', {
          unit_count: roster.picks.length,
          duration_ms: Math.round(performance.now() - startedAt),
          persisted: true,
        })
      return result
    }),
  )

function rosterLoadoutDatasheets(
  loaded: NonNullable<ReturnType<ReturnType<typeof app>['catalogue']>>,
  data: {
    catalogueId: string
    entryId: string
    detachmentIds: string[]
    picks: RosterPick[]
    pickIndex: number | null
  },
) {
  const context = rosterDatasheetContext(loaded, data)
  const views = context ? datasheetViewsIn(loaded, data.catalogueId, data.entryId, context) : null
  return {
    selected: views
      ? describeDatasheetAbilities(loaded, data.catalogueId, views.selected, app().rules())
      : rosterDatasheet(loaded, data, undefined, false),
    available: views
      ? describeDatasheetAbilities(loaded, data.catalogueId, views.available, app().rules())
      : rosterDatasheet(loaded, data, undefined, true),
  }
}

function rosterDatasheetContext(
  loaded: NonNullable<ReturnType<ReturnType<typeof app>['catalogue']>>,
  data: {
    catalogueId: string
    detachmentIds: string[]
    picks: RosterPick[]
    pickIndex: number | null
  },
) {
  // A catalogue preview is not a roster selection. Without an index there is no
  // selected unit to receive contextual modifiers, so expanding the roster would
  // be work whose result is immediately discarded.
  if (data.pickIndex === null) return undefined
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
  // A character, the unit it joined and everything else joined to that unit are
  // one unit, so each is told about the others: a relic that speaks of the
  // bearer's unit has to reach every model in it.
  const attached = attachedUnit(data.picks, data.pickIndex)
  const companions = builtUnits.flatMap((unit, at) => (attached.includes(unit.index) ? [detachments.length + at] : []))
  return selected < 0 ? undefined : { selections, unitSelectionIndex: detachments.length + selected, companions }
}

function rosterDatasheet(
  loaded: NonNullable<ReturnType<ReturnType<typeof app>['catalogue']>>,
  data: { catalogueId: string; entryId: string },
  context: ReturnType<typeof rosterDatasheetContext>,
  everyWeapon: boolean,
) {
  return describeDatasheetAbilities(
    loaded,
    data.catalogueId,
    datasheetIn(loaded, data.catalogueId, data.entryId, context ? { ...context, everyWeapon } : undefined),
    app().rules(),
  )
}

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
      const factionSlug = faction ? routeSlug(faction.name) : null
      const detachments = factionSlug ? rules.byDetachment.get(rulesFaction(rules, factionSlug)) : undefined
      const details = factionSlug ? rules.detachmentDetails.get(rulesFaction(rules, factionSlug)) : undefined
      // Detachment cards use the same text as their reference page; core cards join them from Game Datacards.
      const written = [...data.detachmentNames.flatMap((name) => details?.get(routeSlug(name))?.stratagems ?? []), ...rules.coreDetails]
      return {
        attribution: rules.attribution,
        dataslate: rules.dataslate,
        stratagems: data.detachmentNames.flatMap((name) => detachments?.get(routeSlug(name)) ?? []),
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

/**
 * Reads a `.ros`, `.rosz`, BattleBase, or NewRecruit export into picks this instance can price.
 *
 * Both sides read the same community catalogues, so an entry id from another tool
 * is the same id here. Anything that cannot be placed is named in the answer rather
 * than dropped quietly.
 */
export * from './functions/accounts'
export * from './functions/battles'
export * from './functions/rosters'
export type { GlobalSearchResult }
