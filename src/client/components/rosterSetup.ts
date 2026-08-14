export type DispositionOption = { id: string; name: string }

const dispositionTones: Record<string, { quiet: string; strong: string }> = {
  'take-and-hold': { quiet: 'border-achieved/60 bg-achieved/10 text-achieved', strong: 'border-achieved bg-achieved/25 text-bone' },
  'purge-the-foe': { quiet: 'border-side-a/60 bg-side-a/10 text-side-a', strong: 'border-side-a bg-side-a/25 text-bone' },
  disruption: { quiet: 'border-side-b/60 bg-side-b/10 text-side-b', strong: 'border-side-b bg-side-b/25 text-bone' },
  reconnaissance: { quiet: 'border-azure/60 bg-azure/10 text-azure', strong: 'border-azure bg-azure/25 text-bone' },
  'priority-assets': { quiet: 'border-discarded/60 bg-discarded/10 text-discarded', strong: 'border-discarded bg-discarded/25 text-bone' },
}

export function dispositionTone(id: string, selected = false) {
  const tone = dispositionTones[id]
  return tone ? (selected ? tone.strong : tone.quiet) : selected ? 'border-azure bg-raised text-bone' : 'border-edge bg-sunken text-dim'
}

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
