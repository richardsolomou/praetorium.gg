import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { catalogueEditionId, editionCatalogueId, editionLabel, rulesVersionLabel } from '../core/catalogueEdition'
import { loadCatalogue, type LoadedCatalogue } from './catalogueIndex'
import { readCatalogueComposition } from './catalogueComposition'
import { loadRules, type LoadedRules } from './rules'
import { factionsFor } from '../shared/factionReferences'
import {
  CANONICAL_CATALOGUE_COMPILER_VERSION,
  CANONICAL_CATALOGUE_FORMAT,
  compileCanonicalCatalogueFromSnapshot,
  editionCanonicalCataloguesPath,
  loadEditionCanonicalCatalogues,
} from './canonicalCatalogue'
import type { CanonicalCatalogue } from '../contracts/catalogue'
import { routeSlug } from '../core/slug'
import { compiledGlobalSearchIndex } from './globalSearch'
import { combatUnitsFor } from './combatUnits'

export function catalogueEditionLoaders(directory: string, base: () => LoadedCatalogue | null, baseRules: () => LoadedRules | null) {
  const composition = readCatalogueComposition(directory)
  type EditionContext = { catalogue: LoadedCatalogue; rules: LoadedRules | null; canonical: Map<string, CanonicalCatalogue> }
  const baseEditions = new Map(
    composition?.editions
      .filter(({ base: aliasesBase, edition }) => aliasesBase && edition.default)
      .flatMap(({ edition }) => edition.catalogueIds.map((id) => [id, edition] as const)),
  )
  const cache = new Map<string, EditionContext>()
  const baseCanonical = new Map<string, CanonicalCatalogue>()
  // What the snapshot compiled ahead of time, so startup reads it instead of compiling every edition again.
  let packaged: Map<string, CanonicalCatalogue> | undefined
  const packagedCanonical = (key: string) => (packaged ??= loadEditionCanonicalCatalogues(directory)).get(key)
  let factions: ReturnType<typeof factionsFor> | null | undefined
  const context = (editionId: string) => {
    const cached = cache.get(editionId)
    if (cached) return cached
    const configuration = composition?.editions.find(({ edition }) => edition.id === editionId)
    if (!configuration) return null
    const target = configuration.base ? directory : path.join(directory, 'editions', editionId)
    const catalogue = loadCatalogue(target, configuration.edition)
    if (!catalogue) throw new Error(`edition ${editionId} has no catalogue data`)
    const rules = loadRules(target, path.join(directory, 'battlemaster'), path.join(directory, 'icons'), undefined, catalogue.datacards)
    const result: EditionContext = { catalogue, rules, canonical: new Map() }
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
      original.factions
        .filter((faction) => defaults.has(faction.id) && !baseEditions.has(faction.id))
        .map((faction) => [faction.slug, faction.id]),
    )
    const editions = editionContexts().flatMap(
      ({ edition, catalogue, rules }) =>
        factionsFor(catalogue, rules, new Set(edition.catalogueIds.map((id) => editionCatalogueId(edition.id, id)))).factions,
    )
    factions = {
      revision: createHash('sha256')
        .update(JSON.stringify([original.revision, composition]))
        .digest('hex'),
      factions: [
        ...original.factions
          .filter((faction) => !baseEditions.has(faction.id))
          .map((faction) => ({
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
    const baseEdition = baseEditions.get(id)
    if (baseEdition) {
      const loaded = base()
      const original = loaded ? factionsFor(loaded, baseRules()).factions.find((faction) => faction.id === id) : null
      return original ? { ...original, edition: baseEdition, isDefault: false } : null
    }
    const selected = lookup(id)
    if (!selected) return null
    const support = factionsFor(selected.catalogue, selected.rules).factions.find((faction) => faction.id === id)
    return support ? { ...support, isDefault: false } : null
  }
  const canonical = (id: string) => {
    const catalogueId = resolve(id)
    if (baseEditions.has(catalogueId)) {
      const loaded = base()
      if (!loaded) return null
      let result = baseCanonical.get(catalogueId) ?? packagedCanonical(`base:${catalogueId}`)
      if (!result) {
        result = compileCanonicalCatalogueFromSnapshot(
          { ...loaded, factions: loaded.factions.filter((faction) => faction.id === catalogueId) },
          baseRules(),
          directory,
        )
      }
      baseCanonical.set(catalogueId, result)
      return result
    }
    const selected = lookup(catalogueId)
    if (!selected) return null
    const edition = selected.catalogue.edition!
    const advertised = new Set(edition.catalogueIds.map((bookId) => editionCatalogueId(edition.id, bookId)))
    const scope = advertised.has(catalogueId) ? '' : catalogueId
    let result = selected.canonical.get(scope) ?? packagedCanonical(`${edition.id}:${scope}`)
    if (!result) {
      const compiled = compileCanonicalCatalogueFromSnapshot(
        {
          ...selected.catalogue,
          factions: selected.catalogue.factions.filter((faction) => (scope ? faction.id === scope : advertised.has(faction.id))),
        },
        selected.rules,
        composition?.editions.find((entry) => entry.edition.id === edition.id)?.base
          ? directory
          : path.join(directory, 'editions', edition.id),
      )
      const label = (faction: string) => `${faction} · ${editionLabel(edition)}`
      result = {
        ...compiled,
        datasheets: compiled.datasheets.map((sheet) => ({ ...sheet, faction: label(sheet.faction) })),
        detachments: compiled.detachments.map((detachment) => ({ ...detachment, faction: label(detachment.faction) })),
      }
    }
    selected.canonical.set(scope, result)
    return result
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
    battleFactions: () => {
      const advertised = allFactions()?.factions ?? []
      const ids = new Set(advertised.map(({ id }) => id))
      const historical = (base()?.factions ?? []).flatMap(({ id }) => {
        const faction = ids.has(id) ? null : factionFor(id)
        return faction ? [faction] : []
      })
      return [...advertised, ...historical]
    },
    catalogueFor: (catalogueId: string) => {
      const id = resolve(catalogueId)
      return catalogueEditionId(id) ? (lookup(id)?.catalogue ?? null) : base()
    },
    rulesFor: (catalogueId?: string) => {
      const id = catalogueId ? resolve(catalogueId) : null
      return id && catalogueEditionId(id) ? (lookup(id)?.rules ?? null) : baseRules()
    },
    canonicalFor: canonical,
    /** Every edition catalogue compiled or read so far, keyed as the snapshot packages them. */
    canonicalEntries: () => [
      ...[...baseCanonical].map(([catalogueId, catalogue]) => [`base:${catalogueId}`, catalogue] as const),
      ...[...cache].flatMap(([editionId, { canonical: compiled }]) =>
        [...compiled].map(([scope, catalogue]) => [`${editionId}:${scope}`, catalogue] as const),
      ),
    ],
    canonicalCatalogue: (primary: CanonicalCatalogue | null) => {
      if (!primary || !composition?.editions.length) return primary
      const replaced = new Set(
        composition.editions
          .filter(({ edition, base: aliasesBase }) => edition.default && !aliasesBase)
          .flatMap(({ edition }) => edition.catalogueIds),
      )
      const previousRoutes = new Map(
        allFactions()!
          .factions.filter((faction) => replaced.has(faction.id))
          .map((faction) => [routeSlug(faction.displayName), faction.id]),
      )
      const originalLabels = new Map(
        allFactions()!
          .factions.filter((faction) => replaced.has(faction.id))
          .map((faction) => [faction.id, rulesVersionLabel(faction)]),
      )
      const previousRoute = <T extends { catalogueId: string }>(route: T | null): T | null =>
        route ? { ...route, catalogueId: previousRoutes.get(route.catalogueId) ?? route.catalogueId } : null
      const previousRelationships = (relationships: CanonicalCatalogue['datasheets'][number]['attachments']) =>
        relationships.map((relationship) => ({ ...relationship, route: previousRoute(relationship.route) }))
      const result = {
        ...primary,
        datasheets: primary.datasheets
          .filter((sheet) => !baseEditions.has(sheet.catalogueId))
          .map((sheet) => ({
            ...sheet,
            faction: replaced.has(sheet.catalogueId) ? `${sheet.faction} · ${originalLabels.get(sheet.catalogueId)}` : sheet.faction,
            referenceRoute: previousRoute(sheet.referenceRoute),
            attachments: previousRelationships(sheet.attachments),
            leaders: previousRelationships(sheet.leaders),
            supporters: previousRelationships(sheet.supporters),
          })),
        detachments: primary.detachments
          .filter((detachment) => !baseEditions.has(detachment.catalogueId))
          .map((detachment) =>
            replaced.has(detachment.catalogueId)
              ? {
                  ...detachment,
                  faction: `${detachment.faction} · ${originalLabels.get(detachment.catalogueId)}`,
                  factionSlug: detachment.catalogueId,
                }
              : detachment,
          ),
        issues: primary.issues.filter((issue) => !baseEditions.has(issue.catalogueId)),
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
        compiledGlobalSearchIndex(loaded, baseRules(), ids),
        ...editionContexts()
          .filter(({ edition }) => edition.default)
          .map(({ catalogue, rules }) => compiledGlobalSearchIndex(catalogue, rules, ids)),
      ]
      return {
        ...indexes[0]!,
        factions: indexes.flatMap((index) => index.factions),
        datasheets: indexes.flatMap((index) => index.datasheets),
        detachments: indexes.flatMap((index) => index.detachments),
      }
    },
    combatUnits: () => {
      const loaded = base()
      if (!loaded) return []
      const ids = defaults()
      return [
        ...combatUnitsFor(loaded, baseRules(), ids),
        ...editionContexts()
          .filter(({ edition }) => edition.default)
          .flatMap(({ catalogue, rules }) => combatUnitsFor(catalogue, rules, ids)),
      ]
    },
  }
}

/**
 * Compiles every rules edition the merged reference catalogue reads, with the rules a running
 * instance loads, and writes them beside the snapshot's own compiled catalogue.
 */
export function writeEditionCanonicalCatalogues(directory: string, primary: CanonicalCatalogue) {
  const output = editionCanonicalCataloguesPath(directory)
  fs.rmSync(output, { force: true })
  const loaded = loadCatalogue(directory)
  if (!loaded) throw new Error('catalogue data is unavailable')
  const rules = loadRules(directory, undefined, undefined, undefined, loaded.datacards)
  const editions = catalogueEditionLoaders(
    directory,
    () => loaded,
    () => rules,
  )
  editions.canonicalCatalogue(primary)
  const catalogues = Object.fromEntries(editions.canonicalEntries())
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(
    output,
    `${JSON.stringify({ format: CANONICAL_CATALOGUE_FORMAT, compilerVersion: CANONICAL_CATALOGUE_COMPILER_VERSION, catalogues })}\n`,
  )
  return Object.keys(catalogues).length
}
