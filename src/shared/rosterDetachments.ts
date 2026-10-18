import { evaluate, type EvaluationError, type Selection } from '../core/evaluate'
import type { LoadedCatalogue } from './catalogueIndex'

export function rosterDetachments(loaded: LoadedCatalogue, catalogueId: string, detachmentIds: readonly string[]) {
  const detachment = loaded.detachments.get(catalogueId)
  const chosen = detachmentIds.flatMap((id) => {
    const option = detachment?.options.find((candidate) => candidate.id === id)
    return option ? [option] : []
  })
  const selections: Selection[] = chosen.flatMap((option, index) =>
    index
      ? [{ id: option.id, count: 1 }]
      : detachment
        ? [
            {
              id: detachment.wrapperId,
              count: 1,
              selections: [{ id: detachment.groupId, count: 1, selections: [{ id: option.id, count: 1 }] }],
            },
          ]
        : [],
  )
  return { chosen, selections }
}

/** A profile-backed roster can hold several detachments: the points budget limits them, not the wrapper's single-selection constraint. */
export const isDetachmentWrapperLimit = (error: EvaluationError, chosen: number) =>
  chosen > 1 && error.entryName.toLowerCase().includes('detachment') && error.limit?.max === 1

/**
 * Each detachment's partners that would break a catalogue limit beside it, such as a second
 * Unique Shield Host or Necron Dynasty, named by the limit they share. Pairs cover the
 * one-per-army limits the data uses; a larger limit is still reported when the roster is priced.
 */
export function exclusiveDetachments(loaded: LoadedCatalogue, catalogueId: string) {
  const options = loaded.detachments.get(catalogueId)?.options ?? []
  const limits = (ids: string[]) =>
    evaluate(rosterDetachments(loaded, catalogueId, ids).selections, loaded.index, { primaryCatalogueId: catalogueId }).errors.filter(
      (error) => error.limit && !isDetachmentWrapperLimit(error, ids.length),
    )
  const alone = new Map(options.map((option) => [option.id, new Set(limits([option.id]).map((error) => error.entryId))]))
  const exclusive = new Map<string, { id: string; limit: string }[]>()
  options.forEach((first, at) => {
    for (const second of options.slice(at + 1)) {
      const broken = limits([first.id, second.id]).find(
        (error) => !alone.get(first.id)?.has(error.entryId) && !alone.get(second.id)?.has(error.entryId),
      )
      if (!broken) continue
      exclusive.set(first.id, [...(exclusive.get(first.id) ?? []), { id: second.id, limit: broken.entryName }])
      exclusive.set(second.id, [...(exclusive.get(second.id) ?? []), { id: first.id, limit: broken.entryName }])
    }
  })
  return exclusive
}
