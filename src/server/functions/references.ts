import { rosterLoadoutDatasheets, rosterDatasheet } from '../../shared/rosterReads'
import { z } from 'zod'
import { rosterDatasheetLoadedProperties } from '../../shared/rosterTelemetry'
import { createServerFn } from '@tanstack/react-start'
import { app } from '../app'
import { unitBattleDetailsIn, unitWoundsIn } from '../../shared/catalogue'
import { publishedTextFiles } from '../publishedTextFiles'
import { booksOffering, pickerUnitsFor } from '../../shared/pickerUnits'
import { detachmentsOffering } from '../../shared/factionReferences'

import { gameReferencesFor } from '../../shared/gameReferences'
import { type GlobalSearchResult, searchEverything } from '../globalSearch'
import { mutationRpc, rpc } from '../rpc'
import { OWN_SEARCH_BATTLES, ownSearchLists, type OwnSearchData } from '../../core/referenceSearch'
import { rosterDatasheetContext } from '../../shared/rosterDatasheetContext'
import { rosterCombatant } from '../../shared/rosterCombatRules'
import { combatLoadoutSpace } from '../../shared/combatLoadouts'
import { currentUserId, forSignedIn } from '../playerSession'
import { preparePicker } from '../rosterPicker'
import { cacheUntilSnapshotChanges } from '../snapshotCache'
import { memoUntilSnapshotChanges } from '../snapshotMemo'
import { selectedBattleDetachmentData } from '../../shared/battleDetachmentData'
import {
  publishedDetachmentReference,
  referenceDatasheetBySlug,
  referenceFactionDatasheets,
  referenceRuleIndex,
  referenceRuleSection,
} from '../referenceCatalogue'
import {
  combatLoadoutSchema,
  datasheetOfferedBySchema,
  datasheetSchema,
  datasheetSlugSchema,
  detachmentRulesSchema,
  detachmentDetailSchema,
  dispositionSchema,
  factionSchema,
  globalSearchSchema,
  ruleSectionSchema,
  savedRosterDatasheetSchema,
  terrainReferencesSchema,
  unitsSchema,
  unitWoundsSchema,
} from '../../contracts/schemas'

/** A reference read, cached against the snapshot's ETag when fetched directly. */
function snapshotRpc<T>(work: () => Promise<T>) {
  return rpc(() => {
    cacheUntilSnapshotChanges()
    return work()
  })
}

export const factionIndex = createServerFn({ method: 'GET' }).handler(() =>
  snapshotRpc(async () => {
    return app().factionIndexFor()
  }),
)

/** One faction by slug or id, for pages that should not ship every faction. */
export const faction = createServerFn({ method: 'GET' })
  .validator(factionSchema)
  .handler(({ data }) =>
    snapshotRpc(async () => {
      return app().factionFor(data.catalogueId)
    }),
  )

export const globalSearch = createServerFn({ method: 'GET' })
  .validator(globalSearchSchema)
  .handler(({ data }) =>
    rpc(async () => {
      const catalogueIndex = await app().searchIndexFor()
      return searchEverything(data.query, {
        catalogue: null,
        catalogueIndex: catalogueIndex ?? undefined,
        rules: catalogueIndex ? null : await app().rulesFor(),
        own: () =>
          forSignedIn<OwnSearchData | null>(null, async (userId) => {
            const rules = await app().rulesFor()
            const [rosters, page] = await Promise.all([
              app().service.rosterService.savedRosterSummaries(userId),
              app().service.battles(userId, rules, { limit: OWN_SEARCH_BATTLES }),
            ])
            return ownSearchLists(rosters, page.battles, (await app().factionsFor())?.factions ?? [])
          }),
      })
    }),
  )

export const units = createServerFn({ method: 'GET' })
  .validator(unitsSchema)
  .handler(({ data }) =>
    rpc(async () => {
      const prepared = await preparePicker(data)
      if (!prepared) return []
      return pickerUnitsFor(
        prepared.loaded,
        prepared.rules,
        data.catalogueId,
        data.query,
        data.battleSize,
        data.waivedRules,
        data.detachmentIds,
      )
    }),
  )

/** Which of these books' pickers list a datasheet, so a reference page offers only rosters that can take it. */
export const datasheetOfferedBy = createServerFn({ method: 'GET' })
  .validator(datasheetOfferedBySchema)
  .handler(({ data }) =>
    snapshotRpc(async () => {
      const instance = app()
      const offers = await Promise.all(
        data.catalogueIds.map(async (id) => {
          const loaded = await instance.catalogueFor(id)
          return loaded ? booksOffering(loaded, await instance.rulesFor(id), data.entryId, [id]) : []
        }),
      )
      return offers.flat()
    }),
  )

export const combatUnits = createServerFn({ method: 'GET' }).handler(() =>
  snapshotRpc(async () => {
    return app().combatUnitsFor()
  }),
)

export const factionDatasheets = createServerFn({ method: 'GET' })
  .validator(unitsSchema)
  .handler(({ data }) =>
    snapshotRpc(async () => {
      return memoUntilSnapshotChanges('faction-datasheets', data, async () => {
        const loaded = await app().catalogueFor(data.catalogueId)
        if (!loaded) return []
        return referenceFactionDatasheets(loaded, data)
      })
    }),
  )

export const datasheet = createServerFn({ method: 'GET' })
  .validator(datasheetSchema)
  .handler(({ data }) =>
    rpc(async () => {
      const loaded = await app().catalogueFor(data.catalogueId)
      if (!loaded) return null
      const context = rosterDatasheetContext(loaded, data)
      return rosterDatasheet(loaded, data, context, data.everyWeapon, await app().rulesFor(data.catalogueId))
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
      const loaded = await app().catalogueFor(data.catalogueId)
      if (!loaded) return null
      const result = rosterLoadoutDatasheets(loaded, data, await app().rulesFor(data.catalogueId))
      const userId = await currentUserId()
      if (userId)
        await app().telemetry.capture(userId, 'roster_datasheet_loaded', {
          ...rosterDatasheetLoadedProperties(data, result),
          duration_ms: Math.round(performance.now() - startedAt),
        })
      return result
    }),
  )

export const combatantDatasheet = createServerFn({ method: 'POST' })
  .validator(datasheetSchema.extend({ inactivePicks: z.array(z.int().min(0).max(99)).max(100).default([]) }))
  .handler(({ data }) =>
    mutationRpc(async () => {
      const loaded = await app().catalogueFor(data.catalogueId)
      return loaded ? rosterCombatant(loaded, await app().rulesFor(data.catalogueId), data) : null
    }),
  )

/** Each weapon option of a pick, built once so the browser can score them against any target. */
export const combatLoadouts = createServerFn({ method: 'POST' })
  .validator(combatLoadoutSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const loaded = await app().catalogueFor(data.catalogueId)
      return loaded ? combatLoadoutSpace(loaded, data) : null
    }),
  )

/** A persisted read-only roster needs only its opaque id on the wire. */
export const savedRosterLoadoutDatasheets = createServerFn({ method: 'GET' })
  .validator(savedRosterDatasheetSchema)
  .handler(({ data }) =>
    rpc(async () => {
      const startedAt = performance.now()
      const userId = await currentUserId()
      const roster = await app().service.rosterService.sharedRoster(data.id, userId, data.battle ?? null)
      const pick = roster?.picks[data.pickIndex]
      const loaded = await app().catalogueFor(roster?.catalogueId ?? '')
      if (!roster || !pick || !loaded) return null
      const result = rosterLoadoutDatasheets(
        loaded,
        {
          catalogueId: roster.catalogueId,
          entryId: pick.entryId,
          detachmentIds: roster.detachmentIds,
          picks: roster.picks,
          pickIndex: data.pickIndex,
        },
        await app().rulesFor(roster.catalogueId),
      )
      if (userId)
        await app().telemetry.capture(userId, 'roster_datasheet_loaded', {
          unit_count: roster.picks.length,
          duration_ms: Math.round(performance.now() - startedAt),
          persisted: true,
          datacard_join: result.datacardJoin,
        })
      return result
    }),
  )

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
    rpc(async () => {
      const loaded = await app().catalogueFor(data.catalogueId)
      if (!loaded) return []
      return unitWoundsIn(loaded, data.catalogueId, data.entryIds)
    }),
  )

/** What a battle freezes of each datasheet in a list, read while building it so the builder judges embarks as setup will. */
export const unitBattleDetails = createServerFn({ method: 'GET' })
  .validator(unitWoundsSchema)
  .handler(({ data }) =>
    rpc(async () => {
      const loaded = await app().catalogueFor(data.catalogueId)
      if (!loaded) return []
      return unitBattleDetailsIn(loaded, data.catalogueId, data.entryIds)
    }),
  )

export const datasheetBySlug = createServerFn({ method: 'GET' })
  .validator(datasheetSlugSchema)
  .handler(({ data }) =>
    snapshotRpc(async () => {
      return memoUntilSnapshotChanges('datasheet-by-slug', data, async () => {
        const instance = app()
        const canonical = await instance.canonicalCatalogueFor(data.catalogueId)
        const catalogue = canonical ? null : await instance.catalogueFor(data.catalogueId)
        const rules = canonical ? null : await instance.rulesFor(data.catalogueId)
        return referenceDatasheetBySlug({ catalogue: () => catalogue, rules: () => rules, canonicalCatalogue: () => canonical }, data)
      })
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
    snapshotRpc(async () => {
      const selected = await app().battleDetachmentDataFor(data.catalogueId)
      return selected ? selectedBattleDetachmentData(selected, data.detachmentNames) : null
    }),
  )

export const detachmentDetail = createServerFn({ method: 'GET' })
  .validator(detachmentDetailSchema)
  .handler(({ data }) =>
    snapshotRpc(async () => {
      const rules = await app().rulesFor(data.catalogueId)
      const catalogue = await app().catalogueFor(data.catalogueId)
      return rules && catalogue ? publishedDetachmentReference(catalogue, rules, data.catalogueId, data.slug) : null
    }),
  )

export const dispositionDetachments = createServerFn({ method: 'GET' })
  .validator(dispositionSchema)
  .handler(({ data }) =>
    snapshotRpc(async () => {
      const result = await app().factionsFor()
      return result ? detachmentsOffering(result.factions, data.dispositionId) : null
    }),
  )

/** The battlefields on offer, as polygons, so the interface can draw one. */
export const deployments = createServerFn({ method: 'GET' }).handler(() =>
  snapshotRpc(async () => {
    const rules = await app().battleReadRulesFor()
    return rules?.deployments ?? []
  }),
)

export const gameReferences = createServerFn({ method: 'GET' }).handler(() =>
  snapshotRpc(async () => {
    const rules = await app().battleReadRulesFor()
    if (!rules) return null
    return gameReferencesFor(rules)
  }),
)

/** Where each source file a rules-text token names lives upstream; Praetorium serves where the words are, never the words. */
export const textSources = createServerFn({ method: 'GET' }).handler(() =>
  snapshotRpc(async () => {
    return publishedTextFiles()
  }),
)

/** Every rules document and section by name, with the numbers their prose quotes. */
export const ruleIndex = createServerFn({ method: 'GET' }).handler(() =>
  snapshotRpc(async () => {
    const rules = await app().rulesFor()
    const canonical = await app().canonicalCatalogueFor()
    return referenceRuleIndex({ catalogue: () => null, canonicalCatalogue: () => canonical, rules: () => rules })
  }),
)

/** One section at a time: the five documents together are far more than a page needs. */
export const ruleSection = createServerFn({ method: 'GET' })
  .validator(ruleSectionSchema)
  .handler(({ data }) =>
    snapshotRpc(async () => {
      const rules = await app().rulesFor()
      const canonical = await app().canonicalCatalogueFor()
      return referenceRuleSection({ catalogue: () => null, canonicalCatalogue: () => canonical, rules: () => rules }, data)
    }),
  )

export const terrainReferences = createServerFn({ method: 'GET' })
  .validator(terrainReferencesSchema)
  .handler(({ data }) =>
    snapshotRpc(async () => {
      const rules = await app().terrainReadRulesFor(data.matchupIds)
      if (!rules) return { layouts: [], templates: [] }
      return {
        layouts: rules.terrainLayouts,
        templates: rules.terrainTemplates,
      }
    }),
  )

export type { GlobalSearchResult }
