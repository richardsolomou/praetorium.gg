import { routeSlug } from '../../core/slug'

type DispositionOption = { id: string; name: string }

const dispositionTones: Record<string, { quiet: string; strong: string; accent: string }> = {
  'take-and-hold': {
    quiet: 'border-achieved/60 bg-achieved/10 text-achieved',
    strong: 'border-achieved bg-achieved/25 text-bone',
    accent: 'border-t-achieved',
  },
  'purge-the-foe': {
    quiet: 'border-side-a/60 bg-side-a/10 text-side-a',
    strong: 'border-side-a bg-side-a/25 text-bone',
    accent: 'border-t-side-a',
  },
  disruption: {
    quiet: 'border-side-b/60 bg-side-b/10 text-side-b',
    strong: 'border-side-b bg-side-b/25 text-bone',
    accent: 'border-t-side-b',
  },
  reconnaissance: {
    quiet: 'border-azure/60 bg-azure/10 text-azure',
    strong: 'border-azure bg-azure/25 text-bone',
    accent: 'border-t-azure',
  },
  'priority-assets': {
    quiet: 'border-discarded/60 bg-discarded/10 text-discarded',
    strong: 'border-discarded bg-discarded/25 text-bone',
    accent: 'border-t-discarded',
  },
}

export function dispositionTone(id: string, selected = false) {
  const key = routeSlug(id)
  const tone = dispositionTones[key]
  return tone ? (selected ? tone.strong : tone.quiet) : selected ? 'border-azure bg-raised text-bone' : 'border-edge bg-sunken text-dim'
}

/** The disposition's colour along the top edge of a panel that belongs to it. */
export function dispositionAccent(id: string) {
  return dispositionTones[routeSlug(id)]?.accent ?? 'border-t-edge-strong'
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

/** A Force disposition any of the faction's detachments offers, by id. */
export const factionDisposition = (
  faction: { detachments: readonly { dispositions: readonly DispositionOption[] }[] } | null | undefined,
  id: string | null | undefined,
) => faction?.detachments.flatMap((detachment) => detachment.dispositions).find((disposition) => disposition.id === id)

type OfferedDetachment = { id: string; name: string; exclusiveWith?: readonly { id: string; limit: string }[] }

/** Why the catalogue refuses this detachment beside the ones already taken, if it does. */
export function detachmentConflict(detachment: OfferedDetachment, selected: readonly OfferedDetachment[]) {
  for (const other of selected) {
    const shared = detachment.exclusiveWith?.find((entry) => entry.id === other.id)
    if (shared) return `An army can include only one ${shared.limit} detachment, and this army already has ${other.name}.`
  }
  return null
}
