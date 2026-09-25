import { Minus, Plus, Scroll, Swords } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { Command, UnitState } from '../../../core/battle'
import { armyModels, armyShelves } from './armyUnits'
import type { Army, Side } from '../../sides'
import { ArmyIdentity } from './ArmyIdentity'
import { Section } from '../rosters/builder/Section'
import { UnitCard } from '../rosters/builder/UnitCard'
import { formationLabel } from './setup/chrome'
import type { BattleCombatSelection } from '../simulator/BattleCombatDialog'
import { tint } from './battleTints'

type Props = {
  army: Army
  side: Side
  token: string
  onSimulate: (selection: BattleCombatSelection) => void
  /** Casualties are recorded only while the battle is running. */
  actionable: boolean
  send: (command: Command) => void
}

/** Show the frozen roster from the battle log in place, with current losses; either seated side can record either army’s losses. */
export function ArmyRoster({ army, side, token, actionable, send, onSimulate }: Props) {
  const [open, setOpen] = useState(false)
  const roster = army.roster
  if (!roster) return null

  const models = armyModels(army.units)
  const lost = army.units.filter((unit) => unit.destroyed)
  const canSimulate = (unit: UnitState) =>
    Boolean(roster.built?.picks?.length && unit.entryId && !unit.destroyed && unit.formation === 'battlefield')
  const simulate = (unitKey?: string) => {
    setOpen(false)
    onSimulate({ playerId: army.playerId, unitKey })
  }
  const card = (unit: UnitState) => (
    <BattleUnit
      key={unit.key}
      unit={unit}
      army={army}
      actionable={actionable}
      send={send}
      onSimulate={canSimulate(unit) ? () => simulate(unit.key) : undefined}
    />
  )

  return (
    <>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        <Button variant="secondary" size="xs" onClick={() => setOpen(true)} aria-label={`Open ${roster.name}`}>
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-army-roster className={`max-h-[85dvh] overflow-y-auto sm:max-w-xl ${tint(side.index).border}`}>
          <DialogHeader className="text-center">
            <p className="eyebrow">{army.playerName}</p>
            <DialogTitle>{roster.name}</DialogTitle>
            <DialogDescription render={<div />}>
              <ArmyIdentity army={army} token={token} list={false} className="justify-center" />
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
        </DialogContent>
      </Dialog>
    </>
  )
}

function BattleUnit({
  unit,
  army,
  actionable,
  send,
  onSimulate,
}: {
  onSimulate?: () => void
  unit: UnitState
  army: Army
  actionable: boolean
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
      selected={false}
      joined={unit.joined ?? []}
      editable={false}
      status={
        worthSaying || onSimulate ? (
          <>
            {onSimulate ? (
              <Button variant="outline" size="xs" aria-label={`Simulate ${unit.name}`} onClick={onSimulate}>
                <Swords aria-hidden /> Simulate
              </Button>
            ) : null}
            {worthSaying ? <UnitStatus unit={unit} playerId={army.playerId} actionable={actionable} send={send} /> : null}
          </>
        ) : undefined
      }
    />
  )
}

/** Expose model and wound controls only where the frozen unit has those counts; the domain decides whether a wound removes a model. */
function UnitStatus({
  unit,
  playerId,
  actionable,
  send,
}: {
  unit: UnitState
  playerId: string
  actionable: boolean
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
      {unit.formation === 'battlefield' ? null : <span className="chip shrink-0">{formationLabel(unit.formation)}</span>}
      {unit.models > 1 ? (
        <Counter
          noun="models"
          left={unit.alive}
          of={unit.models}
          whole={unit.alive === unit.models}
          actionable={actionable}
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
  removeLabel,
  returnLabel,
  onStep,
}: {
  noun: string
  left: number
  of: number
  whole: boolean
  actionable: boolean
  removeLabel: string
  returnLabel: string
  onStep: (delta: number) => void
}) {
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      {actionable ? (
        <Button variant="outline" size="icon-xs" aria-label={removeLabel} onClick={() => onStep(-1)}>
          <Minus aria-hidden />
        </Button>
      ) : null}
      <span data-count={noun} className="readout text-xs font-semibold">
        {left}/{of}
      </span>
      <span className="eyebrow">{noun}</span>
      {actionable ? (
        <Button variant="outline" size="icon-xs" disabled={whole} aria-label={returnLabel} onClick={() => onStep(1)}>
          <Plus aria-hidden />
        </Button>
      ) : null}
    </span>
  )
}
