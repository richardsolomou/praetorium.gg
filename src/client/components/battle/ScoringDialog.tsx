import { useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { Command } from '../../../core/battle'
import type { BattleView } from '../../../core/battleView'
import {
  alternatives,
  appliesInMode,
  awardLimit,
  awardTotal,
  conditionLabel,
  counted,
  type MissionAward,
  payoutJoin,
  payoutLabel,
} from '../../missionText'
import { capRoom, cardsDue, cardsDueFromTheirTurn, type DueCard, finishesOnScore, scoredThisRound, settleAgainstCaps } from '../../scoring'
import { type Side, sideName } from '../../sides'
import { RuleText } from '../RuleText'
import { MissionName, type ReferenceCard } from './MissionCards'
import { tint } from './tints'
import { UndoLatestButton, UndoLatestConfirmation, useUndoLatest } from './UndoLatest'

/** Which side a prompt is recording for, in the colours it wears to say so. */
type Tone = ReturnType<typeof tint>

type Props = {
  side: Side
  due: DueCard[]
  /** What the moment is called, since a turn can owe a side that was not taking it. */
  moment: string
  pending: boolean
  send: (command: Command) => void
  referenceFor: (key: string) => ReferenceCard | undefined
  onDone: (completedSecondaryKeys: string[], scored: boolean) => void
  onCancel?: () => void
  /** What pressing through the prompt does next. */
  confirmLabel: string
  /**
   * The battle round these points belong to. Not always the one being played: a turn
   * that has already ended owes its points to the round that turn was in.
   */
  round: number
  undoable: number | null
  undoableDraw: boolean
}

/** How many times each payout on a card was taken. Zero throughout is "did not score". */
type Answers = Record<string, number[]>

const CATEGORIES = ['primary', 'secondary'] as const

/**
 * What each card asks, at the moment it asks it.
 *
 * A card states its conditions and what meeting each one pays, and the player answers
 * for the board. Which of those answers can stand together is the card's to say: it
 * groups the payouts that are tiers of one thing, and only the better tier scores.
 * Everything it leaves ungrouped a card can pay at the same time.
 */
export function ScoringDialog({
  side,
  due,
  moment,
  confirmLabel,
  pending,
  send,
  referenceFor,
  onDone,
  onCancel,
  round,
  undoable,
  undoableDraw,
}: Props) {
  const [answers, setAnswers] = useState<Answers>({})
  const undo = useUndoLatest({ undoable, undoableDraw, send })
  const answerFor = (card: DueCard) => answers[card.key] ?? card.awards.map(() => 0)
  const claimedFor = (card: DueCard) => card.awards.reduce((total, award, at) => total + awardTotal(award, answerFor(card)[at] ?? 0), 0)

  // Every ceiling is the one this side's own mission states, never the viewer's, and
  // it belongs to the mission rather than to a card: two secondary cards due at once
  // draw from the one shared pool, the same way the rules book counts it. Worked out
  // once here, because every number below has to mean the same ceiling.
  const roundSoFar = side.rounds[round - 1] ?? { primary: 0, secondary: 0 }
  const room = {
    primary: capRoom(
      { round: side.mission?.roundCap ?? null, game: side.mission?.gameCap ?? null },
      { round: roundSoFar.primary, game: side.primary },
    ),
    secondary: capRoom(
      { round: side.mission?.secondaryRoundCap ?? null, game: side.mission?.secondaryGameCap ?? null },
      { round: roundSoFar.secondary, game: side.secondary },
    ),
  }

  // One calculation behind both what this shows and what it sends: a card the board
  // truthfully paid is still claimed in full, and the excess simply does not add up.
  // A fixed card also has a ceiling of its own, counted against what that one card has
  // already banked rather than against the side's pool.
  const cardCap = side.secondaryMode === 'fixed' ? (side.mission?.fixedSecondaryCap ?? null) : null
  const cardRoom = (card: DueCard) =>
    cardCap === null || card.category !== 'secondary'
      ? Infinity
      : Math.max(0, cardCap - (side.secondaries.find((held) => held.key === card.key)?.points ?? 0))
  const settled = settleAgainstCaps(
    due.map((card) => ({ card, claimed: claimedFor(card) })),
    { primary: room.primary?.room ?? Infinity, secondary: room.secondary?.room ?? Infinity },
    cardRoom,
  )
  const settledFor = (card: DueCard) => settled.find((entry) => entry.card.key === card.key) ?? { claimed: 0, scoring: 0 }
  const total = settled.reduce((sum, entry) => sum + entry.scoring, 0)

  // Only the categories this prompt can actually pay into, so a round cap is stated
  // where it applies and nowhere else.
  const asking = CATEGORIES.filter((category) => due.some((card) => card.category === category))

  // Where the category stands against whichever ceiling is the one actually refusing
  // more, because a player who can only bank 11 of the 13 the board paid should know
  // that while choosing. It counts what is pressed here, so it fills as they press and
  // stops at the number that stops them.
  const allowances = asking.flatMap((category) => {
    const limit = room[category]
    if (!limit) return []
    const banked = limit.scope === 'round' ? scoredThisRound(roundSoFar, category) : category === 'primary' ? side.primary : side.secondary
    const scoring = settled.filter((entry) => entry.card.category === category).reduce((sum, entry) => sum + entry.scoring, 0)
    return [
      {
        label: category === 'primary' ? 'Primary mission' : 'Secondary missions',
        standing: banked + scoring,
        cap: limit.cap,
        when: limit.scope === 'round' ? 'this round' : 'this battle',
      },
    ]
  })

  // Said once for the category that is full, rather than under every payout it refuses.
  const capNotes = asking.flatMap((category) => {
    const limit = room[category]
    const over = settled.filter((entry) => entry.card.category === category).reduce((sum, entry) => sum + entry.claimed - entry.scoring, 0)
    if (!limit || !over) return []
    const label = category === 'primary' ? 'primary mission' : 'secondary missions'
    const whose = limit.scope === 'round' ? 'This round’s' : 'The battle’s'
    return [`${whose} ${label} cap is ${limit.cap} VP, and ${limit.room} VP of it is left — the other ${over} VP does not score.`]
  })

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
    const finished: string[] = []
    const scores = settled.reduce<Extract<Command, { kind: 'score-settlement' }>['scores']>((settlement, { card, scoring }) => {
      if (!scoring) return settlement
      const achieved = finishesOnScore(card.category, side.secondaryMode, scoring)
      if (achieved) finished.push(card.key)
      settlement.push(
        card.category === 'primary'
          ? { category: 'primary', delta: scoring }
          : { category: 'secondary', key: card.key, delta: scoring, status: achieved ? 'achieved' : undefined },
      )
      return settlement
    }, [])
    if (scores.length) send({ kind: 'score-settlement', scores, round, playerId: side.captain.id })
    onDone(finished, scores.length > 0)
  }

  const colours = tint(side.index)

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && onCancel?.()}>
        {/*
         * Edged and titled in the side's own tint. Points go to one side and cannot be
         * taken back without an undo, so which side is being paid should be readable
         * before the sentence naming them is — a prompt that looked the same for both
         * left the name doing that work alone.
         */}
        <DialogContent className={`max-h-[85dvh] overflow-y-auto rounded-none border bg-panel text-bone sm:max-w-2xl ${colours.border}`}>
          <DialogHeader className="text-center">
            <p className="eyebrow text-discarded">Now</p>
            <DialogTitle className={`uppercase ${colours.text}`}>
              Scoring {moment} points · {sideName(side)}
            </DialogTitle>
            <DialogDescription className="text-dim">
              Recording points for {sideName(side)}. Press what the board actually paid on each card.
            </DialogDescription>
            {allowances.length ? (
              <p className="readout flex flex-wrap justify-center gap-x-3 gap-y-0.5 text-xs text-dim">
                {allowances.map((allowance) => (
                  <span key={allowance.label}>
                    {allowance.label} <span className="text-bone">{allowance.standing}</span>/{allowance.cap} {allowance.when}
                  </span>
                ))}
              </p>
            ) : null}
          </DialogHeader>

          <div className="space-y-3">
            {due.map((card) => {
              const taken = answerFor(card)
              const { claimed, scoring } = settledFor(card)
              const reference = referenceFor(card.key)
              return (
                <section key={card.key} data-due={card.key} className="border border-edge">
                  <div className="bg-sunken px-3 py-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <MissionName
                        name={card.name}
                        card={reference}
                        type={card.category === 'primary' ? 'Primary mission' : 'Secondary mission'}
                        mode={card.category === 'secondary' ? side.secondaryMode : undefined}
                        className={colours.text}
                      />
                      {/* Which card the ceiling actually took from, so unpicking a payout
                        elsewhere is a move the player can see is theirs to make. */}
                      <span className="readout shrink-0 text-xs text-dim">
                        {claimed > scoring
                          ? `+${scoring} of ${claimed} VP`
                          : claimed
                            ? `+${scoring} VP`
                            : `${scoredThisRound(roundSoFar, card.category)} VP so far`}
                      </span>
                    </div>
                  </div>
                  <div className="divide-y divide-edge">
                    {card.awards.map((award, at) => (
                      <AwardRow
                        key={`${award.vp}-${award.criteria ?? at}`}
                        card={card}
                        award={award}
                        join={payoutJoin(award, card.awards[at - 1])}
                        times={taken[at] ?? 0}
                        pending={pending}
                        tone={colours}
                        onAnswer={(times) => answer(card, at, times)}
                      />
                    ))}
                    <div className="flex items-center gap-3 px-3 py-2">
                      <span className="min-w-0 flex-1 text-sm text-dim">Did not score (or chose not to)</span>
                      <Chip
                        label="0 VP"
                        chosen={taken.every((times) => times === 0)}
                        pending={pending}
                        tone={colours}
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
            {/* The result of the calculation above it, so a reader who cannot watch the
              number move is told when a cap has quietly taken a piece of it. */}
            <output className="mr-auto block space-y-1">
              <p className="readout text-sm text-dim">
                Scoring <span className="font-bold text-bone">{total}</span> VP
              </p>
              {capNotes.map((note) => (
                <p key={note} className="max-w-prose text-[0.625rem] text-discarded">
                  {note}
                </p>
              ))}
            </output>
            <UndoLatestButton disabled={pending || undoable === null} onClick={undo.request} />
            {onCancel ? (
              <Button variant="outline" disabled={pending} onClick={onCancel}>
                Go back
              </Button>
            ) : null}
            <Button className={colours.fill} disabled={pending} onClick={confirm}>
              {confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <UndoLatestConfirmation pending={pending} control={undo} />
    </>
  )
}

/** One condition, and what meeting it pays. A counted one carries how many times. */
function AwardRow({
  card,
  award,
  join,
  times,
  pending,
  tone,
  onAnswer,
}: {
  card: DueCard
  award: MissionAward
  /** Whether this replaces the payout above or can score alongside it. */
  join: 'or' | 'plus' | null
  times: number
  pending: boolean
  /** The side these points go to, so every mark in the prompt names the same one. */
  tone: Tone
  onAnswer: (times: number) => void
}) {
  const limit = awardLimit(award)
  const label = conditionLabel(award) ?? payoutLabel(award, card.awards)

  return (
    <div className="flex items-center gap-3 px-3 py-2">
      {join ? (
        <span
          className="chip shrink-0 border-edge-strong px-1 text-faint"
          aria-label={join === 'or' ? 'Alternative objective' : 'Additional objective'}
        >
          {join}
        </span>
      ) : null}
      <span className="min-w-0 flex-1 text-sm">
        {/* The pack's own sentence, so the keywords it marks up read as keywords here too. */}
        <RuleText text={label} className="mt-0 space-y-1 text-sm text-bone" />
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
          <span className={`chip shrink-0 ${times > 0 ? tone.mark : 'border-edge-strong'}`}>{awardTotal(award, times)} VP</span>
        </>
      ) : (
        <Chip
          label={`${award.vp} VP`}
          chosen={times > 0}
          pending={pending}
          ariaLabel={`${card.name} plus ${award.vp}`}
          tone={tone}
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
  tone,
  onPress,
}: {
  label: string
  chosen: boolean
  pending: boolean
  disabled?: boolean
  ariaLabel: string
  tone: Tone
  onPress: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={chosen}
      aria-label={ariaLabel}
      disabled={pending || disabled}
      onClick={onPress}
      className={`chip shrink-0 px-2 py-1 ${chosen ? tone.mark : `border-edge-strong ${tone.hint}`}`}
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
  rounds: number,
  side: Side,
  awardsFor: (key: string, mode?: string) => MissionAward[],
  hand: readonly string[],
): DueCard[] {
  return cardsDueFromTheirTurn(round, rounds, playable(side, awardsFor), hand)
}

/** A side's primary and whatever is still live in its hand, with the payouts each carries. */
function playable(side: Side, awardsFor: (key: string, mode?: string) => MissionAward[]) {
  return [
    ...(side.primaryCard
      ? [{ ...side.primaryCard, category: 'primary' as const, awards: side.primaryCard.awards ?? awardsFor(side.primaryCard.key) }]
      : []),
    ...side.secondaries
      .filter((secondary) => secondary.status === 'active')
      .map((secondary) => ({
        key: secondary.key,
        name: secondary.name,
        category: 'secondary' as const,
        awards: (secondary.awards ?? awardsFor(secondary.key, side.secondaryMode)).filter((award) =>
          appliesInMode(award, side.secondaryMode),
        ),
      })),
  ]
}
