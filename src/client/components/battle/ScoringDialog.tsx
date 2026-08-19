import { useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { BattleView, Command } from '../../../core/battle'
import { alternatives, awardLimit, awardTotal, conditionLabel, counted, type MissionAward } from '../../missionText'
import { cardsDue, cardsDueFromTheirTurn, type DueCard, finishesOnScore } from '../../scoring'
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
 * A card states its conditions and what meeting each one pays, and the player answers
 * for the board. Which of those answers can stand together is the card's to say: it
 * groups the payouts that are tiers of one thing, and only the better tier scores.
 * Everything it leaves ungrouped a card can pay at the same time.
 */
export function ScoringDialog({ side, due, moment, confirmLabel, pending, send, referenceFor, onDone, onCancel }: Props) {
  const [answers, setAnswers] = useState<Answers>({})
  const answerFor = (card: DueCard) => answers[card.key] ?? card.awards.map(() => 0)
  const scoredFor = (card: DueCard) => card.awards.reduce((total, award, at) => total + awardTotal(award, answerFor(card)[at] ?? 0), 0)
  const total = due.reduce((sum, card) => sum + scoredFor(card), 0)

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
      if (!delta) continue
      send(card.category === 'primary' ? { kind: 'score', category: 'primary', delta } : { kind: 'score-secondary', key: card.key, delta })
      if (finishesOnScore(card.category, side.secondaryMode, delta)) {
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
          <DialogDescription className="text-dim">Press what the board actually paid on each card.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {due.map((card) => {
            const taken = answerFor(card)
            const scored = scoredFor(card)
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
                      key={`${award.vp}-${award.per ?? ''}-${award.when ?? ''}-${award.group ?? ''}-${JSON.stringify(award.parameters)}`}
                      card={card}
                      award={award}
                      tier={at > 0 && alternatives(award, card.awards[at - 1] ?? award)}
                      times={taken[at] ?? 0}
                      pending={pending}
                      onAnswer={(times) => answer(card, at, times)}
                    />
                  ))}
                  <div className="flex items-center gap-3 px-3 py-2">
                    <span className="min-w-0 flex-1 text-sm text-dim">Did not score (or chose not to)</span>
                    <Chip
                      label="0 VP"
                      chosen={taken.every((times) => times === 0)}
                      pending={pending}
                      ariaLabel={`${card.name} scored nothing`}
                      onPress={() => setAnswers((current) => ({ ...current, [card.key]: card.awards.map(() => 0) }))}
                    />
                  </div>
                </div>
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

/** One condition, and what meeting it pays. A counted one carries how many times. */
function AwardRow({
  card,
  award,
  tier,
  times,
  pending,
  onAnswer,
}: {
  card: DueCard
  award: MissionAward
  /** Another way the same thing pays, so it reads as an alternative to the row above. */
  tier: boolean
  times: number
  pending: boolean
  onAnswer: (times: number) => void
}) {
  const limit = awardLimit(award)
  // A payout the source described only in the card's own words is named by what it pays.
  const label = conditionLabel(award) ?? `Scores ${award.vp} VP${counted(award) ? ' each' : ''}`

  return (
    <div className="flex items-center gap-3 px-3 py-2">
      {tier ? <span className="chip shrink-0 border-edge-strong px-1 text-faint">or</span> : null}
      <span className="min-w-0 flex-1 text-sm">
        {label}
        {counted(award) ? (
          <span className="mt-0.5 block text-[0.625rem] text-faint">
            {award.vp} VP each{award.max === null ? '' : `, up to ${award.max} VP`}
          </span>
        ) : null}
      </span>
      {counted(award) ? (
        <>
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
              aria-label={`${card.name} plus ${award.vp} per ${award.per?.replaceAll('-', ' ')}`}
              disabled={pending || (limit !== null && times >= limit)}
              onClick={() => onAnswer(times + 1)}
            >
              <Plus />
            </Button>
          </div>
          <span className={`chip shrink-0 ${times > 0 ? 'border-azure text-azure' : 'border-edge-strong'}`}>
            {awardTotal(award, times)} VP
          </span>
        </>
      ) : (
        <Chip
          label={`${award.vp} VP`}
          chosen={times > 0}
          pending={pending}
          ariaLabel={`${card.name} plus ${award.vp}`}
          onPress={() => onAnswer(times > 0 ? 0 : 1)}
        />
      )}
    </div>
  )
}

/** The payout itself is the control: pressing the number is how it is claimed. */
function Chip({
  label,
  chosen,
  pending,
  ariaLabel,
  onPress,
}: {
  label: string
  chosen: boolean
  pending: boolean
  ariaLabel: string
  onPress: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={chosen}
      aria-label={ariaLabel}
      disabled={pending}
      onClick={onPress}
      className={`chip shrink-0 px-2 py-1 ${chosen ? 'border-azure bg-azure/15 text-azure' : 'border-edge-strong hover:border-azure hover:text-azure'}`}
    >
      {label}
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
