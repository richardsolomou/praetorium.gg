import { Check } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { z } from 'zod'
import { attachedUnitList, joinedWith, type AttachedUnit } from '../../../../core/attachedUnits'
import { canTransport, transportLabel } from '../../../../core/battle'
import { formatList } from '../../../../core/text'
import { FilterChip } from '../../../components/FilterChip'
import type { Army, Side } from '../../../sides'
import { parseStored, useStoredValue, writeStoredValue } from '../../../storedValue'
import { shelvesOf } from '../../../unitGroups'
import { formationLabel, SetupSidePanel } from './chrome'
import { reserveUnitLabel } from './reservesModel'
import { OUTLINE_TAG } from '../../../components/rosterSetup'

type Rule = 'infiltrators' | 'scouts'

// A unit held back is not on the table to do any of this, and a character and the
// unit he joined are one unit doing it together or not at all.
const onTable = (unit: Standing) => unit.host.formation === 'battlefield'
type Standing = AttachedUnit<Army['units'][number]>

/** How many of a side's units start on the table, and how many of those carry the rule. */
export function prebattleCounts(side: Side, rule: Rule) {
  const units = side.armies.flatMap((army) => attachedUnitList(army.units).filter(onTable))
  return { onTable: units.length, carrying: units.filter((unit) => unit.prebattleRules.includes(rule)).length }
}

/**
 * Every unit on the table with Scouts, side by side: a move made after both armies are down.
 *
 * An attached unit is one unit and is listed once, carrying only what every part of
 * it carries, because Scouts asks that every model in the unit has it.
 * Nothing is recorded: where a model stands is the board's business.
 */
export function PrebattleUnits({ sides }: { sides: Side[] }) {
  return (
    <div className="grid items-start gap-6 md:grid-cols-2">
      {sides.map((side) => (
        <SetupSidePanel key={side.index} side={side} className="space-y-3">
          {side.armies.map((army) => {
            const units = attachedUnitList(army.units)
            const standing = units.filter(onTable)
            const carrying = standing.filter((unit) => unit.prebattleRules.includes('scouts'))
            return (
              <ArmyUnits key={army.playerId} army={army} chip={`${standing.length} on the table`} multiple={side.armies.length > 1}>
                {carrying.length ? (
                  <Shelves army={army} units={units} listed={carrying} rule="scouts" />
                ) : (
                  <p className="text-xs text-dim">No unit has a pre-battle move.</p>
                )}
              </ArmyUnits>
            )
          })}
        </SetupSidePanel>
      ))}
    </div>
  )
}

type Shown = 'all' | 'waiting' | 'placed'

const placedSchema = z.array(z.string())
const placedId = (army: Army, unit: Standing) => `${army.playerId}|${unit.host.key}`

/**
 * Every unit starting on the table, ticked off as it is set up so the table can see what is
 * down and what is left while the sides alternate.
 *
 * The ticks stay on this device: setting up changes nothing the battle keeps, and the
 * models on the board are the record either side trusts.
 */
export function DeployUnits({ sides, storageKey }: { sides: Side[]; storageKey: string }) {
  const placed = new Set(parseStored(placedSchema, useStoredValue(storageKey)))
  const [shown, setShown] = useState<Shown>('all')
  const toggle = (id: string) => {
    const next = new Set(placed)
    if (!next.delete(id)) next.add(id)
    writeStoredValue(storageKey, next.size ? JSON.stringify([...next]) : null)
  }
  const show = (choice: Exclude<Shown, 'all'>) => setShown(shown === choice ? 'all' : choice)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-medium text-dim">Show only</span>
        <FilterChip label="To place" hint="Show only units not yet set up" pressed={shown === 'waiting'} onToggle={() => show('waiting')} />
        <FilterChip label="Placed" hint="Show only units already set up" pressed={shown === 'placed'} onToggle={() => show('placed')} />
      </div>
      <div className="grid items-start gap-6 md:grid-cols-2">
        {sides.map((side) => (
          <SetupSidePanel key={side.index} side={side} className="space-y-3">
            {side.armies.map((army) => {
              const units = attachedUnitList(army.units)
              const standing = units.filter(onTable)
              const down = standing.filter((unit) => placed.has(placedId(army, unit)))
              const listed =
                shown === 'all' ? standing : standing.filter((unit) => placed.has(placedId(army, unit)) === (shown === 'placed'))
              return (
                <ArmyUnits
                  key={army.playerId}
                  army={army}
                  chip={`${down.length} of ${standing.length} placed`}
                  multiple={side.armies.length > 1}
                >
                  {listed.length ? (
                    <Shelves
                      army={army}
                      units={units}
                      listed={listed}
                      rule="infiltrators"
                      isPlaced={(unit) => placed.has(placedId(army, unit))}
                      onToggle={(unit) => toggle(placedId(army, unit))}
                    />
                  ) : (
                    <p className="text-xs text-dim">
                      {!standing.length
                        ? 'No unit starts on the table.'
                        : shown === 'placed'
                          ? 'Nothing placed yet.'
                          : 'Every unit is placed.'}
                    </p>
                  )}
                </ArmyUnits>
              )
            })}
          </SetupSidePanel>
        ))}
      </div>
    </div>
  )
}

function ArmyUnits({ army, chip, multiple, children }: { army: Army; chip: string; multiple: boolean; children: ReactNode }) {
  return (
    <article className="space-y-2">
      <div className="flex items-baseline justify-between gap-2 border-b border-edge pb-1">
        <span className="min-w-0">
          <span className="block break-words text-sm font-semibold">{army.roster?.name ?? 'No army chosen'}</span>
          {multiple ? <span className="block text-3xs text-dim">{army.playerName}</span> : null}
        </span>
        <span className="shrink-0 text-xs text-dim">{chip}</span>
      </div>
      {children}
    </article>
  )
}

function Shelves({
  army,
  units,
  listed,
  rule,
  isPlaced,
  onToggle,
}: {
  army: Army
  units: Standing[]
  listed: Standing[]
  rule: Rule
  isPlaced?: (unit: Standing) => boolean
  onToggle?: (unit: Standing) => void
}) {
  return shelvesOf(listed, (unit) => unit.host.group).map((shelf) => (
    <section key={shelf.id} className="space-y-1">
      <p className="text-sm font-medium text-dim">{shelf.plural}</p>
      {shelf.units.map((unit) => (
        <UnitRow
          key={unit.host.key}
          name={canTransport(unit.host) ? (transportLabel(army.units, unit.host.key) ?? unit.host.name) : unit.host.name}
          unit={unit}
          passengers={units.filter(({ host }) => host.embarkedIn === unit.host.key).map((passenger) => reserveUnitLabel(units, passenger))}
          rule={rule}
          placed={isPlaced?.(unit)}
          onToggle={onToggle && (() => onToggle(unit))}
        />
      ))}
    </section>
  ))
}

function UnitRow({
  name,
  unit,
  passengers,
  rule,
  placed,
  onToggle,
}: {
  name: string
  unit: Standing
  passengers: string[]
  rule: Rule
  placed?: boolean
  onToggle?: () => void
}) {
  const { joined } = unit
  const body = (
    <>
      <span className="flex min-w-0 items-center gap-2">
        {onToggle ? (
          <span
            aria-hidden
            className={`flex size-4 shrink-0 items-center justify-center rounded-sm border ${placed ? 'border-parchment bg-parchment text-parchment-ink' : 'border-runner'}`}
          >
            {placed ? <Check className="size-3" strokeWidth={3} /> : null}
          </span>
        ) : null}
        <span className="min-w-0">
          <span className="block wrap-break-word text-sm font-medium">{name}</span>
          {joined.length ? <span className="block text-3xs text-dim">{joinedWith(joined.map((character) => character.name))}</span> : null}
          {passengers.length ? <span className="block wrap-break-word text-3xs text-dim">Embarked: {formatList(passengers)}</span> : null}
        </span>
      </span>
      {unit.prebattleRules.includes(rule) ? (
        <span className={`${OUTLINE_TAG} border-discarded/60 text-discarded`}>{formationLabel(rule)}</span>
      ) : null}
    </>
  )
  const row = 'flex w-full flex-wrap items-center justify-between gap-2 border-b border-edge px-1 py-1.5 text-left'
  return onToggle ? (
    <button type="button" aria-pressed={placed} className={`${row} hover:bg-raised ${placed ? 'opacity-70' : ''}`} onClick={onToggle}>
      {body}
    </button>
  ) : (
    <div className={row}>{body}</div>
  )
}
