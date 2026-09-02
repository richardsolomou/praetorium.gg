import { Minus, Plus, Scroll } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { Command, UnitState } from '../../../core/battle'
import { armyModels, armyShelves } from '../../armyUnits'
import type { Army, Side } from '../../sides'
import { ArmyIdentity } from '../ArmyIdentity'
import { Section } from '../builder/Section'
import { UnitCard } from '../builder/UnitCard'
import { formationLabel } from '../setup/chrome'
import { HEADING, tint } from './tints'

type Props = {
  army: Army
  side: Side
  token: string
  /** Casualties are recorded only while the battle is running. */
  actionable: boolean
  send: (command: Command) => void
}

/**
 * An army's own list, opened over the battle rather than away from it.
 *
 * The list a player is playing is the thing they reach for most and the one thing
 * the tracker sent them off the page to read, so a turn spent checking what a unit
 * is carrying cost the game its screen. It is the same roster cards the library and
 * the frozen snapshot draw, from the log rather than the saved list, with one row
 * added: what the battle has taken off the unit.
 *
 * Either side may open either army and record its losses. Everything about a unit is
 * already public to both players, and one person refereeing the table should not have
 * to hand a phone across it to say a squad is gone.
 */
export function ArmyRoster({ army, side, token, actionable, send }: Props) {
  const [open, setOpen] = useState(false)
  const roster = army.roster
  if (!roster) return null

  const models = armyModels(army.units)
  const lost = army.units.filter((unit) => unit.destroyed)
  const card = (unit: UnitState) => <BattleUnit key={unit.key} unit={unit} army={army} actionable={actionable} send={send} />

  return (
    <>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        <Button variant="secondary" size="xs" onClick={() => setOpen(true)} aria-label={`Open ${roster.name}`}>
          <Scroll aria-hidden /> Army
        </Button>
        {/* What is left of it, so the number worth glancing at needs no dialog to read. */}
        {army.units.length ? (
          <span className="readout text-[0.625rem] text-faint">
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
        <DialogContent data-army-roster className={`rounded-none border bg-panel text-bone sm:max-w-xl ${tint(side.index).border}`}>
          <DialogHeader className="text-center">
            <p className="eyebrow">{army.playerName}</p>
            <DialogTitle className="uppercase">{roster.name}</DialogTitle>
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
}: {
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
      status={worthSaying ? <UnitStatus unit={unit} playerId={army.playerId} actionable={actionable} send={send} /> : undefined}
    />
  )
}

/**
 * What the battle has done to one unit, and what can be done about it.
 *
 * Two counters, because a table has two: a squad loses whole models, and the model
 * currently taking damage loses wounds until it goes. A unit shows whichever of them
 * it actually has — a lone Dreadnought has only wounds, a squad of one-wound infantry
 * has only models, and a squad of Terminators has both. Losing the unit outright is
 * the separate button, for the squad that is wiped in one go.
 *
 * Neither counter decides anything. Whether a wound takes a model with it is the
 * domain's rule, so a press sends one command and reads the answer back.
 */
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
      <span className={HEADING}>{noun}</span>
      {actionable ? (
        <Button variant="outline" size="icon-xs" disabled={whole} aria-label={returnLabel} onClick={() => onStep(1)}>
          <Plus aria-hidden />
        </Button>
      ) : null}
    </span>
  )
}
