import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { catalogueEditionSchema } from '../core/catalogueEdition'
import { catalogueSourcesSchema, repositorySourceSchema } from './catalogueSources'

const sourceNames = ['definitions', 'points', 'datacards'] as const
const relativeFile = z
  .string()
  .max(240)
  .refine(
    (value) =>
      Boolean(value) &&
      !value.startsWith('/') &&
      !value.includes('\\') &&
      !value.split('/').some((part) => !part || part === '..' || part === '.'),
    'expected a relative file path',
  )
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
    const ids = composition.editions.map(({ edition }) => edition.id)
    if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', message: 'duplicate edition IDs' })
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

export function validateEditionContinuity(previous: CatalogueComposition | null, next: CatalogueComposition | null) {
  for (const { edition } of previous?.editions ?? []) {
    const current = next?.editions.find((entry) => entry.edition.id === edition.id)?.edition
    if (!current) throw new Error(`retain edition ${edition.id} for saved lists and history; retire it instead of deleting it`)
    if (edition.releases.some((release, index) => JSON.stringify(release) !== JSON.stringify(current.releases[index]))) {
      throw new Error(`edition ${edition.id} cannot rewrite published release history`)
    }
    if (edition.catalogueIds.some((id) => !current.catalogueIds.includes(id)))
      throw new Error(`edition ${edition.id} cannot remove published faction identities`)
  }
}
