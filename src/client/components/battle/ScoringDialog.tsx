import { useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { Command } from '../../../core/battle'
import type { BattleView } from '../../../core/battleView'
import { alternatives, awardLimit, awardTotal, conditionLabel, counted, type MissionAward, payoutLabel } from '../../missionText'
import { cardsDue, cardsDueFromTheirTurn, type DueCard, finishesOnScore } from '../../scoring'
import { type Side, sideName } from '../../sides'
import { RuleText } from '../RuleText'
import { MissionName, type ReferenceCard } from './MissionCards'

type Props = {
  side: Side
  due: DueCard[]
  /** What the moment is called, since a turn can owe a side that was not taking it. */
  moment: string
  pending: boolean
  send: (command: Command) => void
  referenceFor: (key: string) => ReferenceCard | undefined
  onDone: (completedSecondaryKeys: string[]) => void
  onCancel?: () => void
  /** What pressing through the prompt does next. */
  confirmLabel: string
  /** What this side has already banked this round, before anything answered here. */
  roundSoFar: { primary: number; secondary: number }
  /** The matched-play ceilings this mission states, when it states any. */
  caps: { primaryRound: number | null; primaryGame: number | null; secondaryRound: number | null; secondaryGame: number | null }
}

/** How much more a category can take before a stated ceiling refuses it. */
type Room = { round: number | null; game: number | null }

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
export function ScoringDialog({ side, due, moment, confirmLabel, pending, send, referenceFor, onDone, onCancel, roundSoFar, caps }: Props) {
  const [answers, setAnswers] = useState<Answers>({})
  const answerFor = (card: DueCard) => answers[card.key] ?? card.awards.map(() => 0)
  const scoredFor = (card: DueCard) => card.awards.reduce((total, award, at) => total + awardTotal(award, answerFor(card)[at] ?? 0), 0)
  const total = due.reduce((sum, card) => sum + scoredFor(card), 0)

  // Room left under the mission's own ceilings, not each card's: two secondary cards
  // due at once draw from the one shared pool, the same way the rules book counts it.
  const roomFor = (category: 'primary' | 'secondary'): Room => {
    const roundCap = category === 'primary' ? caps.primaryRound : caps.secondaryRound
    const gameCap = category === 'primary' ? caps.primaryGame : caps.secondaryGame
    const bankedRound = category === 'primary' ? roundSoFar.primary : roundSoFar.secondary
    const bankedGame = category === 'primary' ? side.primary : side.secondary
    const answeredSoFar = due.filter((card) => card.category === category).reduce((sum, card) => sum + scoredFor(card), 0)
    return {
      round: roundCap === null ? null : roundCap - bankedRound - answeredSoFar,
      game: gameCap === null ? null : gameCap - bankedGame - answeredSoFar,
    }
  }

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
      send(
        card.category === 'primary'
          ? { kind: 'score', category: 'primary', delta, playerId: side.captain.id }
          : { kind: 'score-secondary', key: card.key, delta, playerId: side.captain.id },
      )
      if (finishesOnScore(card.category, side.secondaryMode, delta)) {
        send({ kind: 'set-secondary-status', key: card.key, status: 'achieved', playerId: side.captain.id })
      }
    }
    onDone(due.filter((card) => finishesOnScore(card.category, side.secondaryMode, scoredFor(card))).map((card) => card.key))
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel?.()}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto rounded-none border border-discarded/60 bg-panel text-bone sm:max-w-2xl">
        <DialogHeader className="text-center">
          <p className="eyebrow text-discarded">Now</p>
          <DialogTitle className="uppercase">Scoring {moment} points</DialogTitle>
          <DialogDescription className="text-dim">
            Recording points for {sideName(side)}. Press what the board actually paid on each card.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {due.map((card) => {
            const taken = answerFor(card)
            const scored = scoredFor(card)
            const reference = referenceFor(card.key)
            const room = roomFor(card.category)
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
                </div>
                <div className="divide-y divide-edge">
                  {card.awards.map((award, at) => (
                    <AwardRow
                      key={`${award.vp}-${award.criteria ?? at}`}
                      card={card}
                      award={award}
                      tier={at > 0 && alternatives(award, card.awards[at - 1] ?? award)}
                      times={taken[at] ?? 0}
                      room={room}
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
          {onCancel ? (
            <Button variant="outline" disabled={pending} onClick={onCancel}>
              Go back
            </Button>
          ) : null}
          <Button disabled={pending} onClick={confirm}>
            {confirmLabel}
          </Button>
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
  room,
  pending,
  onAnswer,
}: {
  card: DueCard
  award: MissionAward
  /** Another way the same thing pays, so it reads as an alternative to the row above. */
  tier: boolean
  times: number
  room: Room
  pending: boolean
  onAnswer: (times: number) => void
}) {
  const limit = awardLimit(award)
  const label = conditionLabel(award) ?? payoutLabel(award, card.awards)
  const marginal = awardTotal(award, times + 1) - awardTotal(award, times)
  const roundCapped = room.round !== null && marginal > room.round
  const gameCapped = !roundCapped && room.game !== null && marginal > room.game
  const missionWord = card.category === 'primary' ? 'primary mission' : 'secondary missions'
  const capNote = roundCapped
    ? `This round’s ${missionWord} cap is reached — the rest may still score next round.`
    : gameCapped
      ? `The battle’s ${missionWord} cap is reached.`
      : null

  return (
    <div className="flex items-center gap-3 px-3 py-2">
      {tier ? <span className="chip shrink-0 border-edge-strong px-1 text-faint">or</span> : null}
      <span className="min-w-0 flex-1 text-sm">
        {/* The pack's own sentence, so the keywords it marks up read as keywords here too. */}
        <RuleText text={label} className="mt-0 space-y-1 text-sm text-bone" />
        {counted(award) ? (
          <span className="mt-0.5 block text-[0.625rem] text-faint">
            {award.vp} VP each{award.max === null ? '' : `, up to ${award.max} VP`}
          </span>
        ) : null}
        {capNote ? <span className="mt-0.5 block text-[0.625rem] text-destructive">{capNote}</span> : null}
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
              disabled={pending || (limit !== null && times >= limit) || roundCapped || gameCapped}
              onClick={() => onAnswer(times + 1)}
            >
              <Plus />
            </Button>
          </div>
          <span className={`chip shrink-0 ${times > 0 ? 'border-parchment text-parchment' : 'border-edge-strong'}`}>
            {awardTotal(award, times)} VP
          </span>
        </>
      ) : (
        <Chip
          label={`${award.vp} VP`}
          chosen={times > 0}
          pending={pending}
          disabled={times === 0 && (roundCapped || gameCapped)}
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
  disabled,
  ariaLabel,
  onPress,
}: {
  label: string
  chosen: boolean
  pending: boolean
  disabled?: boolean
  ariaLabel: string
  onPress: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={chosen}
      aria-label={ariaLabel}
      disabled={pending || disabled}
      onClick={onPress}
      className={`chip shrink-0 px-2 py-1 ${chosen ? 'border-parchment bg-parchment/15 text-parchment' : 'border-edge-strong hover:border-azure hover:text-azure'}`}
    >
      {label}
    </button>
  )
}

/** The cards a side's own advance settles, or an empty list when it settles none. */
export function dueForAdvance(view: BattleView, side: Side, awardsFor: (key: string, mode?: string) => MissionAward[]): DueCard[] {
  return cardsDue(view, side.isActive, playable(side, awardsFor))
}

/**
 * What the turn the other side just finished owes this one.
 *
 * `hand` is what this side was holding when that turn ended. A card dealt after it was
 * not in play for it, so it is not asked about — otherwise the prompt opens about a
 * card the player has not even been shown yet.
 */
export function dueFromTheirTurn(
  round: number,
  side: Side,
  awardsFor: (key: string, mode?: string) => MissionAward[],
  hand: readonly string[],
): DueCard[] {
  return cardsDueFromTheirTurn(round, playable(side, awardsFor), hand)
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
