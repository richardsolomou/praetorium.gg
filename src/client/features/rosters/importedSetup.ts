import type { importRoster } from '../../functions'

type Imported = Awaited<ReturnType<typeof importRoster>>
type Matched<T> = T extends { catalogueId: string | null; source: string | null }
  ? T & { catalogueId: string; source: NonNullable<T['source']> }
  : never
/** A list whose faction was recognised, which is the only thing an import cannot do without. */
export type MatchedImport = Matched<Imported>
export const isMatchedImport = (imported: Imported): imported is MatchedImport => Boolean(imported.catalogueId && imported.source)

/** The roster setup an import carries; text exports leave out rule waivers and allied detachments. */
export function importedSetup(imported: MatchedImport, defaultLimit: number) {
  const stated = 'limit' in imported && imported.limit ? imported.limit : null
  return {
    name: imported.name,
    catalogueId: imported.catalogueId,
    detachmentIds: imported.detachmentIds,
    disposition: 'disposition' in imported ? (imported.disposition ?? null) : null,
    limit: stated ?? defaultLimit,
    pointsBudget: stated !== null && 'pointsBudget' in imported ? imported.pointsBudget : null,
    waivedRules: 'waivedRules' in imported ? imported.waivedRules : [],
    optionalRules: 'optionalRules' in imported ? imported.optionalRules : [],
    borrowedDetachmentId: 'borrowedDetachmentId' in imported ? imported.borrowedDetachmentId : null,
  }
}
