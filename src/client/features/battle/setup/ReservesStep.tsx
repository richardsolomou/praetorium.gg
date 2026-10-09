import { MapPin } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'
import type { AttachedUnit } from '../../../../core/attachedUnits'
import {
  canTransport,
  type Command,
  embarkedModelCount,
  strategicReservePoints,
  strategicReserveSideTotals,
  transportCapacity,
  transportLabel,
  UNIT_FORMATIONS,
  unitFormationRefusal,
} from '../../../../core/battle'
import type { BattleView } from '../../../../core/battleView'
import { RuleText } from '../../../components/RuleText'
import { type Army, type Side } from '../../../sides'
import { formationLabel, SetupNote, SetupSidePanel } from './chrome'
import { reserveSections, reserveUnitLabel } from './reservesModel'

type FormationCommand = Extract<Command, { kind: 'set-unit-formation' }>
type Props = {
  view: BattleView
  sides: Side[]
  send: (command: Command) => void
  /** The latest refusal, which belongs to `sentFrom` when that row sent the refused move. */
  problem: string | null
  /** The unit row that sent the latest move, owned by the page so a move elsewhere clears it. */
  sentFrom: string | null
  onSent: (row: string) => void
}
/** Everything a unit row needs to judge and send a move, and to say why one was refused. */
type Moves = {
  view: BattleView
  /** Sends a move, remembering which unit row it came from. */
  move: (row: string, command: FormationCommand) => void
  /** The server's refusal of the latest move, for the row it came from. */
  refusalFor: (row: string) => string | null
}

/** Where every unit starts, with both sides’ units and formation controls always visible. */
export function ReservesStep({ view, sides, send, problem, sentFrom, onSent }: Props) {
  const moves: Moves = {
    view,
    move: (row, command) => {
      onSent(row)
      send(command)
    },
    refusalFor: (row) => (row === sentFrom ? problem : null),
  }
  const redeploy = view.firstPlayerId !== null
  return (
    <div data-onboarding="battle-setup-reserves" className="space-y-4">
      <SetupNote>
        {redeploy
          ? 'If an army rule lets you redeploy a unit after the first-turn roll, record that move here. It does not count towards the limit.'
          : 'Anyone at the table can set each army’s reserves. Check special transport space costs and passenger restrictions on its datasheet.'}
      </SetupNote>
      <div className="grid gap-3 lg:grid-cols-2">
        {sides.map((side) => (
          <ReserveSide key={side.index} side={side} moves={moves} />
        ))}
      </div>
    </div>
  )
}

function ReserveSide({ side, moves }: { side: Side; moves: Moves }) {
  const totals = side.armies.length > 1 ? strategicReserveSideTotals(side.armies) : null
  return (
    <SetupSidePanel side={side} className="space-y-3">
      {totals ? (
        <span className="chip w-fit">
          {totals.points}/{totals.limit} reserve points shared
        </span>
      ) : null}
      {side.armies.map((army) => (
        <ArmySetup key={army.playerId} army={army} multiple={side.armies.length > 1} moves={moves} />
      ))}
    </SetupSidePanel>
  )
}

function ArmySetup({ army, multiple, moves }: { army: Army; multiple: boolean; moves: Moves }) {
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
          {multiple || reserveLimit === undefined ? null : (
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
            <UnitFormationRow key={unit.host.key} army={army} unit={unit} units={units} moves={moves} />
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
  moves,
}: {
  army: Army
  unit: AttachedUnit<Army['units'][number]>
  units: AttachedUnit<Army['units'][number]>[]
  moves: Moves
}) {
  const { host, joined } = unit
  const redeploy = moves.view.firstPlayerId !== null
  const row = `${army.playerId}:${host.key}`
  const reasonId = useId()
  const transportName = transportLabel(army.units, host.embarkedIn ?? '')
  const offered = UNIT_FORMATIONS.filter((formation) => {
    if (formation === 'battlefield') return true
    if (formation === 'strategic-reserves') return true
    if (formation === 'embarked') return false
    return unit.formationOptions.includes(formation)
  })
  const choices = offered
    .filter((formation) => formation !== host.formation)
    .map((formation) => {
      const command: FormationCommand = { kind: 'set-unit-formation', unitKey: host.key, formation, playerId: army.playerId }
      return { formation, command, refusal: formationRefusal(moves.view, command) }
    })
  const reasons = [...new Set(choices.flatMap((choice) => (choice.refusal ? [choice.refusal] : [])))]
  const refused = moves.refusalFor(row)

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
              {choices.map(({ formation, command, refusal }) => {
                const returning =
                  redeploy && host.deployedAtRollOff === true && host.formation === 'battlefield' && formation === 'strategic-reserves'
                return (
                  <Button
                    key={formation}
                    variant="outline"
                    size="xs"
                    disabled={refusal !== null}
                    aria-describedby={refusal ? `${reasonId}-${reasons.indexOf(refusal)}` : undefined}
                    aria-label={`${returning ? 'Redeploy' : 'Start'} ${host.name} ${returning ? 'into' : 'in'} ${formationLabel(formation)}`}
                    onClick={() => moves.move(row, command)}
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
        {reasons.map((reason, index) => (
          <p key={reason} id={`${reasonId}-${index}`} className="mt-1 px-0.5 text-3xs text-discarded">
            {reason}
          </p>
        ))}
      </div>
      {canTransport(host) ? <TransportBoarding army={army} transport={host} units={units} row={row} moves={moves} /> : null}
      {refused ? (
        <p role="alert" className="mt-1 px-0.5 text-xs text-destructive">
          {refused}
        </p>
      ) : null}
    </div>
  )
}

/** The refusal the server would give this move, judged against the view of the same battle. */
function formationRefusal(view: BattleView, command: FormationCommand): string | null {
  const player = view.players.find((candidate) => candidate.id === command.playerId)
  return player ? (unitFormationRefusal(view, player, command)?.message ?? null) : null
}

function TransportBoarding({
  army,
  transport,
  units,
  row,
  moves,
}: {
  army: Army
  transport: Army['units'][number]
  units: AttachedUnit<Army['units'][number]>[]
  row: string
  moves: Moves
}) {
  const reasonId = useId()
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
                  const command: FormationCommand = {
                    kind: 'set-unit-formation',
                    unitKey: unit.host.key,
                    formation: embarked ? 'battlefield' : 'embarked',
                    ...(embarked ? {} : { transportKey: transport.key }),
                    playerId: army.playerId,
                  }
                  const refusal = formationRefusal(moves.view, command)
                  return (
                    <div key={unit.host.key} className="flex items-center justify-between gap-2 rounded-sm bg-sunken px-2 py-1.5">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-bone">{reserveUnitLabel(units, unit)}</p>
                        <p className="text-3xs text-dim">{models} models</p>
                        {refusal ? (
                          <p id={`${reasonId}-${unit.host.key}`} className="text-3xs text-discarded">
                            {refusal}
                          </p>
                        ) : null}
                      </div>
                      <Button
                        variant={embarked ? 'secondary' : 'outline'}
                        size="xs"
                        disabled={refusal !== null}
                        aria-describedby={refusal ? `${reasonId}-${unit.host.key}` : undefined}
                        aria-label={`${embarked ? 'Disembark' : 'Embark'} ${reserveUnitLabel(units, unit)} ${embarked ? 'from' : 'in'} ${name}`}
                        onClick={() => moves.move(row, command)}
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
