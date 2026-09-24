import { useQuery } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { MAX_COMBAT_MODELS } from '../../../core/combat'
import { FactionLabel, FactionMark } from '../../components/FactionMark'
import { SearchableSelect } from '../../components/SearchableSelect'
import { combatUnitsQuery, factionIndexQuery } from '../../queries'
import { Loadout } from '../builder/Loadout'
import { Stepper } from '../builder/LoadoutControls'
import { CombatSurvivorControls } from './CombatSurvivorControls'
import type { Combatant } from './useCombatant'

const unitValue = (catalogueId: string, id: string) => JSON.stringify([catalogueId, id])

export function CombatantCard({
  side,
  combatant,
  armyControl,
  headingAction,
}: {
  side: string
  combatant: Combatant
  armyControl?: ReactNode
  headingAction?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [survivorsOpen, setSurvivorsOpen] = useState(false)
  const factions = useQuery(factionIndexQuery())
  const catalogueUnits = useQuery({ ...combatUnitsQuery(), enabled: !combatant.roster })
  const { unit, picks, edit, ready, pick, pickIndex, battleUnit } = combatant
  const selectedFaction = factions.data?.factions.find((entry) => entry.id === combatant.faction)
  const failed = factions.isError || catalogueUnits.isError || combatant.price.isError || combatant.sheets.isError
  const unavailable =
    picks.positioned.length > 0 &&
    ((combatant.price.isSuccess && !unit) || (combatant.sheets.isSuccess && !combatant.sheets.data?.selected))
  const models = combatant.models
  const maximum = Math.min(MAX_COMBAT_MODELS, battleUnit?.startingModels ?? unit?.size.max ?? 0)
  const nextSize = (count: number, direction: -1 | 1) =>
    !battleUnit && unit?.size.options
      ? ((direction === 1 ? unit.size.options.find((size) => size > count) : unit.size.options.findLast((size) => size < count)) ?? count)
      : count + direction
  const more = nextSize(models, 1)
  const fewer = nextSize(models, -1)
  return (
    <div className="min-w-0 p-3 sm:p-4">
      <div className="mb-3 flex min-h-8 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="rubric">{side}</h2>
          {headingAction}
        </div>
        {unit ? <span className="readout text-sm text-info">{unit.points} pts</span> : null}
      </div>
      <div className="space-y-2">
        {armyControl}
        {combatant.roster ? (
          <>
            <div className="flex h-8 min-w-0 items-center gap-2 px-2.5 text-sm text-dim" aria-label={`${side} faction`}>
              {selectedFaction ? <FactionLabel faction={selectedFaction} /> : 'Loading faction…'}
              <span className="ml-auto text-xs text-faint">{battleUnit ? 'Battle' : 'Roster'}</span>
            </div>
            <SearchableSelect
              ariaLabel={`${side} unit`}
              placeholder="Choose a unit"
              value={String(pickIndex)}
              onValueChange={(index) => combatant.selectRosterUnit(Number(index))}
              groups={[
                {
                  label: 'Roster units',
                  items: (combatant.price.data?.units ?? []).flatMap((entry, index) =>
                    combatant.availableUnits && !combatant.availableUnits[index]
                      ? []
                      : [
                          {
                            value: String(index),
                            label: `${entry.name}${(combatant.price.data?.units ?? []).filter((candidate) => candidate.entryId === entry.entryId).length > 1 ? ` · ${index + 1}` : ''}`,
                          },
                        ],
                  ),
                },
              ]}
            />
          </>
        ) : (
          <SearchableSelect
            ariaLabel={`${side} unit`}
            placeholder={catalogueUnits.isPending ? 'Loading units…' : 'Choose a unit'}
            searchPlaceholder="Search units…"
            virtualized
            value={pick ? unitValue(combatant.faction, pick.entryId) : ''}
            onValueChange={(value) => {
              const [catalogueId, id] = JSON.parse(value) as [string, string]
              combatant.selectUnit(catalogueId, id)
            }}
            groups={(catalogueUnits.data ?? []).flatMap((faction) => {
              const presentation = factions.data?.factions.find((entry) => entry.id === faction.catalogueId)
              return faction.units.length
                ? [
                    {
                      label: faction.name,
                      items: faction.units.map((entry) => ({
                        value: unitValue(faction.catalogueId, entry.id),
                        label: entry.name,
                        detail: entry.points === null ? undefined : `${entry.points} pts`,
                        icon: presentation ? <FactionMark id={presentation.slug} icon={presentation.icon} size="sm" /> : undefined,
                      })),
                    },
                  ]
                : []
            })}
          />
        )}
      </div>
      <div className="mt-3 flex min-h-8 flex-wrap items-center justify-between gap-3">
        {unit ? (
          <>
            <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
              Loadout
            </Button>
            {battleUnit && models < battleUnit.startingModels ? (
              <Button variant="outline" size="sm" onClick={() => setSurvivorsOpen(true)}>
                Survivors
              </Button>
            ) : null}
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-dim">Models</span>
              <Stepper
                label={`${side.toLowerCase()} models`}
                countLabel={`${side} models`}
                count={models}
                onRemove={
                  fewer < models && fewer >= (battleUnit ? 1 : unit.size.min)
                    ? () => (battleUnit ? combatant.setHealth({ models: fewer }) : edit.resize(pickIndex, (count) => nextSize(count, -1)))
                    : undefined
                }
                onAdd={
                  more > models && more <= maximum
                    ? () =>
                        battleUnit
                          ? combatant.setHealth({ models: more })
                          : edit.resize(pickIndex, (count) => Math.min(maximum, nextSize(count, 1)))
                    : undefined
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
      {pick?.attachedTo !== undefined || picks.positioned.some((entry) => entry.attachedTo === pickIndex) ? (
        <p className="mt-2 text-xs text-dim">
          {pick?.attachedTo !== undefined ? 'Character models only' : 'Bodyguard models only'} · attached models are selected separately.
        </p>
      ) : null}
      {battleUnit?.wounds && battleUnit.wounds > 1 ? (
        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-dim">
          <span>Wounded model · wounds left</span>
          <Stepper
            label={`${side.toLowerCase()} remaining wounds`}
            countLabel={`${side} remaining wounds`}
            count={battleUnit.wounds - combatant.damage}
            onRemove={combatant.damage < battleUnit.wounds - 1 ? () => combatant.setHealth({ damage: combatant.damage + 1 }) : undefined}
            onAdd={combatant.damage > 0 ? () => combatant.setHealth({ damage: combatant.damage - 1 }) : undefined}
          />
        </div>
      ) : null}
      {failed ? (
        <div role="alert" className="mt-2 text-sm text-amber-400">
          Unit data could not load.{' '}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void factions.refetch()
              if (!combatant.roster) void catalogueUnits.refetch()
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
      <Dialog open={survivorsOpen} onOpenChange={setSurvivorsOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{side} survivors</DialogTitle>
          </DialogHeader>
          {combatant.sheets.data ? (
            <CombatSurvivorControls
              key={combatant.allocationKey}
              original={combatant.sheets.data.carriers}
              models={models}
              selected={combatant.survivors}
              onSelect={(carriers) => {
                combatant.setSurvivors(carriers)
                setSurvivorsOpen(false)
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
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
              detachmentIds={combatant.detachmentIds}
              picks={picks.positioned}
              pickIndex={pickIndex}
              controlsDisabled={!ready}
              onChoose={(key, id) => edit.choose(pickIndex, key, id)}
              onSpread={(key, update) => edit.spread(pickIndex, key, update)}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
