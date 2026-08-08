export type DispositionOption = { id: string; name: string }

export function dispositionsFor(
  detachments: readonly { id: string; dispositions: readonly DispositionOption[] }[],
  selectedIds: readonly string[],
) {
  const selected = new Set(selectedIds)
  return [
    ...new Map(
      detachments
        .filter((detachment) => selected.has(detachment.id))
        .flatMap((detachment) => detachment.dispositions.map((option) => [option.id, option])),
    ).values(),
  ]
}
