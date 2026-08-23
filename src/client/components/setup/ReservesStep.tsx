import { MapPin } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { type Command, UNIT_FORMATIONS } from '../../../core/battle'
import type { Army, Side } from '../../sides'
import { HEADING } from '../battle/tints'
import { GROUPS } from '../builder/groups'
import { formationLabel, SetupNote, SetupSidePanel } from './chrome'

type Props = { sides: Side[]; send: (command: Command) => void }

/** Where every unit starts: on the battlefield, or held back to arrive later. */
export function ReservesStep({ sides, send }: Props) {
  const units = sides.flatMap((side) => side.armies).flatMap((army) => army.units)
  /**
   * Whether this table is using Strategic Reserves.
   *
   * Off, the step lists only the units with somewhere else to be — the ones whose own
   * datasheet lets them deep strike, and any already held back. Everything else starts
   * on the battlefield and has nothing to answer, so a twenty-unit army was twenty rows
   * to scroll past to reach the two that mattered.
   *
   * On, every unit is listed, because Strategic Reserves is open to anything and the
   * only reason to see a unit with no ability of its own is to hold it back that way.
   * It is never off for an army already using it, which would hide the one thing that
   * explains where a unit has gone.
   */
  const [reserves, setReserves] = useState(units.some((unit) => unit.formation === 'strategic-reserves'))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Setting the table is often done from one device, so nobody has to hand a phone across it. */}
        <SetupNote>Anyone at the table can set the reserves for any army while the table is being set.</SetupNote>
        <label htmlFor="offer-strategic-reserves" className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-dim">
          <Switch id="offer-strategic-reserves" checked={reserves} onCheckedChange={setReserves} aria-label="Offer Strategic Reserves" />
          Strategic Reserves
        </label>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {sides.map((side) => (
          <SetupSidePanel key={side.index} side={side} className="space-y-3">
            {side.armies.map((army) => (
              <ArmySetup key={army.playerId} army={army} multiple={side.armies.length > 1} reserves={reserves} send={send} />
            ))}
          </SetupSidePanel>
        ))}
      </div>
    </div>
  )
}

function ArmySetup({
  army,
  multiple,
  reserves,
  send,
}: {
  army: Army
  multiple: boolean
  reserves: boolean
  send: (command: Command) => void
}) {
  // A unit with nowhere else to be is only worth a row when Strategic Reserves is in
  // play, which is the one thing that can send it anywhere.
  const shown = reserves ? army.units : army.units.filter((unit) => unit.formationOptions?.length || unit.formation !== 'battlefield')
  const hidden = army.units.length - shown.length

  return (
    <article className="space-y-2">
      <div className="flex items-baseline justify-between gap-2 border-b border-edge pb-1">
        <span className="min-w-0">
          <span className="block truncate text-xs font-bold uppercase">{army.roster?.name ?? 'No army chosen'}</span>
          {multiple ? <span className="block text-[0.625rem] text-dim">{army.playerName}</span> : null}
        </span>
        <span className="chip shrink-0">{army.units.length} units</span>
      </div>
      {/*
       * By the shelf the roster already sorts them onto, because an army is read that
       * way everywhere else and a flat list of twenty is nothing to find a unit in.
       */}
      {GROUPS.flatMap((group) => {
        const units = shown.filter((unit) => (unit.group ?? 'other') === group.id)
        return units.length
          ? [
              <section key={group.id} className="space-y-1">
                <p className={HEADING}>{group.plural}</p>
                {units.map((unit) => (
                  <UnitFormationRow key={unit.key} army={army} unit={unit} reserves={reserves} send={send} />
                ))}
              </section>,
            ]
          : []
      })}
      {/* Said rather than left out, so a short list never reads as a missing one. */}
      {hidden ? (
        <p className="text-xs text-dim">
          {hidden} other {hidden === 1 ? 'unit starts' : 'units start'} on the battlefield. Turn on Strategic Reserves to hold one back.
        </p>
      ) : null}
    </article>
  )
}

/**
 * Where one unit starts, and the ways to move it.
 *
 * Its placement is stated rather than being one pressed button among equals: a row of
 * three that all look alike makes a player read every one to find out where the unit
 * already is. So the current one is a line, and the others are the things to press.
 */
function UnitFormationRow({
  army,
  unit,
  reserves,
  send,
}: {
  army: Army
  unit: Army['units'][number]
  reserves: boolean
  send: (command: Command) => void
}) {
  const offered = UNIT_FORMATIONS.filter((formation) => {
    if (formation === 'battlefield') return true
    if (formation === 'strategic-reserves') return reserves
    return unit.formationOptions?.includes(formation)
  })

  return (
    <div className="rounded-sm bg-sunken p-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 px-0.5">
        <span className="text-sm font-semibold">{unit.name}</span>
        {unit.prebattleRules?.length ? (
          <span className="text-[0.625rem] text-discarded uppercase">{unit.prebattleRules.map(formationLabel).join(' · ')}</span>
        ) : null}
      </div>
      {/*
       * Where it starts is a fact about the unit named above it, so it is drawn inside
       * the same box rather than run together underneath.
       */}
      <div className="mt-1.5">
        <UnitFact
          icon={<MapPin className="size-3.5 shrink-0 text-dim" />}
          label={<span className="truncate text-xs font-bold text-bone uppercase">{formationLabel(unit.formation)}</span>}
          action={
            <span className="flex flex-wrap gap-1">
              {offered
                .filter((formation) => formation !== unit.formation)
                .map((formation) => (
                  <Button
                    key={formation}
                    variant="outline"
                    size="xs"
                    aria-label={`Start ${unit.name} in ${formationLabel(formation)}`}
                    onClick={() => send({ kind: 'set-unit-formation', unitKey: unit.key, formation, playerId: army.playerId })}
                  >
                    {formation === 'battlefield' ? 'Put on the battlefield' : `Start in ${formationLabel(formation).toLocaleLowerCase()}`}
                  </Button>
                ))}
            </span>
          }
        />
      </div>
    </div>
  )
}

/** One inset line inside a unit: an icon, what it says, and what can be done about it. */
function UnitFact({ icon, label, action }: { icon: ReactNode; label: ReactNode; action: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-edge px-2.5 py-1.5">
      <span className="inline-flex min-w-0 items-center gap-1.5">
        {icon}
        {label}
      </span>
      {action}
    </div>
  )
}
