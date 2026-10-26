import { Calculator, ChevronLeft, Minus, Plus, Scroll } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { DialogBody, DialogDescription, DialogHeader, DialogTitle } from '../../components/Dialog'
import { BattleDialogContent, BattlePromptDialog } from './BattlePromptDialog'
import { casualtyOutcome, type Command, transportLabel, type UnitState } from '../../../core/battle'
import { battleUnitCounts } from '../../../core/attachedUnits'
import type { SendCommand } from './useCommand'
import { armyModels, armyShelves } from './armyUnits'
import type { Army, Side } from '../../sides'
import { ArmyIdentity } from './ArmyIdentity'
import { Section } from '../rosters/builder/Section'
import { UnitCard } from '../rosters/builder/UnitCard'
import { formationLabel } from './setup/chrome'
import type { BattleCombatSelection } from '../simulator/BattleCombatDialog'
import { tint } from './battleTints'
import { ArmyLoadout } from './ArmyLoadout'

type Props = {
  army: Army
  side: Side
  onSimulate: (selection: BattleCombatSelection) => void
  /** Casualties are recorded only while the battle is running. */
  actionable: boolean
  pending: boolean
  /** A parked prompt holds every battle-changing control, casualties included, until it is resumed or closed. */
  blocked?: boolean
  send: SendCommand
}

type CasualtyCommand = Parameters<typeof casualtyOutcome>[1]
type Press = (command: CasualtyCommand) => void

/** What every unit row needs to show and record its losses. */
type UnitControls = {
  army: Army
  actionable: boolean
  pending: boolean
  blocked: boolean
  send: (command: Command) => void
  press: Press
}

/**
 * Casualty presses shown before the service answers, so a squad can be counted down
 * tap after tap. Each press is still its own queued command; one the service refuses
 * leaves the overlay and the count falls back to the authoritative screen.
 */
function usePendingCasualties(units: readonly UnitState[], send: SendCommand) {
  const [presses, setPresses] = useState<{ id: number; command: CasualtyCommand }[]>([])
  const nextId = useRef(0)
  const press: Press = useCallback(
    (command) => {
      const id = nextId.current++
      setPresses((current) => [...current, { id, command }])
      send(command, { blocking: false, complete: () => setPresses((current) => current.filter((candidate) => candidate.id !== id)) })
    },
    [send],
  )
  const shown = presses.length
    ? units.map((unit) =>
        presses
          .filter(({ command }) => command.unitKey === unit.key)
          .reduce((folded, { command }) => Object.assign({}, folded, casualtyOutcome(folded, command)), unit),
      )
    : units
  return { units: shown, press }
}

/** Show the frozen roster from the battle log in place, with current losses; either seated side can record either army’s losses. */
export function ArmyRoster({ army, side, actionable, pending, blocked = false, send, onSimulate }: Props) {
  const [open, setOpen] = useState(false)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [destroyedOpen, setDestroyedOpen] = useState(false)
  const { units, press } = usePendingCasualties(army.units, send)
  const roster = army.roster
  if (!roster) return null

  const models = armyModels(units)
  const standing = battleUnitCounts(units).standing
  const shelves = armyShelves(units)
  const lost = units.filter((unit) => unit.destroyed)
  const readable = (unit: UnitState) => Boolean(roster.built?.picks?.length && unit.entryId)
  const sheets = units.some(readable)
  const selected = units.find((unit) => unit.key === selectedKey && readable(unit)) ?? null
  const canSimulate = (unit: UnitState) => readable(unit) && !unit.destroyed && unit.formation === 'battlefield'
  const simulate = () => onSimulate({ playerId: army.playerId })
  const unitProps: UnitControls = { army, actionable, pending, blocked, send, press }
  // Allies field one Warlord between them, so only the list whose Warlord leads the side wears the crown.
  const leads = (side.warlord ?? army.playerId) === army.playerId
  const card = (unit: UnitState) => (
    <BattleUnit
      key={unit.key}
      {...unitProps}
      unit={unit}
      warlord={leads && unit.warlord === true}
      selected={unit.key === selected?.key}
      onSelect={readable(unit) ? () => setSelectedKey(unit.key) : undefined}
    />
  )
  const list = units.length ? (
    <div>
      {shelves.map((shelf) => (
        <Section key={shelf.id} title={shelf.plural} count={shelf.units.length}>
          {shelf.units.map(card)}
        </Section>
      ))}
      {/*
       * Off the shelves and under them: a unit that is gone is not part of the
       * army being read any more, and it is kept only so a mistaken loss can be
       * taken back.
       */}
      {lost.length ? (
        <Section title="Destroyed" count={lost.length} open={destroyedOpen} onOpenChange={setDestroyedOpen}>
          {lost.map(card)}
        </Section>
      ) : null}
    </div>
  ) : (
    /* A list attached before the battle knew how to read one is still the army. */
    <pre className="overflow-auto border border-edge bg-sunken p-3 font-rules text-sm whitespace-pre-wrap select-text">{roster.text}</pre>
  )

  return (
    <>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        <Button variant="secondary" size="xs" className="max-w-full" onClick={() => setOpen(true)} aria-label={`Open ${roster.name}`}>
          <Scroll aria-hidden /> Army
        </Button>
        {units.some(canSimulate) ? (
          <Button variant="secondary" size="xs" onClick={() => simulate()} aria-label={`Simulate ${army.playerName}'s combat`}>
            <Calculator aria-hidden /> Simulate
          </Button>
        ) : null}
        {/* What is left of it, so the number worth glancing at needs no dialog to read. */}
        {army.units.length ? (
          <span className="readout text-3xs text-faint">
            <span data-army-units>
              {standing}/{army.unitCount}
            </span>{' '}
            units ·{' '}
            <span data-army-models>
              {models.standing}/{models.total}
            </span>{' '}
            models
          </span>
        ) : null}
      </div>

      <BattlePromptDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          // Minimizing keeps the unit being read; closing starts the next look from the army.
          if (!next) setSelectedKey(null)
        }}
        minimizedLabel={`${army.playerName} · ${roster.name}`}
        resumeLabel="Return to army"
      >
        <BattleDialogContent data-army-roster size={sheets ? 'lg' : 'md'} fill={sheets} className={tint(side.index).border}>
          <DialogHeader className={`flex-row items-center gap-2 py-3 ${selected ? 'max-[859px]:pl-2' : ''}`}>
            {selected ? (
              <Button
                variant="ghost"
                size="icon-sm"
                className="shrink-0 min-[860px]:hidden"
                aria-label={`Back to ${roster.name}`}
                onClick={() => setSelectedKey(null)}
              >
                <ChevronLeft aria-hidden />
              </Button>
            ) : null}
            <div className="min-w-0 space-y-1.5">
              {/* A compact screen shows the datasheet without its card, so the header names the unit and the army it is in. */}
              <DialogTitle className="truncate">
                <span className={selected ? 'max-[859px]:hidden' : ''}>{roster.name}</span>
                {selected ? <span className="min-[860px]:hidden">{selected.name}</span> : null}
              </DialogTitle>
              <DialogDescription render={<div />}>
                <ArmyIdentity army={army} leading={army.playerName} className={selected ? 'max-[859px]:hidden' : ''} />
                {selected ? <span className="block truncate text-2xs text-dim min-[860px]:hidden">{roster.name}</span> : null}
              </DialogDescription>
            </div>
          </DialogHeader>

          {sheets ? (
            /*
             * The army and the selected unit's datasheet side by side where there is
             * room, so reading a datasheet never moves the list. A compact screen shows
             * one at a time.
             */
            <div className="grid min-h-0 flex-auto grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)] min-[860px]:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
              <DialogBody data-army-list className={`min-[860px]:border-r min-[860px]:border-edge ${selected ? 'max-[859px]:hidden' : ''}`}>
                {list}
              </DialogBody>
              {/* Keyed so another unit's datasheet starts from the top. */}
              <DialogBody key={selected?.key} data-army-detail className={selected ? 'p-0' : 'max-[859px]:hidden'}>
                {selected ? (
                  <ArmyLoadout army={army} unit={selected} />
                ) : (
                  <p className="py-8 text-center text-sm text-dim">Select a unit to see its datasheet.</p>
                )}
              </DialogBody>
            </div>
          ) : (
            <DialogBody>{list}</DialogBody>
          )}
        </BattleDialogContent>
      </BattlePromptDialog>
    </>
  )
}

function BattleUnit({
  unit,
  warlord,
  selected,
  onSelect,
  ...controls
}: {
  selected: boolean
  onSelect?: () => void
  unit: UnitState
  warlord: boolean
} & UnitControls) {
  const { actionable } = controls
  // A whole unit on the table with nothing to press has nothing to report, so it says nothing.
  const worthSaying = actionable || unit.destroyed || unit.alive < unit.models || unit.damage > 0 || unit.formation !== 'battlefield'

  return (
    <UnitCard
      unit={{
        entryId: unit.entryId ?? unit.key,
        name: unit.name,
        points: unit.points,
        wargear: unit.wargear ?? [],
        attachment: null,
        enhancements: unit.enhancements ?? [],
        upgrades: unit.upgrades ?? [],
      }}
      warlord={warlord}
      nickname={unit.nickname}
      note={unit.note}
      selected={selected}
      onSelect={onSelect}
      joined={unit.joined ?? []}
      editable={false}
      status={worthSaying ? <UnitStatus {...controls} unit={unit} /> : undefined}
    />
  )
}

/** Expose model and wound controls only where the frozen unit has those counts; the domain decides whether a wound removes a model. */
function UnitStatus({ unit, army, actionable, pending, blocked, send, press }: { unit: UnitState } & UnitControls) {
  const { units, playerId } = army
  const mark = (destroyed: boolean) => press({ kind: 'set-unit', unitKey: unit.key, destroyed, playerId })
  // The wounds a squad still has are the front model's; the ones behind it are whole.
  const wounds = unit.wounds ? unit.wounds - unit.damage : 0

  if (unit.destroyed) {
    return (
      <>
        <span className="chip shrink-0 border-destructive/60 text-destructive">Destroyed</span>
        {actionable ? (
          <Button
            variant="secondary"
            size="xs"
            className="ml-auto shrink-0"
            aria-label={`Bring ${unit.name} back`}
            disabled={blocked}
            onClick={() => mark(false)}
          >
            Bring back
          </Button>
        ) : null}
      </>
    )
  }

  return (
    <>
      {/* Where a unit is, when it is anywhere but on the table. */}
      {unit.formation === 'battlefield' ? null : (
        <span className="chip shrink-0">
          {formationLabel(unit.formation)}
          {unit.embarkedIn ? ` in ${transportLabel(units, unit.embarkedIn) ?? 'transport'}` : ''}
        </span>
      )}
      {actionable && unit.formation !== 'battlefield' ? (
        <Button
          variant="outline"
          size="xs"
          className="shrink-0"
          aria-label={`${unit.formation === 'embarked' ? 'Disembark' : 'Set up'} ${unit.name} on the battlefield`}
          disabled={pending}
          onClick={() => send({ kind: 'set-unit-formation', unitKey: unit.key, formation: 'battlefield', playerId })}
        >
          {unit.formation === 'embarked' ? 'Disembark' : 'Arrive'}
        </Button>
      ) : null}
      {unit.models > 1 ? (
        <Counter
          noun="models"
          left={unit.alive}
          of={unit.models}
          whole={unit.alive === unit.models}
          actionable={actionable}
          disabled={blocked}
          removeLabel={`Remove a model from ${unit.name}`}
          returnLabel={`Return a model to ${unit.name}`}
          onStep={(delta) => press({ kind: 'wound-unit', unitKey: unit.key, delta, playerId })}
        />
      ) : null}
      {unit.wounds && unit.wounds > 1 ? (
        <Counter
          noun="wounds"
          left={wounds}
          of={unit.wounds}
          whole={unit.alive === unit.models && unit.damage === 0}
          actionable={actionable}
          disabled={blocked}
          removeLabel={`Take a wound off ${unit.name}`}
          returnLabel={`Heal a wound on ${unit.name}`}
          onStep={(delta) => press({ kind: 'damage-unit', unitKey: unit.key, delta, playerId })}
        />
      ) : null}
      {actionable ? (
        <Button
          variant="destructive"
          size="xs"
          className="ml-auto shrink-0"
          aria-label={`Mark ${unit.name} destroyed`}
          disabled={blocked}
          onClick={() => mark(true)}
        >
          Destroyed
        </Button>
      ) : null}
    </>
  )
}

/**
 * One count of what a unit has left, and the two presses that change it.
 *
 * `whole` rather than `left === of`, because a squad's front model can be back to
 * full wounds with three of its fellows already dead, and there is nothing left to
 * heal on it.
 */
function Counter({
  noun,
  left,
  of,
  whole,
  actionable,
  disabled,
  removeLabel,
  returnLabel,
  onStep,
}: {
  noun: string
  left: number
  of: number
  whole: boolean
  actionable: boolean
  disabled: boolean
  removeLabel: string
  returnLabel: string
  onStep: (delta: number) => void
}) {
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      {actionable ? (
        <Button variant="outline" size="icon-xs" aria-label={removeLabel} disabled={disabled} onClick={() => onStep(-1)}>
          <Minus aria-hidden />
        </Button>
      ) : null}
      <span data-count={noun} className="readout text-xs font-semibold">
        {left}/{of}
      </span>
      <span className="eyebrow">{noun}</span>
      {actionable ? (
        <Button variant="outline" size="icon-xs" disabled={disabled || whole} aria-label={returnLabel} onClick={() => onStep(1)}>
          <Plus aria-hidden />
        </Button>
      ) : null}
    </span>
  )
}
