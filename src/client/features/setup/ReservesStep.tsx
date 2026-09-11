import { MapPin } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import type { AttachedUnit } from '../../../core/attachedUnits'
import { type Command, strategicReservePoints, UNIT_FORMATIONS } from '../../../core/battle'
import type { Army, Side } from '../../sides'
import { HEADING } from '../battle/tints'
import { formationLabel, SetupNote, SetupSidePanel } from './chrome'
import { reserveSections } from './reservesModel'

type Props = { sides: Side[]; redeploy: boolean; send: (command: Command) => void }

/** Where every unit starts: on the battlefield, or held back to arrive later. */
export function ReservesStep({ sides, redeploy, send }: Props) {
  return (
    <div className="space-y-4">
      <div>
        {/* Setting the table is often done from one device, so nobody has to hand a phone across it. */}
        <SetupNote>
          {redeploy
            ? 'If an army rule lets you redeploy a unit after the first-turn roll, record that move here. It does not count towards the limit.'
            : 'Anyone at the table can set the reserves for any army while the table is being set.'}
        </SetupNote>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {sides.map((side) => (
          <SetupSidePanel key={side.index} side={side} className="space-y-3">
            {side.armies.map((army) => (
              <ArmySetup key={army.playerId} army={army} multiple={side.armies.length > 1} redeploy={redeploy} send={send} />
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
  redeploy,
  send,
}: {
  army: Army
  multiple: boolean
  redeploy: boolean
  send: (command: Command) => void
}) {
  const sections = reserveSections(army.units)
  // Counted the way the rows are: a character and the unit he joined are one unit.
  const listed = sections.reduce((total, section) => total + section.units.length, 0)
  const reserveLimit = army.roster?.built?.strategicReserveLimit
  const reservePoints = strategicReservePoints(army.units)

  return (
    <article className="space-y-2">
      <div className="flex items-baseline justify-between gap-2 border-b border-edge pb-1">
        <span className="min-w-0">
          <span className="block break-words text-xs font-bold uppercase">{army.roster?.name ?? 'No army chosen'}</span>
          {multiple ? <span className="block text-[0.625rem] text-dim">{army.playerName}</span> : null}
        </span>
        <span className="flex shrink-0 flex-wrap justify-end gap-1">
          <span className="chip">{listed} units</span>
          {reserveLimit === undefined ? null : (
            <span className="chip">
              {reservePoints}/{reserveLimit} reserve points
            </span>
          )}
        </span>
      </div>
      {sections.map((section) => (
        <section key={section.label} className="space-y-1">
          <p className={HEADING}>{section.label}</p>
          {section.units.map((unit) => (
            <UnitFormationRow key={unit.host.key} army={army} unit={unit} redeploy={redeploy} send={send} />
          ))}
        </section>
      ))}
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
  redeploy,
  send,
}: {
  army: Army
  unit: AttachedUnit<Army['units'][number]>
  redeploy: boolean
  send: (command: Command) => void
}) {
  const { host, joined } = unit
  const offered = UNIT_FORMATIONS.filter((formation) => {
    if (formation === 'battlefield') return true
    if (formation === 'strategic-reserves') return true
    return unit.formationOptions.includes(formation)
  })

  return (
    <div className="rounded-sm bg-sunken p-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 px-0.5">
        <span className="min-w-0">
          <span className="block text-sm font-semibold">{host.name}</span>
          {/* Named rather than counted, because which character is with them is the fact. */}
          {joined.length ? (
            <span className="block text-[0.625rem] text-dim">with {joined.map((character) => character.name).join(', ')}</span>
          ) : null}
        </span>
        {unit.prebattleRules.length ? (
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
          label={<span className="truncate text-xs font-bold text-bone uppercase">{formationLabel(host.formation)}</span>}
          action={
            <span className="flex flex-wrap gap-1">
              {offered
                .filter((formation) => formation !== host.formation)
                .map((formation) => {
                  const returning =
                    redeploy && host.deployedAtRollOff === true && host.formation === 'battlefield' && formation === 'strategic-reserves'
                  return (
                    <Button
                      key={formation}
                      variant="outline"
                      size="xs"
                      aria-label={`${returning ? 'Redeploy' : 'Start'} ${host.name} ${returning ? 'into' : 'in'} ${formationLabel(formation)}`}
                      onClick={() =>
                        send({
                          kind: 'set-unit-formation',
                          unitKey: host.key,
                          formation,
                          playerId: army.playerId,
                        })
                      }
                    >
                      {formation === 'battlefield'
                        ? 'Put on the battlefield'
                        : `${returning ? 'Redeploy into' : 'Start in'} ${formationLabel(formation).toLocaleLowerCase()}`}
                    </Button>
                  )
                })}
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
