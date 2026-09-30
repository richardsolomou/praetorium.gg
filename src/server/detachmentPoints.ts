import { evaluate } from '../core/evaluate'
import type { LoadedCatalogue } from './catalogueIndex'
import { rosterDetachments } from './rosterDetachments'

/** Game Datacards supplies DP when present; BSData prices an offered detachment without a card. */
export function detachmentPoints(
  loaded: LoadedCatalogue,
  catalogueId: string,
  detachmentId: string,
  reference: { points: number | null } | undefined,
): number | null {
  if (reference) return reference.points
  const selections = rosterDetachments(loaded, catalogueId, [detachmentId]).selections
  if (!selections.length) return null
  const evaluated = evaluate(selections, loaded.index, { primaryCatalogueId: catalogueId })
  const points = evaluated.costs['Detachment Points']
  return typeof points === 'number' && Number.isInteger(points) && points >= 0 ? points : null
}
