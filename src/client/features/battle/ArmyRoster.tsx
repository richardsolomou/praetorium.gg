import { Minus, Plus, Scroll, Swords } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { BattleDialogContent, BattlePromptDialog } from './BattlePromptDialog'
import { type Command, transportLabel, type UnitState } from '../../../core/battle'
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
  send: (command: Command) => void
}

/** Show the frozen roster from the battle log in place, with current losses; either seated side can record either army’s losses. */
export function ArmyRoster({ army, side, actionable, pending, send, onSimulate }: Props) {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const unitCards = useRef(new Map<string, HTMLDivElement>())
  const collapsedCard = useRef<HTMLDivElement | null>(null)
  useLayoutEffect(() => {
    collapsedCard.current?.scrollIntoView({ block: 'nearest' })
    collapsedCard.current = null
  }, [expanded])
  const roster = army.roster
  if (!roster) return null

  const models = armyModels(army.units)
  const lost = army.units.filter((unit) => unit.destroyed)
  const canSimulate = (unit: UnitState) =>
    Boolean(roster.built?.picks?.length && unit.entryId && !unit.destroyed && unit.formation === 'battlefield')
  const simulate = () => onSimulate({ playerId: army.playerId })
  const card = (unit: UnitState) => (
    <div key={unit.key} data-army-unit>
      <div
        ref={(element) => {
          if (element) unitCards.current.set(unit.key, element)
          else unitCards.current.delete(unit.key)
        }}
        data-army-unit-header
        className={expanded.has(unit.key) ? 'sticky -top-4 z-20 bg-panel' : undefined}
      >
        <BattleUnit
          unit={unit}
          army={army}
          selected={expanded.has(unit.key)}
          onSelect={
            roster.built?.picks?.length && unit.entryId
              ? () => {
                  if (expanded.has(unit.key)) collapsedCard.current = unitCards.current.get(unit.key) ?? null
                  setExpanded((previous) => {
                    const next = new Set(previous)
                    if (next.has(unit.key)) next.delete(unit.key)
                    else next.add(unit.key)
                    return next
                  })
                }
              : undefined
          }
          actionable={actionable}
          pending={pending}
          send={send}
        />
      </div>
      {expanded.has(unit.key) ? <ArmyLoadout army={army} unit={unit} /> : null}
    </div>
  )

  return (
    <>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        <Button variant="secondary" size="xs" className="max-w-full" onClick={() => setOpen(true)} aria-label={`Open ${roster.name}`}>
          <Scroll aria-hidden /> Army
        </Button>
        {army.units.some(canSimulate) ? (
          <Button variant="secondary" size="xs" onClick={() => simulate()} aria-label={`Simulate ${army.playerName}'s combat`}>
            <Swords aria-hidden /> Simulate
          </Button>
        ) : null}
        {/* What is left of it, so the number worth glancing at needs no dialog to read. */}
        {army.units.length ? (
          <span className="readout text-3xs text-faint">
            <span data-army-units>
              {army.standing}/{army.unitCount}
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
        onOpenChange={setOpen}
        minimizedLabel={`${army.playerName} · ${roster.name}`}
        resumeLabel="Return to army"
      >
        <BattleDialogContent
          data-army-roster
          data-mobile-fullscreen
          className={`max-h-[85dvh] content-start overflow-y-auto sm:max-w-xl ${tint(side.index).border}`}
        >
          <DialogHeader className="text-center">
            <p className="eyebrow">{army.playerName}</p>
            <DialogTitle>{roster.name}</DialogTitle>
            <DialogDescription render={<div />}>
              <ArmyIdentity army={army} list={false} className="justify-center" />
              {roster.built?.picks?.length ? <p className="mt-1 text-xs text-dim">Select a unit to see its loadout.</p> : null}
            </DialogDescription>
          </DialogHeader>

          {army.units.length ? (
            <div>
              {armyShelves(army.units).map((shelf) => (
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
                <Section title="Lost" count={lost.length} defaultOpen={false}>
                  {lost.map(card)}
                </Section>
              ) : null}
            </div>
          ) : (
            /* A list attached before the battle knew how to read one is still the army. */
            <pre className="overflow-auto border border-edge bg-sunken p-3 font-rules text-sm whitespace-pre-wrap select-text">
              {roster.text}
            </pre>
          )}
        </BattleDialogContent>
      </BattlePromptDialog>
    </>
  )
}

function BattleUnit({
  unit,
  army,
  actionable,
  pending,
  send,
  selected,
  onSelect,
}: {
  selected: boolean
  onSelect?: () => void
  unit: UnitState
  army: Army
  actionable: boolean
  pending: boolean
  send: (command: Command) => void
}) {
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
      selected={selected}
      onSelect={onSelect}
      joined={unit.joined ?? []}
      editable={false}
      status={
        worthSaying ? (
          <UnitStatus unit={unit} units={army.units} playerId={army.playerId} actionable={actionable} pending={pending} send={send} />
        ) : undefined
      }
    />
  )
}

/** Expose model and wound controls only where the frozen unit has those counts; the domain decides whether a wound removes a model. */
function UnitStatus({
  unit,
  units,
  playerId,
  actionable,
  pending,
  send,
}: {
  unit: UnitState
  units: UnitState[]
  playerId: string
  actionable: boolean
  pending: boolean
  send: (command: Command) => void
}) {
  const mark = (destroyed: boolean) => send({ kind: 'set-unit', unitKey: unit.key, destroyed, playerId })
  // The wounds a squad still has are the front model's; the ones behind it are whole.
  const wounds = unit.wounds ? unit.wounds - unit.damage : 0

  if (unit.destroyed) {
    return (
      <>
        <span className="chip shrink-0 border-destructive/60 text-destructive">Lost</span>
        {actionable ? (
          <Button
            variant="secondary"
            size="xs"
            className="ml-auto shrink-0"
            aria-label={`Bring ${unit.name} back`}
            disabled={pending}
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
      {unit.models > 1 ? (
        <Counter
          noun="models"
          left={unit.alive}
          of={unit.models}
          whole={unit.alive === unit.models}
          actionable={actionable}
          pending={pending}
          removeLabel={`Remove a model from ${unit.name}`}
          returnLabel={`Return a model to ${unit.name}`}
          onStep={(delta) => send({ kind: 'wound-unit', unitKey: unit.key, delta, playerId })}
        />
      ) : null}
      {unit.wounds && unit.wounds > 1 ? (
        <Counter
          noun="wounds"
          left={wounds}
          of={unit.wounds}
          whole={unit.alive === unit.models && unit.damage === 0}
          actionable={actionable}
          pending={pending}
          removeLabel={`Take a wound off ${unit.name}`}
          returnLabel={`Heal a wound on ${unit.name}`}
          onStep={(delta) => send({ kind: 'damage-unit', unitKey: unit.key, delta, playerId })}
        />
      ) : null}
      {actionable ? (
        <Button
          variant="destructive"
          size="xs"
          className="ml-auto shrink-0"
          aria-label={`Mark ${unit.name} lost`}
          disabled={pending}
          onClick={() => mark(true)}
        >
          Lost
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
  pending,
  removeLabel,
  returnLabel,
  onStep,
}: {
  noun: string
  left: number
  of: number
  whole: boolean
  actionable: boolean
  pending: boolean
  removeLabel: string
  returnLabel: string
  onStep: (delta: number) => void
}) {
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      {actionable ? (
        <Button variant="outline" size="icon-xs" aria-label={removeLabel} disabled={pending} onClick={() => onStep(-1)}>
          <Minus aria-hidden />
        </Button>
      ) : null}
      <span data-count={noun} className="readout text-xs font-semibold">
        {left}/{of}
      </span>
      <span className="eyebrow">{noun}</span>
      {actionable ? (
        <Button variant="outline" size="icon-xs" disabled={pending || whole} aria-label={returnLabel} onClick={() => onStep(1)}>
          <Plus aria-hidden />
        </Button>
      ) : null}
    </span>
  )
}
