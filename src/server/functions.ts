import { createServerFn } from '@tanstack/react-start'
import { app } from './app'
import { routeSlug } from '../core/slug'
import { attachedUnit } from '../core/attach'
import { buildUnit, type RosterPick } from '../core/roster'
import { datasheetIn, datasheetInBySlug, datasheetViewsIn, rulesReferencedIn, unitWoundsIn } from './catalogue'
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
import { rosterDetachments, rosterSetupLabel } from './pricing'
import { currentUserId } from './playerSession'
import { cacheUntilSnapshotChanges } from './snapshotCache'
import { selectedDetachmentRules } from './selectedDetachmentRules'
import {
  datasheetSchema,
  datasheetSlugSchema,
  detachmentRulesSchema,
  detachmentDetailSchema,
  factionSchema,
  globalSearchSchema,
  savedRosterDatasheetSchema,
  terrainReferencesSchema,
  unitsSchema,
  unitWoundsSchema,
} from './schemas'

/** How the community data is doing, so a fresh instance can say so rather than look broken. */
export const catalogueStatus = createServerFn({ method: 'GET' }).handler(() => rpc(() => app().sync()))

export const factionIndex = createServerFn({ method: 'GET' }).handler(() =>
  rpc(() => {
    cacheUntilSnapshotChanges()
    const loaded = app().catalogue()
    if (!loaded) return null
    return factionIndexFor(loaded, app().rules())
  }),
)

/** One faction by slug or id, for pages that should not ship every faction. */
export const faction = createServerFn({ method: 'GET' })
  .validator(factionSchema)
  .handler(({ data }) =>
    rpc(() => {
      cacheUntilSnapshotChanges()
      const loaded = app().catalogue()
      if (!loaded) return null
      const { factions: all } = factionsFor(loaded, app().rules())
      return all.find((candidate) => candidate.slug === data.catalogueId || candidate.id === data.catalogueId) ?? null
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
          // Bounded: search offers the recently active battles, not a fold of every
          // battle the account has ever played on each keystroke.
          const [rosters, page] = await Promise.all([
            app().service.savedRosterSummaries(userId),
            app().service.battles(userId, app().rules(), { limit: 50 }),
          ])
          const loaded = app().catalogue()
          const rules = app().rules()
          return {
            rosters: rosters.map((roster) => ({
              ...roster,
              label: loaded ? rosterSetupLabel(loaded, rules, roster) : '',
            })),
            battles: page.battles,
          }
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
      const book = loaded.factions.find((entry) => entry.id === data.catalogueId)
      const displayName = book ? factionDisplayName(book.name, names) : ''
      const restrictions = rules?.factionRestrictions.get(routeSlug(displayName))
      return unitsIn(loaded, data.catalogueId, data.query, {
        restrictions,
        battleSize: data.battleSize,
        waivedRules: data.waivedRules,
      }).map((unit) => ({
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
      return unitsIn(loaded, data.catalogueId, data.query, { factionCards: true }).filter((unit) =>
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

/**
 * What one model of each of an army's datasheets can take, asked once as it is fielded.
 *
 * Read here rather than in pricing because pricing runs on every keystroke in the
 * builder and this does not: a battle needs the number once, at the moment the list
 * is attached, and it is frozen into the log with the rest of the list from then on.
 *
 * A datasheet whose models disagree, or that this instance cannot read, is simply
 * absent from the answer. The unit is then counted in models, which is what it was
 * before anyone asked.
 */
export const unitWounds = createServerFn({ method: 'GET' })
  .validator(unitWoundsSchema)
  .handler(({ data }) =>
    rpc(() => {
      const loaded = app().catalogue()
      if (!loaded) return []
      return unitWoundsIn(loaded, data.catalogueId, data.entryIds)
    }),
  )

export const datasheetBySlug = createServerFn({ method: 'GET' })
  .validator(datasheetSlugSchema)
  .handler(({ data }) =>
    rpc(() => {
      cacheUntilSnapshotChanges()
      const loaded = app().catalogue()
      return loaded
        ? describeDatasheetAbilities(loaded, data.catalogueId, datasheetInBySlug(loaded, data.catalogueId, data.slug), app().rules())
        : null
    }),
  )

/**
 * The stratagems a detachment brings, and the words printed on them.
 *
 * Only what is actually per army. The mission cards are the instance's and travel
 * with the game references instead: asked for here, a 2v1 fetched the whole deck
 * three times over and shipped all three copies in the page.
 *
 * Null when the rules source has not been synced, so the interface falls back to
 * letting a player write their own down rather than offering nothing.
 */
export const detachmentRules = createServerFn({ method: 'GET' })
  .validator(detachmentRulesSchema)
  .handler(({ data }) =>
    rpc(() => {
      cacheUntilSnapshotChanges()
      const rules = app().rules()
      const catalogue = app().catalogue()
      if (!rules || !catalogue) return null

      const book = catalogue.index.catalogues.get(data.catalogueId)
      const factionSlug = book ? routeSlug(book.name) : null
      const detachments = factionSlug ? rules.byDetachment.get(rulesFaction(rules, factionSlug)) : undefined
      const details = factionSlug ? rules.detachmentDetails.get(rulesFaction(rules, factionSlug)) : undefined
      // Detachment cards use the same text as their reference page; core cards join them from Game Datacards.
      const selected = selectedDetachmentRules(data.detachmentNames, detachments, details)
      const written = [...selected.written, ...rules.coreDetails]
      return {
        attribution: rules.attribution,
        dataslate: rules.dataslate,
        stratagems: selected.live,
        core: rules.core,
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
      cacheUntilSnapshotChanges()
      const rules = app().rules()
      const catalogue = app().catalogue()
      return rules && catalogue ? detachmentReference(catalogue, rules, data.catalogueId, data.slug) : null
    }),
  )

/** The battlefields on offer, as polygons, so the interface can draw one. */
export const deployments = createServerFn({ method: 'GET' }).handler(() =>
  rpc(() => {
    cacheUntilSnapshotChanges()
    const rules = app().rules()
    return rules?.deployments ?? []
  }),
)

export const gameReferences = createServerFn({ method: 'GET' }).handler(() =>
  rpc(() => {
    cacheUntilSnapshotChanges()
    const rules = app().rules()
    if (!rules) return null
    return gameReferencesFor(rules)
  }),
)

export const terrainReferences = createServerFn({ method: 'GET' })
  .validator(terrainReferencesSchema)
  .handler(({ data }) =>
    rpc(() => {
      cacheUntilSnapshotChanges()
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
export * from './functions/leagues'
export * from './functions/rosters'
export type { GlobalSearchResult }
