import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { UnitSummary } from '../../../../contracts/catalogue'
import type { RosterPick } from '../../../../core/roster'
import { loadoutPick } from '../../../../core/rosterCopies'
import { ConfirmDialog } from '../../../components/ConfirmDialog'
import { Problem } from '../../../components/Problem'
import { Section } from './Section'
import { requestedUnit } from './usePicks'
import { useUnitLoadouts } from './useUnitLoadouts'

type Props = {
  catalogueId: string
  units: readonly UnitSummary[]
  inRoster: Record<string, number>
  limits: ReadonlyMap<string, number | null>
  query: string
  onApply: (pick: RosterPick) => void
}

/**
 * The player's loadouts for this roster's army, above the book.
 *
 * Each row says before it is taken why it cannot be: the army no longer offers the datasheet
 * or the roster holds as many as it may. What the roster's rules version or detachment does
 * not allow inside the loadout is reported by the roster once it is added.
 */
export function SavedLoadouts({ catalogueId, units, inRoster, limits, query, onApply }: Props) {
  const { loadouts, remove } = useUnitLoadouts(true)
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null)
  const names = new Map(units.map((unit) => [unit.id, unit.name]))
  const needle = query.trim().toLowerCase()
  const rows = (loadouts.data ?? []).flatMap((loadout) => {
    const pick = loadoutPick(loadout, catalogueId)
    const datasheet = pick && names.get(pick.entryId)
    if (!pick || (needle && ![loadout.name, datasheet ?? ''].some((text) => text.toLowerCase().includes(needle)))) return []
    return [{ id: loadout.id, name: loadout.name, datasheet, pick }]
  })
  if (loadouts.isError) return <Problem className="py-2 text-xs">Your saved loadouts could not be loaded.</Problem>
  if (!rows.length) return null
  return (
    <>
      <Section title="Saved loadouts" count={rows.length}>
        {rows.map((row) => {
          const outcome = requestedUnit(row.pick.entryId, inRoster[row.pick.entryId] ?? 0, limits)
          return (
            <div
              key={row.id}
              data-saved-loadout={row.name}
              className="flex flex-wrap items-center gap-1.5 border border-edge bg-card px-2.5 py-1.5"
            >
              <span className="min-w-12 flex-1">
                <span className="block text-sm leading-tight font-semibold tracking-wide uppercase">{row.name}</span>
                {row.datasheet && row.datasheet !== row.name ? <span className="block text-2xs text-faint">{row.datasheet}</span> : null}
                {outcome.kind === 'refused' ? <span className="mt-1 block text-2xs text-discarded">{outcome.message}</span> : null}
              </span>
              <span className="ml-auto flex shrink-0 items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete saved loadout ${row.name}`}
                  className="text-faint hover:text-bone"
                  onClick={() => setDeleting(row)}
                >
                  <Trash2 />
                </Button>
                <Button
                  size="sm"
                  className="shrink-0 px-2"
                  aria-label={`Add saved loadout ${row.name}`}
                  disabled={outcome.kind !== 'add'}
                  onClick={() => onApply(row.pick)}
                >
                  <Plus className="size-3" />
                  Add
                </Button>
              </span>
            </div>
          )
        })}
      </Section>
      <ConfirmDialog
        open={deleting !== null}
        title="Delete saved loadout?"
        description={`${deleting?.name ?? 'This loadout'} leaves your saved loadouts. Rosters that already use it keep their units.`}
        cancel="Keep loadout"
        confirm="Delete loadout"
        pendingLabel="Deleting…"
        destructive
        pending={remove.isPending}
        error={remove.error}
        onClose={() => {
          remove.reset()
          setDeleting(null)
        }}
        onConfirm={() => deleting && remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
      />
    </>
  )
}
