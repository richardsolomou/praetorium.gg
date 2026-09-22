import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { MAX_COMBAT_MODELS } from '../../../core/combat'
import { SearchableSelect } from '../../components/SearchableSelect'
import { factionIndexQuery, unitsQuery } from '../../queries'
import { Loadout } from '../builder/Loadout'
import { Stepper } from '../builder/LoadoutControls'
import type { Combatant } from './useCombatant'

export function CombatantCard({ side, combatant }: { side: string; combatant: Combatant }) {
  const [open, setOpen] = useState(false)
  const factions = useQuery(factionIndexQuery())
  const units = useQuery(unitsQuery(combatant.faction, ''))
  const { unit, picks, edit, ready } = combatant
  const failed = factions.isError || units.isError || combatant.price.isError || combatant.sheets.isError
  const unavailable =
    picks.positioned.length > 0 &&
    ((combatant.price.isSuccess && !unit) || (combatant.sheets.isSuccess && !combatant.sheets.data?.selected))
  const models = picks.positioned[0]?.models ?? unit?.size.models ?? 0
  const maximum = Math.min(MAX_COMBAT_MODELS, unit?.size.max ?? 0)
  const nextSize = (count: number, direction: -1 | 1) =>
    unit?.size.options
      ? ((direction === 1 ? unit.size.options.find((size) => size > count) : unit.size.options.findLast((size) => size < count)) ?? count)
      : count + direction
  const more = nextSize(models, 1)
  const fewer = nextSize(models, -1)
  return (
    <div className="min-w-0 p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="rubric">{side}</h2>
        {unit ? <span className="readout text-sm text-info">{unit.points} pts</span> : null}
      </div>
      <div className="space-y-2">
        <SearchableSelect
          ariaLabel={`${side} faction`}
          placeholder="Choose a faction"
          value={combatant.faction}
          onValueChange={combatant.selectFaction}
          groups={[
            {
              label: 'Factions',
              items: (factions.data?.factions ?? []).map((faction) => ({ value: faction.id, label: faction.displayName, faction })),
            },
          ]}
        />
        <SearchableSelect
          ariaLabel={`${side} unit`}
          placeholder={units.isFetching ? 'Loading units…' : 'Choose a unit'}
          value={picks.positioned[0]?.entryId ?? ''}
          onValueChange={combatant.selectUnit}
          groups={[{ label: 'Units', items: (units.data ?? []).map((entry) => ({ value: entry.id, label: entry.name })) }]}
        />
      </div>
      <div className="mt-3 flex min-h-8 flex-wrap items-center justify-between gap-3">
        {unit ? (
          <>
            <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
              Loadout
            </Button>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-dim">Models</span>
              <Stepper
                label={`${side.toLowerCase()} models`}
                countLabel={`${side} models`}
                count={models}
                onRemove={fewer < models && fewer >= unit.size.min ? () => edit.resize(0, (count) => nextSize(count, -1)) : undefined}
                onAdd={
                  more > models && more <= maximum ? () => edit.resize(0, (count) => Math.min(maximum, nextSize(count, 1))) : undefined
                }
              />
            </div>
          </>
        ) : (
          <p className="text-sm text-faint">
            {failed
              ? 'Unit data could not load.'
              : unavailable
                ? 'This unit cannot be configured. Choose another unit.'
                : picks.positioned.length
                  ? 'Loading loadout…'
                  : 'Choose a unit to configure its models and weapons.'}
          </p>
        )}
      </div>
      {failed ? (
        <div role="alert" className="mt-2 text-sm text-amber-400">
          Unit data could not load.{' '}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void factions.refetch()
              if (combatant.faction) void units.refetch()
              if (picks.positioned.length) void combatant.price.refetch()
              if (unit) void combatant.sheets.refetch()
            }}
          >
            Retry
          </Button>
        </div>
      ) : null}
      {!factions.isPending && !factions.data ? (
        <p className="mt-2 text-sm text-dim">
          Army data is not available yet.{' '}
          <Button size="sm" variant="outline" onClick={() => void factions.refetch()}>
            Retry
          </Button>
        </p>
      ) : null}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex h-[85dvh] sm:max-w-2xl min-w-0 flex-col overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b border-edge p-4">
            <DialogTitle>
              {side} · {unit?.name ?? 'Loadout'}
            </DialogTitle>
          </DialogHeader>
          <div className="min-h-0 min-w-0 flex-1">
            <Loadout
              catalogueId={combatant.faction}
              unit={unit ?? null}
              loading={!unit}
              detachmentIds={[]}
              picks={picks.positioned}
              pickIndex={0}
              controlsDisabled={!ready}
              onChoose={(key, id) => edit.choose(0, key, id)}
              onSpread={(key, update) => edit.spread(0, key, update)}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
