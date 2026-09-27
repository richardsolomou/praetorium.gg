import { MapPin } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'
import type { AttachedUnit } from '../../../../core/attachedUnits'
import {
  canTransport,
  type Command,
  embarkedModelCount,
  strategicReservePoints,
  transportCapacity,
  transportLabel,
  UNIT_FORMATIONS,
} from '../../../../core/battle'
import { RuleText } from '../../../components/RuleText'
import type { Army, Side } from '../../../sides'
import { formationLabel, SetupNote, SetupSidePanel } from './chrome'
import { reserveSections, reserveUnitLabel } from './reservesModel'

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
            : 'Anyone at the table can set each army’s reserves. Check special transport space costs and passenger restrictions on its datasheet.'}
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
  const units = sections.flatMap((section) => section.units)

  return (
    <article className="space-y-2">
      <div className="flex items-baseline justify-between gap-2 border-b border-edge pb-1">
        <span className="min-w-0">
          <span className="block break-words text-xs font-bold uppercase">{army.roster?.name ?? 'No army chosen'}</span>
          {multiple ? <span className="block text-3xs text-dim">{army.playerName}</span> : null}
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
          <p className="eyebrow">{section.label}</p>
          {section.units.map((unit) => (
            <UnitFormationRow key={unit.host.key} army={army} unit={unit} units={units} redeploy={redeploy} send={send} />
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
  units,
  redeploy,
  send,
}: {
  army: Army
  unit: AttachedUnit<Army['units'][number]>
  units: AttachedUnit<Army['units'][number]>[]
  redeploy: boolean
  send: (command: Command) => void
}) {
  const { host, joined } = unit
  const transportName = transportLabel(army.units, host.embarkedIn ?? '')
  const offered = UNIT_FORMATIONS.filter((formation) => {
    if (formation === 'battlefield') return true
    if (formation === 'strategic-reserves') return true
    if (formation === 'embarked') return false
    return unit.formationOptions.includes(formation)
  })

  return (
    <div className="rounded-sm bg-sunken p-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 px-0.5">
        <span className="min-w-0">
          <span className="block text-sm font-semibold">{host.name}</span>
          {/* Named rather than counted, because which character is with them is the fact. */}
          {joined.length ? (
            <span className="block text-3xs text-dim">with {joined.map((character) => character.name).join(', ')}</span>
          ) : null}
        </span>
        {unit.prebattleRules.length ? (
          <span className="text-3xs text-discarded uppercase">{unit.prebattleRules.map(formationLabel).join(' · ')}</span>
        ) : null}
      </div>
      {/*
       * Where it starts is a fact about the unit named above it, so it is drawn inside
       * the same box rather than run together underneath.
       */}
      <div className="mt-1.5">
        <UnitFact
          icon={<MapPin className="size-3.5 shrink-0 text-dim" />}
          label={
            <span className="text-xs font-bold text-bone uppercase">
              {formationLabel(host.formation)}
              {host.formation === 'embarked' && transportName ? ` in ${transportName}` : ''}
            </span>
          }
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
      {canTransport(host) ? <TransportBoarding army={army} transport={host} units={units} send={send} /> : null}
    </div>
  )
}

function TransportBoarding({
  army,
  transport,
  units,
  send,
}: {
  army: Army
  transport: Army['units'][number]
  units: AttachedUnit<Army['units'][number]>[]
  send: (command: Command) => void
}) {
  const [open, setOpen] = useState(false)
  const name = transportLabel(army.units, transport.key) ?? transport.name
  const passengers = units.filter((unit) => unit.host.embarkedIn === transport.key)
  const candidates = units.filter(
    (unit) =>
      !canTransport(unit.host) && !unit.joined.some(canTransport) && ![unit.host, ...unit.joined].some((member) => member.destroyed),
  )
  const canBoard = !transport.destroyed && transport.formation !== 'embarked'
  const capacity = transportCapacity(transport.transportRule, transport.wargear)
  const used = embarkedModelCount(army.units, transport.key)

  return (
    <div className="mt-2 rounded-sm border border-edge px-2.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-3xs font-bold text-dim uppercase">Transport</span>
        {candidates.length && canBoard ? (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger render={<Button variant="outline" size="xs" aria-label={`Embark units in ${name}`} />}>
              Embark units
            </PopoverTrigger>
            <PopoverContent align="end" className="max-h-[min(28rem,70dvh)] w-[min(24rem,calc(100vw-2rem))] overflow-y-auto">
              <PopoverTitle>Embark in {name}</PopoverTitle>
              <PopoverDescription>
                {capacity === null ? 'Model capacity unavailable for this roster.' : `${used}/${capacity} models aboard`}
              </PopoverDescription>
              <div className="space-y-1.5">
                {candidates.map((unit) => {
                  const embarked = unit.host.embarkedIn === transport.key
                  const members = [unit.host, ...unit.joined]
                  const models = members.reduce((total, member) => total + member.alive, 0)
                  return (
                    <div key={unit.host.key} className="flex items-center justify-between gap-2 rounded-sm bg-sunken px-2 py-1.5">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-bone">{reserveUnitLabel(units, unit)}</p>
                        <p className="text-3xs text-dim">{models} models</p>
                      </div>
                      <Button
                        variant={embarked ? 'secondary' : 'outline'}
                        size="xs"
                        disabled={!embarked && (capacity === null || used + models > capacity)}
                        aria-label={`${embarked ? 'Disembark' : 'Embark'} ${reserveUnitLabel(units, unit)} ${embarked ? 'from' : 'in'} ${name}`}
                        onClick={() =>
                          send({
                            kind: 'set-unit-formation',
                            unitKey: unit.host.key,
                            formation: embarked ? 'battlefield' : 'embarked',
                            ...(embarked ? {} : { transportKey: transport.key }),
                            playerId: army.playerId,
                          })
                        }
                      >
                        {embarked ? 'Remove' : 'Embark'}
                      </Button>
                    </div>
                  )
                })}
              </div>
            </PopoverContent>
          </Popover>
        ) : null}
      </div>
      {transport.transportRule ? <RuleText text={transport.transportRule} className="mt-1 text-xs" /> : null}
      <p className="mt-1 text-xs text-dim">{capacity === null ? 'Model capacity unavailable' : `${used}/${capacity} models embarked`}</p>
      {passengers.length ? (
        <p className="mt-2 text-xs text-bone">Embarked: {passengers.map((unit) => reserveUnitLabel(units, unit)).join(', ')}</p>
      ) : null}
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
