import { createServerFn } from '@tanstack/react-start'
import { app } from './app'
import { configuredProviders } from './auth'
import { routeSlug } from '../core/slug'
import { datasheetIn, datasheetInBySlug, detachmentCatalogueDetail, type LoadedCatalogue, rulesReferencedIn, unitsIn } from './catalogue'
import { slug } from './rules'
import { findAbilityDescription, WAHAPEDIA_ATTRIBUTION } from './wahapedia'
import { mutationRpc, rpc } from './rpc'
import { calculateRosterPrice } from './pricing'
import { exportRosterFile, importRosterFile } from './rosterFiles'
import { currentPlayer, currentPlayerId, requirePlayerId } from './playerSession'
import {
  datasheetSchema,
  datasheetSlugSchema,
  detachmentRulesSchema,
  detachmentDetailSchema,
  exportRosterSchema,
  importRosterSchema,
  joinBattleSchema,
  priceSchema,
  ownedSchema,
  rosterIdSchema,
  saveRosterSchema,
  submitSchema,
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
    return id ? app().service.battles(id) : []
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

export const createBattle = createServerFn({ method: 'POST' }).handler(() =>
  mutationRpc(async () => app().service.createBattle(await requirePlayerId())),
)

export const joinBattle = createServerFn({ method: 'POST' })
  .validator(joinBattleSchema)
  .handler(({ data }) => mutationRpc(async () => app().service.join(data.token, await requirePlayerId())))

/**
 * Every change to a battle comes through here. The result is the domain's answer,
 * not an exception: a refusal is something to show the player, and a stale seq is
 * something the answer's own screen already corrects.
 */
export const submit = createServerFn({ method: 'POST' })
  .validator(submitSchema)
  .handler(({ data }) =>
    mutationRpc(async () => app().service.submit(data.token, await requirePlayerId(), data.expectedSeq, data.command, app().rules())),
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
  .handler(({ data }) => mutationRpc(async () => app().service.setOwned(await requirePlayerId(), data.entryId, data.owned)))

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
        const displayName = rules?.factionNames.get(slug(faction.name)) ?? faction.name.split(' - ').at(-1)!
        return {
          id: faction.id,
          slug: routeSlug(displayName),
          name: faction.name,
          displayName,
          references: faction.references,
          detachments: (loaded.detachments.get(faction.id)?.options ?? []).map((detachment) => {
            const reference = rules?.detachmentReferences.get(slug(faction.name))?.get(slug(detachment.name))
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

export const units = createServerFn({ method: 'GET' })
  .validator(unitsSchema)
  .handler(({ data }) =>
    rpc(() => {
      const loaded = app().catalogue()
      return loaded ? unitsIn(loaded, data.catalogueId, data.query) : []
    }),
  )

export const datasheet = createServerFn({ method: 'GET' })
  .validator(datasheetSchema)
  .handler(({ data }) =>
    rpc(() => {
      const loaded = app().catalogue()
      return loaded ? describeAbilities(loaded, datasheetIn(loaded, data.catalogueId, data.entryId)) : null
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

/** Lists a player keeps between battles. Their own only — there is nothing to share here. */
export const savedRosters = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => {
    const id = await currentPlayerId()
    return id ? app().service.savedRosters(id) : []
  }),
)

export const sharedRoster = createServerFn({ method: 'GET' })
  .validator(rosterIdSchema)
  .handler(({ data }) => rpc(() => app().service.sharedRoster(data.id)))

/** SSR pricing for a persisted roster: the URL carries only its opaque public id. */
export const savedRosterPrice = createServerFn({ method: 'GET' })
  .validator(rosterIdSchema)
  .handler(({ data }) =>
    rpc(() => {
      const roster = app().service.sharedRoster(data.id)
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
  .handler(({ data }) => mutationRpc(async () => app().service.saveRoster(await requirePlayerId(), data)))

export const deleteRoster = createServerFn({ method: 'POST' })
  .validator(rosterIdSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      app().service.deleteRoster(await requirePlayerId(), data.id)
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
        detail.enhancements.map((enhancement) => enhancement.name),
      )
      const detachmentRuleCards = mergeDetachmentRules(catalogueDetail?.rule ?? null, detail.rules)
      const enhancements = detail.enhancements.map((enhancement) => ({
        name: enhancement.name,
        points: enhancement.points,
        description:
          catalogueDetail?.enhancements.find((candidate) => candidate.name.toLocaleLowerCase() === enhancement.name.toLocaleLowerCase())
            ?.description ?? enhancement.description,
      }))
      return {
        ...detail,
        dispositions: detail.dispositions.map((disposition) => rules.dispositions.get(disposition) ?? disposition),
        rules: detachmentRuleCards,
        enhancements,
        keywordRules: rulesReferencedIn(catalogue, [
          ...detachmentRuleCards.map((rule) => rule.description),
          ...enhancements.map((enhancement) => enhancement.description),
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

/** Fetched only when someone opens the account of the battle, not on every nudge. */
export const battleReport = createServerFn({ method: 'GET' })
  .validator(tokenSchema)
  .handler(({ data }) => rpc(async () => app().service.report(data.token, await requirePlayerId())))

/**
 * Reads a `.ros` or `.rosz` into picks this instance can price.
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

/** A `.ros` document for the list the builder is showing, ready for another tool. */
export const exportRoster = createServerFn({ method: 'POST' })
  .validator(exportRosterSchema)
  .handler(({ data }) =>
    mutationRpc(() => {
      const loaded = app().catalogue()
      if (!loaded) throw new Response('this instance has no catalogue', { status: 409 })

      return exportRosterFile(data, loaded)
    }),
  )

/** What this instance can actually offer at sign-in, so the page shows only that. */
export const signInOptions = createServerFn({ method: 'GET' }).handler(() => rpc(() => ({ providers: configuredProviders() })))
