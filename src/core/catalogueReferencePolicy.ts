import { z } from 'zod'
import { editionCatalogueId, type CatalogueEdition } from './catalogueEdition'

export const catalogueReferencePolicySchema = z.object({
  datacardExcludedCatalogueIds: z.array(z.string().min(1).max(256)).max(1000),
})

export function datacardExclusions(ids: readonly string[] = [], edition?: CatalogueEdition) {
  return new Set(ids.map((id) => (edition ? editionCatalogueId(edition.id, id) : id)))
}
