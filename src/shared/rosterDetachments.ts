import type { EvaluationError, Selection } from '../core/evaluate'
import type { LoadedCatalogue } from './catalogueIndex'
import { vsDataBook } from './vsDataLegality'
import { keywordName } from '../core/text'

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
 * Each Detachment's partners that share its VS Data group, such as a second Space Marine Tacticus task force or Necron
 * Dynasty Detachment, named by that group as a keyword. Setup disables these partners, and VS Data's checker refuses a list holding
 * both.
 */
export function exclusiveDetachments(loaded: LoadedCatalogue, catalogueId: string) {
  const data = loaded.vsRoster
  const definitions = vsDataBook(data, catalogueId)?.definitions
  const grouped = (loaded.detachments.get(catalogueId)?.options ?? []).flatMap((option) => {
    const id = data?.detachments[option.id]
    const group = id && definitions?.get('detachment', id)?.data.group
    return group ? [{ id: option.id, group: keywordName(group) }] : []
  })
  const exclusive = new Map<string, { id: string; limit: string }[]>()
  for (const first of grouped)
    for (const second of grouped)
      if (first.id !== second.id && first.group === second.group)
        exclusive.set(first.id, [...(exclusive.get(first.id) ?? []), { id: second.id, limit: first.group }])
  return exclusive
}
