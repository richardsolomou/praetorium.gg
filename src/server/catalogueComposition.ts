import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { catalogueEditionSchema } from '../core/catalogueEdition'
import { catalogueSourcesSchema, repositorySourceSchema } from './catalogueSources'
import { loadMfm, mfmVersions } from './mfm'
import { isSafeRelativePath } from './relativePath'

const sourceNames = ['definitions', 'points', 'datacards'] as const
const relativeFile = z.string().max(240).refine(isSafeRelativePath, 'expected a relative file path')
const overlaySchema = z
  .object({
    source: z.enum(sourceNames),
    ...repositorySourceSchema.shape,
    files: z.array(relativeFile).min(1).max(1000),
  })
  .superRefine((overlay, context) => {
    if (new Set(overlay.files).size !== overlay.files.length) context.addIssue({ code: 'custom', message: 'duplicate overlay files' })
  })

export const catalogueCompositionSchema = z
  .object({
    format: z.literal('praetorium.catalogue-composition.v1'),
    baseSources: catalogueSourcesSchema.optional(),
    overlays: z.array(overlaySchema).max(32),
    editions: z
      .array(
        z.object({
          edition: catalogueEditionSchema,
          base: z.literal(true).optional(),
          snapshot: z
            .object({
              format: z.literal('praetorium.catalogue-pointer.v1'),
              id: z.string().regex(/^[a-f0-9]{64}$/),
              archiveSha256: z.string().regex(/^[a-f0-9]{64}$/),
            })
            .optional(),
          sources: z.object({
            definitions: repositorySourceSchema.optional(),
            points: repositorySourceSchema.optional(),
            datacards: repositorySourceSchema.optional(),
          }),
          overlays: z.array(overlaySchema).max(32),
        }),
      )
      .max(16),
  })
  .superRefine((composition, context) => {
    for (const configuration of composition.editions) {
      if (configuration.base && (configuration.snapshot || Object.keys(configuration.sources).length || configuration.overlays.length))
        context.addIssue({ code: 'custom', message: 'base editions cannot replace or overlay their sources' })
      if (configuration.snapshot && (Object.keys(configuration.sources).length || configuration.overlays.length))
        context.addIssue({ code: 'custom', message: 'snapshot editions cannot replace sources or overlay files' })
    }
    const ids = composition.editions.map(({ edition }) => edition.id)
    if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', message: 'duplicate edition IDs' })
    const routes = composition.editions.flatMap(({ edition }) => [...new Set([edition.id, edition.slug ?? edition.id])])
    if (new Set(routes).size !== routes.length) context.addIssue({ code: 'custom', message: 'conflicting edition rules slugs' })
    const defaults = composition.editions.filter(({ edition }) => edition.default).flatMap(({ edition }) => edition.catalogueIds)
    if (new Set(defaults).size !== defaults.length)
      context.addIssue({ code: 'custom', message: 'a faction can have only one default edition' })
    for (const overlays of [composition.overlays, ...composition.editions.map((edition) => edition.overlays)]) {
      const files = overlays.flatMap((overlay) => overlay.files.map((file) => `${overlay.source}/${file}`))
      if (new Set(files).size !== files.length) context.addIssue({ code: 'custom', message: 'overlays cannot replace the same file twice' })
    }
  })

export type CatalogueComposition = z.infer<typeof catalogueCompositionSchema>
export type CatalogueOverlay = CatalogueComposition['overlays'][number]
export const CATALOGUE_COMPOSITION_FILE = 'composition.json'

export function readCatalogueComposition(directory: string): CatalogueComposition | null {
  const file = path.join(directory, CATALOGUE_COMPOSITION_FILE)
  if (!fs.existsSync(file)) return null
  if (fs.statSync(file).size > 1024 * 1024) throw new Error('catalogue composition exceeds 1 MiB')
  return catalogueCompositionSchema.parse(JSON.parse(fs.readFileSync(file, 'utf8')))
}

/** Where an edition's data lives: the base catalogue's own directory when it aliases the base, else its own under `editions/`. */
export function editionDirectory(directory: string, entry: CatalogueComposition['editions'][number]) {
  return entry.base ? directory : path.join(directory, 'editions', entry.edition.id)
}

/** Each rules version's MFM version numbers, from the points data its snapshot directory holds. */
export function editionMfmVersions(directory: string, composition: CatalogueComposition | null) {
  return new Map(
    (composition?.editions ?? [])
      .filter((entry) => !entry.snapshot)
      .map((entry) => [entry.edition.id, [...mfmVersions(loadMfm(editionDirectory(directory, entry)))].toSorted().join(', ')]),
  )
}

/**
 * A published rules version is one MFM version: fixes, codexes and GW's dated builds within it
 * advance its sources in place, and only a new MFM version needs a new rules version. Retired
 * versions keep their sources for the rosters and battles that still read them.
 */
export function validateEditionContinuity(
  previous: CatalogueComposition | null,
  next: CatalogueComposition | null,
  mfm?: { previous: ReadonlyMap<string, string>; next: ReadonlyMap<string, string> },
) {
  for (const prior of previous?.editions ?? []) {
    const { edition, snapshot } = prior
    const selected = next?.editions.find((entry) => entry.edition.id === edition.id)
    if (!selected || !next || !previous)
      throw new Error(`retain edition ${edition.id} for saved lists and history; retire it instead of deleting it`)
    if (snapshot && JSON.stringify(snapshot) !== JSON.stringify(selected.snapshot))
      throw new Error(`edition ${edition.id} cannot replace its immutable snapshot`)
    const current = selected.edition
    if (edition.slug && edition.slug !== current.slug) throw new Error(`edition ${edition.id} cannot change its published rules slug`)
    if (edition.releases.some((release, index) => JSON.stringify(release) !== JSON.stringify(current.releases[index]))) {
      throw new Error(`edition ${edition.id} cannot rewrite published release history`)
    }
    if (edition.catalogueIds.some((id) => !current.catalogueIds.includes(id)))
      throw new Error(`edition ${edition.id} cannot remove published faction identities`)
    if (edition.status === 'preview' || JSON.stringify(editionSources(previous, prior)) === JSON.stringify(editionSources(next, selected)))
      continue
    const [before, after] = [mfm?.previous.get(edition.id), mfm?.next.get(edition.id)]
    if (edition.status === 'released' && before && before === after) continue
    throw new Error(
      edition.status === 'retired'
        ? `rules version ${edition.id} is retired; keep its published sources for saved lists`
        : before && after
          ? `rules version ${edition.id} publishes MFM ${before}; add a new version for MFM ${after}`
          : `rules version ${edition.id} has published rules; add a new version for source changes`,
    )
  }
}

function editionSources(composition: CatalogueComposition, selected: CatalogueComposition['editions'][number]) {
  if (selected.snapshot) return selected.snapshot
  const pin = (source: CatalogueOverlay | CatalogueComposition['editions'][number]['sources']['definitions']) =>
    source ? { revision: source.revision, path: source.path } : null
  return sourceNames.map((name) => ({
    source: pin(selected.sources[name] ?? composition.baseSources?.[name]),
    overlays: [...(selected.sources[name] ? [] : composition.overlays), ...selected.overlays]
      .filter((overlay) => overlay.source === name)
      .map((overlay) => ({ ...pin(overlay), files: overlay.files })),
  }))
}
