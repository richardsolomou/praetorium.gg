import { Check } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { z } from 'zod'
import { attachedUnitList } from '../../../../core/attachedUnits'
import { FilterChip } from '../../../components/FilterChip'
import type { Army, Side } from '../../../sides'
import { parseStored, useStoredValue, writeStoredValue } from '../../../storedValue'
import { shelvesOf } from '../../../unitGroups'
import { formationLabel, SetupSidePanel } from './chrome'

type Rule = 'infiltrators' | 'scouts'

// A unit held back is not on the table to do any of this, and a character and the
// unit he joined are one unit doing it together or not at all.
const onTable = (army: Army) => attachedUnitList(army.units).filter((unit) => unit.host.formation === 'battlefield')
type Standing = ReturnType<typeof onTable>[number]

/** How many of a side's units start on the table, and how many of those carry the rule. */
export function prebattleCounts(side: Side, rule: Rule) {
  const units = side.armies.flatMap(onTable)
  return { onTable: units.length, carrying: units.filter((unit) => unit.prebattleRules.includes(rule)).length }
}

/**
 * Every unit on the table carrying one pre-battle ability, side by side.
 *
 * Read twice with a different rule each time: Infiltrators is about where a unit is
 * set up, so it belongs to the deployment section, and Scouts is a move made after
 * both armies are down, so it belongs to the one after the first turn is settled.
 *
 * An attached unit is one unit and is listed once, carrying only what every part of
 * it carries — both these abilities ask that every model in the unit has them.
 * Nothing is recorded: where a model stands is the board's business.
 */
export function PrebattleUnits({ sides, rule, empty }: { sides: Side[]; rule: Rule; empty: string }) {
  return (
    <div className="grid items-start gap-6 md:grid-cols-2">
      {sides.map((side) => (
        <SetupSidePanel key={side.index} side={side} className="space-y-3">
          {side.armies.map((army) => {
            const standing = onTable(army)
            const carrying = standing.filter((unit) => unit.prebattleRules.includes(rule))
            return (
              <ArmyUnits key={army.playerId} army={army} chip={`${standing.length} on the table`} multiple={side.armies.length > 1}>
                {carrying.length ? <Shelves units={carrying} rule={rule} /> : <p className="text-xs text-dim">{empty}</p>}
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
        <span className="eyebrow">Show only</span>
        <FilterChip label="To place" hint="Show only units not yet set up" pressed={shown === 'waiting'} onToggle={() => show('waiting')} />
        <FilterChip label="Placed" hint="Show only units already set up" pressed={shown === 'placed'} onToggle={() => show('placed')} />
      </div>
      <div className="grid items-start gap-6 md:grid-cols-2">
        {sides.map((side) => (
          <SetupSidePanel key={side.index} side={side} className="space-y-3">
            {side.armies.map((army) => {
              const standing = onTable(army)
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
                      units={listed}
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
          <span className="block break-words text-xs font-bold uppercase">{army.roster?.name ?? 'No army chosen'}</span>
          {multiple ? <span className="block text-3xs text-dim">{army.playerName}</span> : null}
        </span>
        <span className="chip shrink-0">{chip}</span>
      </div>
      {children}
    </article>
  )
}

function Shelves({
  units,
  rule,
  isPlaced,
  onToggle,
}: {
  units: Standing[]
  rule: Rule
  isPlaced?: (unit: Standing) => boolean
  onToggle?: (unit: Standing) => void
}) {
  return shelvesOf(units, (unit) => unit.host.group).map((shelf) => (
    <section key={shelf.id} className="space-y-1">
      <p className="eyebrow">{shelf.plural}</p>
      {shelf.units.map((unit) => (
        <UnitRow key={unit.host.key} unit={unit} rule={rule} placed={isPlaced?.(unit)} onToggle={onToggle && (() => onToggle(unit))} />
      ))}
    </section>
  ))
}

function UnitRow({ unit, rule, placed, onToggle }: { unit: Standing; rule: Rule; placed?: boolean; onToggle?: () => void }) {
  const { host, joined } = unit
  const body = (
    <>
      <span className="flex min-w-0 items-center gap-2">
        {onToggle ? (
          <span
            aria-hidden
            className={`flex size-4 shrink-0 items-center justify-center rounded-sm border ${placed ? 'border-parchment bg-parchment text-parchment-ink' : 'border-edge-strong'}`}
          >
            {placed ? <Check className="size-3" strokeWidth={3} /> : null}
          </span>
        ) : null}
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{host.name}</span>
          {joined.length ? (
            <span className="block text-3xs text-dim">with {joined.map((character) => character.name).join(', ')}</span>
          ) : null}
        </span>
      </span>
      {unit.prebattleRules.includes(rule) ? (
        <span className="chip shrink-0 border-discarded/60 text-discarded">{formationLabel(rule)}</span>
      ) : null}
    </>
  )
  const row = 'flex w-full flex-wrap items-center justify-between gap-2 rounded-md bg-sunken px-2.5 py-1.5 text-left'
  return onToggle ? (
    <button type="button" aria-pressed={placed} className={`${row} hover:bg-raised ${placed ? 'opacity-70' : ''}`} onClick={onToggle}>
      {body}
    </button>
  ) : (
    <div className={row}>{body}</div>
  )
}
