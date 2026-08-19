import { useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { BattleView, Command } from '../../../core/battle'
import { awardLimit, awardTotal, conditionLabel, type MissionAward } from '../../missionText'
import { cardsDue, cardsDueFromTheirTurn, type DueCard } from '../../scoring'
import type { Side } from '../../sides'
import { MissionName, type ReferenceCard } from './MissionCards'

type Props = {
  side: Side
  due: DueCard[]
  /** What the moment is called, since a turn can owe a side that was not taking it. */
  moment: string
  pending: boolean
  send: (command: Command) => void
  referenceFor: (key: string) => ReferenceCard | undefined
  onDone: () => void
  onCancel: () => void
  /** What pressing through the prompt does next. */
  confirmLabel: string
}

/** How many times each payout on a card was taken. Zero throughout is "did not score". */
type Answers = Record<string, number[]>

/**
 * What each card asks, at the moment it asks it.
 *
 * A card states its conditions and what meeting each one pays. The player picks the
 * one the board actually met, or says it scored nothing, and the points follow. The
 * conditions on a card are alternatives unless the card marks one as cumulative, so
 * picking one clears the others and a payout can never be taken twice.
 */
export function ScoringDialog({ side, due, moment, confirmLabel, pending, send, referenceFor, onDone, onCancel }: Props) {
  const [answers, setAnswers] = useState<Answers>({})
  const [finished, setFinished] = useState<Record<string, boolean>>({})
  const answerFor = (card: DueCard) => answers[card.key] ?? card.awards.map(() => 0)
  const scoredFor = (card: DueCard) => card.awards.reduce((total, award, at) => total + awardTotal(award, answerFor(card)[at] ?? 0), 0)
  const total = due.reduce((sum, card) => sum + scoredFor(card), 0)

  /**
   * Alternatives clear each other; a cumulative payout sits on top of whichever was picked.
   *
   * The card says which payouts are alternatives through the group it puts them in.
   * Where it names no group, the payouts on a card are still one choice unless the
   * card marks one as stacking, which is what "or" on a printed card means.
   */
  const answer = (card: DueCard, at: number, times: number) =>
    setAnswers((current) => {
      const taken = current[card.key] ?? card.awards.map(() => 0)
      const chosen = card.awards[at]
      if (!chosen) return current
      return {
        ...current,
        [card.key]: card.awards.map((award, index) => (index === at ? times : alternatives(chosen, award) ? 0 : (taken[index] ?? 0))),
      }
    })

  const confirm = () => {
    for (const card of due) {
      const delta = scoredFor(card)
      if (delta) {
        send(
          card.category === 'primary' ? { kind: 'score', category: 'primary', delta } : { kind: 'score-secondary', key: card.key, delta },
        )
      }
      if (card.category === 'secondary' && finished[card.key]) {
        send({ kind: 'set-secondary-status', key: card.key, status: 'achieved' })
      }
    }
    onDone()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto rounded-none border border-edge bg-panel text-bone sm:max-w-2xl">
        <DialogHeader className="text-center">
          <p className="eyebrow">Now</p>
          <DialogTitle className="uppercase">Scoring {moment} points</DialogTitle>
          <DialogDescription className="text-dim">Pick what the board actually did on each card.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {due.map((card) => {
            const taken = answerFor(card)
            const scored = scoredFor(card)
            const nothing = taken.every((times) => times === 0)
            const reference = referenceFor(card.key)
            return (
              <section key={card.key} data-due={card.key} className="border border-edge">
                <div className="bg-sunken px-3 py-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <MissionName
                      name={card.name}
                      card={reference}
                      type={card.category === 'primary' ? 'Primary mission' : 'Secondary mission'}
                    />
                    <span className="readout shrink-0 text-xs text-dim">
                      {scored ? `+${scored} VP` : `${scoredSoFar(side, card)} so far`}
                    </span>
                  </div>
                  {/* The card's own words, which say what a payout the source left unstructured is for. */}
                  {reference?.text ? <p className="mt-1 font-rules text-xs text-dim">{reference.text}</p> : null}
                </div>
                <div className="divide-y divide-edge">
                  {card.awards.map((award, at) => (
                    <AwardRow
                      key={`${award.vp}-${award.per ?? ''}-${award.when ?? ''}-${award.cumulative}`}
                      card={card}
                      award={award}
                      first={at === 0}
                      times={taken[at] ?? 0}
                      pending={pending}
                      onAnswer={(times) => answer(card, at, times)}
                    />
                  ))}
                  <Row
                    label="Did not score (or chose not to)"
                    alternative
                    chosen={nothing}
                    disabled={pending}
                    ariaLabel={`${card.name} scored nothing`}
                    onChoose={() => setAnswers((current) => ({ ...current, [card.key]: card.awards.map(() => 0) }))}
                  >
                    <span className="chip shrink-0 border-edge-strong text-dim">0 VP</span>
                  </Row>
                </div>
                {card.category === 'secondary' ? (
                  <label className="flex cursor-pointer items-center gap-2 border-t border-edge px-3 py-2 text-xs text-dim">
                    <input
                      type="checkbox"
                      className="size-3.5 accent-azure"
                      checked={finished[card.key] ?? false}
                      onChange={(event) => setFinished((current) => ({ ...current, [card.key]: event.target.checked }))}
                    />
                    This mission is finished — take it out of the hand
                  </label>
                ) : null}
              </section>
            )
          })}
        </div>

        <DialogFooter className="flex-col items-stretch gap-2 rounded-none border-edge bg-sunken sm:flex-row sm:items-center">
          <span className="readout mr-auto text-sm text-dim">
            Scoring <span className="font-bold text-bone">{total}</span> VP
          </span>
          <Button variant="outline" disabled={pending} onClick={onCancel}>
            Go back
          </Button>
          <Button onClick={confirm}>{confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Whether picking one payout rules the other out. */
function alternatives(chosen: MissionAward, other: MissionAward) {
  if (chosen.cumulative || other.cumulative) return false
  if (chosen.group || other.group) return chosen.group === other.group
  return true
}

/** One condition, and what meeting it pays. A counted one carries how many times. */
function AwardRow({
  card,
  award,
  first,
  times,
  pending,
  onAnswer,
}: {
  card: DueCard
  award: MissionAward
  first: boolean
  times: number
  pending: boolean
  onAnswer: (times: number) => void
}) {
  const limit = awardLimit(award)
  // A payout the source described only in the card's own words is named by what it pays.
  const label = conditionLabel(award) ?? `Scores ${award.vp} VP${award.per ? ' each' : ''}`

  if (!award.per) {
    return (
      <Row
        label={label}
        alternative={!first && !award.cumulative}
        cumulative={award.cumulative}
        chosen={times > 0}
        disabled={pending}
        ariaLabel={`${card.name} plus ${award.vp}`}
        onChoose={() => onAnswer(times > 0 ? 0 : 1)}
      >
        <span className={`chip shrink-0 ${times > 0 ? 'border-azure text-azure' : 'border-edge-strong'}`}>
          {award.cumulative ? '+' : ''}
          {award.vp} VP
        </span>
      </Row>
    )
  }

  return (
    <div className="flex items-center gap-3 px-3 py-2">
      {!first && !award.cumulative ? <span className="chip shrink-0 border-edge-strong px-1 text-faint">or</span> : null}
      <span className="min-w-0 flex-1 text-sm">
        {label}
        <span className="mt-0.5 block text-[0.625rem] text-faint">
          {award.vp} VP each{award.max === null ? '' : `, up to ${award.max} VP`}
        </span>
      </span>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="outline"
          size="icon-xs"
          aria-label={`One fewer for ${card.name}`}
          disabled={pending || times === 0}
          onClick={() => onAnswer(times - 1)}
        >
          <Minus />
        </Button>
        <span className="readout min-w-5 text-center text-sm font-bold">{times}</span>
        <Button
          variant="outline"
          size="icon-xs"
          aria-label={`${card.name} plus ${award.vp} per ${award.per.replaceAll('-', ' ')}`}
          disabled={pending || (limit !== null && times >= limit)}
          onClick={() => onAnswer(times + 1)}
        >
          <Plus />
        </Button>
      </div>
      <span className={`chip shrink-0 ${times > 0 ? 'border-azure text-azure' : 'border-edge-strong'}`}>{awardTotal(award, times)} VP</span>
    </div>
  )
}

function Row({
  label,
  alternative,
  cumulative,
  chosen,
  disabled,
  ariaLabel,
  onChoose,
  children,
}: {
  label: string
  alternative?: boolean
  cumulative?: boolean
  chosen: boolean
  disabled: boolean
  ariaLabel: string
  onChoose: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={chosen}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onChoose}
      className={`flex w-full items-center gap-3 px-3 py-2 text-left ${chosen ? 'bg-azure/10' : 'hover:bg-sunken'}`}
    >
      {alternative ? <span className="chip shrink-0 border-edge-strong px-1 text-faint">or</span> : null}
      {cumulative ? <span className="chip shrink-0 border-edge-strong px-1 text-faint">and</span> : null}
      <span className="min-w-0 flex-1 text-sm">{label}</span>
      {children}
    </button>
  )
}

/** The cards a side's own advance settles, or an empty list when it settles none. */
export function dueForAdvance(view: BattleView, side: Side, awardsFor: (key: string, mode?: string) => MissionAward[]): DueCard[] {
  return cardsDue(view, side.isActive, playable(side, awardsFor))
}

/** What the turn the other side just finished owes this one. */
export function dueFromTheirTurn(round: number, side: Side, awardsFor: (key: string, mode?: string) => MissionAward[]): DueCard[] {
  return cardsDueFromTheirTurn(round, playable(side, awardsFor))
}

/** A side's primary and whatever is still live in its hand, with the payouts each carries. */
function playable(side: Side, awardsFor: (key: string, mode?: string) => MissionAward[]) {
  return [
    ...(side.primaryCard ? [{ ...side.primaryCard, category: 'primary' as const, awards: awardsFor(side.primaryCard.key) }] : []),
    ...side.secondaries
      .filter((secondary) => secondary.status === 'active')
      .map((secondary) => ({
        key: secondary.key,
        name: secondary.name,
        category: 'secondary' as const,
        awards: awardsFor(secondary.key, side.secondaryMode),
      })),
  ]
}

const scoredSoFar = (side: Side, card: DueCard) =>
  card.category === 'primary' ? side.primary : (side.secondaries.find((entry) => entry.key === card.key)?.points ?? 0)
