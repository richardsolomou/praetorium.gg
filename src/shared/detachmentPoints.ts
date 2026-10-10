import { evaluate } from '../core/evaluate'
import type { LoadedCatalogue } from './catalogueIndex'
import { rosterDetachments } from './rosterDetachments'
import { mfmDetachmentFor } from './mfm'

/** MFM supplies DP when present; the card and catalogue cover detachments it omits. */
export function detachmentPoints(
  loaded: LoadedCatalogue,
  catalogueId: string,
  detachmentId: string,
  reference: { points: number | null } | undefined,
): number | null {
  const option = loaded.detachments.get(catalogueId)?.options.find((candidate) => candidate.id === detachmentId)
  if (option) {
    const mfm = mfmDetachmentFor(loaded, catalogueId, option.name)
    if (mfm) return mfm.dp
  }
  if (reference) return reference.points
  const selections = rosterDetachments(loaded, catalogueId, [detachmentId]).selections
  if (!selections.length) return null
  const evaluated = evaluate(selections, loaded.index, { primaryCatalogueId: catalogueId })
  const points = evaluated.costs['Detachment Points']
  return typeof points === 'number' && Number.isInteger(points) && points >= 0 ? points : null
}
