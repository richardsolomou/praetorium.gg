import path from 'node:path'
import { createHash } from 'node:crypto'
import { catalogueEditionId, editionCatalogueId, editionLabel } from '../core/catalogueEdition'
import { loadCatalogue, type LoadedCatalogue } from './catalogueIndex'
import { readCatalogueComposition } from './catalogueComposition'
import { loadRules, type LoadedRules } from './rules'
import { factionsFor } from './factionReferences'
import { compileCanonicalCatalogueFromSnapshot } from './canonicalCatalogue'
import type { CanonicalCatalogue } from '../contracts/catalogue'
import { routeSlug } from '../core/slug'
import { compiledGlobalSearchIndex } from './globalSearch'
import { combatUnitsFor } from './combatUnits'

export function catalogueEditionLoaders(directory: string, base: () => LoadedCatalogue | null, baseRules: () => LoadedRules | null) {
  const composition = readCatalogueComposition(directory)
  type EditionContext = { catalogue: LoadedCatalogue; rules: LoadedRules | null; canonical?: CanonicalCatalogue }
  const cache = new Map<string, EditionContext>()
  let factions: ReturnType<typeof factionsFor> | null | undefined
  const context = (editionId: string) => {
    const cached = cache.get(editionId)
    if (cached) return cached
    const configuration = composition?.editions.find(({ edition }) => edition.id === editionId)
    if (!configuration) return null
    const target = path.join(directory, 'editions', editionId)
    const catalogue = loadCatalogue(target, configuration.edition)
    if (!catalogue) throw new Error(`edition ${editionId} has no catalogue data`)
    const rules = loadRules(target, path.join(directory, 'battlemaster'), path.join(directory, 'icons'), undefined, catalogue.datacards)
    const result: EditionContext = { catalogue, rules }
    cache.set(editionId, result)
    return result
  }
  const lookup = (catalogueId: string) => {
    const id = catalogueEditionId(catalogueId)
    if (!id) return null
    const configured = composition?.editions.find(({ edition }) => edition.id === id)
    if (!configured) return null
    const selected = context(id)
    return selected?.catalogue.index.catalogues.has(catalogueId) ? selected : null
  }
  const editionContexts = () => (composition?.editions ?? []).map(({ edition }) => ({ edition, ...context(edition.id)! }))
  const allFactions = () => {
    if (factions !== undefined) return factions
    const loaded = base()
    if (!loaded) return null
    const defaults = new Set(composition?.editions.filter(({ edition }) => edition.default).flatMap(({ edition }) => edition.catalogueIds))
    const original = factionsFor(loaded, baseRules())
    const previousRoutes = new Map(
      original.factions.filter((faction) => defaults.has(faction.id)).map((faction) => [faction.slug, faction.id]),
    )
    const editions = editionContexts().flatMap(({ edition, catalogue, rules }) =>
      factionsFor(catalogue, rules).factions.filter((faction) =>
        edition.catalogueIds.some((id) => editionCatalogueId(edition.id, id) === faction.id),
      ),
    )
    factions = {
      revision: createHash('sha256')
        .update(JSON.stringify([original.revision, composition]))
        .digest('hex'),
      factions: [
        ...original.factions.map((faction) => ({
          ...faction,
          slug: defaults.has(faction.id) ? faction.id : faction.slug,
          isDefault: !defaults.has(faction.id),
          detachments: faction.detachments.map((detachment) => ({
            ...detachment,
            referenceRoute: detachment.referenceRoute
              ? {
                  ...detachment.referenceRoute,
                  catalogueId: previousRoutes.get(detachment.referenceRoute.catalogueId) ?? detachment.referenceRoute.catalogueId,
                }
              : null,
          })),
        })),
        ...editions,
      ],
    }
    return factions
  }
  const resolve = (id: string) => {
    if (catalogueEditionId(id) || base()?.index.catalogues.has(id)) return id
    return allFactions()?.factions.find((faction) => routeSlug(faction.displayName) === id && faction.isDefault)?.id ?? id
  }
  const factionFor = (catalogueId: string) => {
    const id = resolve(catalogueId)
    const advertised = allFactions()?.factions.find((faction) => faction.id === id)
    if (advertised) return advertised
    const selected = lookup(id)
    if (!selected) return null
    const support = factionsFor(selected.catalogue, selected.rules).factions.find((faction) => faction.id === id)
    return support ? { ...support, isDefault: false } : null
  }
  const canonical = (id: string) => {
    const selected = lookup(resolve(id))
    if (!selected) return null
    if (!selected.canonical) {
      const edition = selected.catalogue.edition!
      const compiled = compileCanonicalCatalogueFromSnapshot(
        selected.catalogue,
        selected.rules,
        path.join(directory, 'editions', edition.id),
      )
      const label = (faction: string) => `${faction} · ${editionLabel(edition)}`
      selected.canonical = {
        ...compiled,
        datasheets: compiled.datasheets.map((sheet) => ({ ...sheet, faction: label(sheet.faction) })),
        detachments: compiled.detachments.map((detachment) => ({ ...detachment, faction: label(detachment.faction) })),
      }
    }
    return selected.canonical
  }
  const defaults = () =>
    new Set(
      allFactions()
        ?.factions.filter((faction) => faction.isDefault)
        .map((faction) => faction.id),
    )
  return {
    resolve,
    factionFor,
    catalogueFor: (catalogueId: string) => {
      const id = resolve(catalogueId)
      return catalogueEditionId(id) ? (lookup(id)?.catalogue ?? null) : base()
    },
    rulesFor: (catalogueId?: string) => {
      const id = catalogueId ? resolve(catalogueId) : null
      return id && catalogueEditionId(id) ? (lookup(id)?.rules ?? null) : baseRules()
    },
    canonicalFor: canonical,
    canonicalCatalogue: (primary: CanonicalCatalogue | null) => {
      if (!primary || !composition?.editions.length) return primary
      const replaced = new Set(composition.editions.filter(({ edition }) => edition.default).flatMap(({ edition }) => edition.catalogueIds))
      const previousRoutes = new Map(
        allFactions()!
          .factions.filter((faction) => replaced.has(faction.id))
          .map((faction) => [routeSlug(faction.displayName), faction.id]),
      )
      const previousRoute = <T extends { catalogueId: string }>(route: T | null): T | null =>
        route ? { ...route, catalogueId: previousRoutes.get(route.catalogueId) ?? route.catalogueId } : null
      const previousRelationships = (relationships: CanonicalCatalogue['datasheets'][number]['attachments']) =>
        relationships.map((relationship) => ({ ...relationship, route: previousRoute(relationship.route) }))
      const result = {
        ...primary,
        datasheets: primary.datasheets.map((sheet) => ({
          ...sheet,
          faction: replaced.has(sheet.catalogueId) ? `${sheet.faction} · Previous rules` : sheet.faction,
          referenceRoute: previousRoute(sheet.referenceRoute),
          attachments: previousRelationships(sheet.attachments),
          leaders: previousRelationships(sheet.leaders),
          supporters: previousRelationships(sheet.supporters),
        })),
        detachments: primary.detachments.map((detachment) =>
          replaced.has(detachment.catalogueId)
            ? { ...detachment, faction: `${detachment.faction} · Previous rules`, factionSlug: detachment.catalogueId }
            : detachment,
        ),
        issues: [...primary.issues],
      }
      for (const { edition } of editionContexts()) {
        const compiled = canonical(editionCatalogueId(edition.id, edition.catalogueIds[0]!))!
        const ids = new Set(edition.catalogueIds.map((id) => editionCatalogueId(edition.id, id)))
        result.datasheets.push(...compiled.datasheets.filter((sheet) => ids.has(sheet.catalogueId)))
        result.detachments.push(...compiled.detachments.filter((detachment) => ids.has(detachment.catalogueId)))
        result.issues.push(...compiled.issues.filter((issue) => ids.has(issue.catalogueId)))
      }
      return result
    },
    factions: allFactions,
    searchIndex: () => {
      const loaded = base()
      if (!loaded) return null
      const ids = defaults()
      const indexes = [
        compiledGlobalSearchIndex(loaded, baseRules()),
        ...editionContexts()
          .filter(({ edition }) => edition.default)
          .map(({ catalogue, rules }) => compiledGlobalSearchIndex(catalogue, rules)),
      ]
      const allowed = (kind: string, id: string) => [...ids].some((book) => id === `${kind}:${book}` || id.startsWith(`${kind}:${book}:`))
      return {
        ...indexes[0]!,
        factions: indexes.flatMap((index) => index.factions.filter((entry) => allowed('faction', entry.result.id))),
        datasheets: indexes.flatMap((index) => index.datasheets.filter((entry) => allowed('datasheet', entry.result.id))),
        detachments: indexes.flatMap((index) => index.detachments.filter((entry) => allowed('detachment', entry.result.id))),
      }
    },
    combatUnits: () => {
      const loaded = base()
      if (!loaded) return []
      const ids = defaults()
      return [
        ...combatUnitsFor(loaded, baseRules()),
        ...editionContexts()
          .filter(({ edition }) => edition.default)
          .flatMap(({ catalogue, rules }) => combatUnitsFor(catalogue, rules)),
      ].filter((unit) => ids.has(unit.catalogueId))
    },
  }
}
