import type { Selection } from '../core/evaluate'
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
