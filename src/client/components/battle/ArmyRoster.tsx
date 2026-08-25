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
              {army.standing}/{army.units.length}
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
  const worthSaying = actionable || unit.destroyed || unit.alive < unit.models || unit.formation !== 'battlefield'

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
 * Models come off one at a time because that is how they come off a table, and the
 * last one taking the unit with it is the domain's rule rather than this screen's:
 * losing the last model and losing the unit are one event. Losing the unit outright
 * is the separate button, for the squad that is wiped in one go.
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
  const step = (delta: number) => send({ kind: 'wound-unit', unitKey: unit.key, delta, playerId })
  const mark = (destroyed: boolean) => send({ kind: 'set-unit', unitKey: unit.key, destroyed, playerId })

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
        <span className="flex shrink-0 items-center gap-1.5">
          {actionable ? (
            <Button variant="outline" size="icon-xs" aria-label={`Remove a model from ${unit.name}`} onClick={() => step(-1)}>
              <Minus aria-hidden />
            </Button>
          ) : null}
          <span className="readout text-xs font-semibold">
            {unit.alive}/{unit.models}
          </span>
          <span className={HEADING}>models</span>
          {actionable ? (
            <Button
              variant="outline"
              size="icon-xs"
              disabled={unit.alive === unit.models}
              aria-label={`Return a model to ${unit.name}`}
              onClick={() => step(1)}
            >
              <Plus aria-hidden />
            </Button>
          ) : null}
        </span>
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
