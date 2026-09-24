import type { CatalogueChange, CatalogueChangeSet } from '../core/catalogueChanges'
import type { CanonicalCatalogue } from '../contracts/catalogue'
import type { ReferenceLink } from '../contracts/catalogueChanges'

type Routes = {
  factions: Map<string, string>
  datasheets: Map<string, ReferenceLink>
  detachments: Map<string, ReferenceLink>
}

const key = (catalogueId: string, id: string) => `${catalogueId}\0${id}`
const routesCache = new WeakMap<CanonicalCatalogue, Routes>()

/** Where each faction, datasheet and detachment the current data holds is read. */
function routesOf(canonical: CanonicalCatalogue): Routes {
  const cached = routesCache.get(canonical)
  if (cached) return cached
  const routes: Routes = { factions: new Map(), datasheets: new Map(), detachments: new Map() }
  for (const sheet of canonical.datasheets) {
    if (!sheet.referenceRoute) continue
    routes.factions.set(sheet.catalogueId, sheet.referenceRoute.catalogueId)
    routes.datasheets.set(key(sheet.catalogueId, sheet.id), {
      kind: 'datasheet',
      faction: sheet.referenceRoute.catalogueId,
      slug: sheet.referenceRoute.slug,
    })
  }
  for (const detachment of canonical.detachments) {
    routes.factions.set(detachment.catalogueId, detachment.factionSlug)
    routes.detachments.set(key(detachment.catalogueId, detachment.id), {
      kind: 'detachment',
      faction: detachment.factionSlug,
      slug: detachment.slug,
    })
  }
  routesCache.set(canonical, routes)
  return routes
}

function linkOf(routes: Routes, catalogueId: string, change: CatalogueChange): ReferenceLink | null {
  switch (change.kind) {
    case 'datasheet-points':
    case 'datasheet-added':
      return routes.datasheets.get(key(catalogueId, change.id)) ?? null
    case 'detachment-points':
    case 'detachment-added':
      return routes.detachments.get(key(catalogueId, change.id)) ?? null
    case 'enhancement-points':
    case 'enhancement-added':
    case 'enhancement-removed':
      return routes.detachments.get(key(catalogueId, change.detachmentId)) ?? null
    default:
      return null
  }
}

/**
 * A recorded change set with each change linked to the page that now describes it.
 *
 * Linked against the data the instance holds today rather than the data the change came
 * from, so a link always leads somewhere: something since removed or renamed out of its
 * address is shown without one, never with a guess at where it went.
 */
export function linkedChanges(changes: CatalogueChangeSet, canonical: CanonicalCatalogue | null) {
  const routes = canonical ? routesOf(canonical) : null
  return {
    omitted: changes.omitted,
    factions: changes.factions.map((faction) => ({
      ...faction,
      slug: routes?.factions.get(faction.catalogueId) ?? null,
      changes: faction.changes.map((change) => ({ ...change, link: routes ? linkOf(routes, faction.catalogueId, change) : null })),
    })),
  }
}
