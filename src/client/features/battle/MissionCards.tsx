import { type ComponentProps, useState } from 'react'
import { Button } from '@/components/ui/button'
import { DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { BattleDialogContent, BattlePromptDialog } from './BattlePromptDialog'
import type { Command } from '../../../core/battle'
import type { BattleView } from '../../../core/battleView'
import type { Side } from '../../sides'
import { MissionActions } from '../../components/MissionActions'
import { MissionCardReference } from '../../components/MissionCardReference'
import { CARD, CARD_NAME } from './battleTints'

import type { MissionAction } from '../../../contracts/missions'
import type { MissionAward as Award } from '../../missionText'

export type { MissionAward as Award } from '../../missionText'

/** A card, and the action it names, because the reader prints both. */
export type ReferenceCard = ComponentProps<typeof MissionCardReference>['card'] & { actions: MissionAction[] }
export type MissionDetails = { name: string; card: ReferenceCard; type: string; mode?: string }

/** What a stratagem actually says, as the detachment page prints it. */
export type StratagemText = { type: string | null; description: string | null; keywordRules: { name: string; description: string }[] }

type Props = {
  view: BattleView
  side: Side
  actionable: boolean
  pending: boolean
  send: (command: Command) => void
  awardsFor: (key: string, mode?: string) => Award[]
  referenceFor: (key: string) => ReferenceCard | undefined
  guides: { primary: number; secondary: number }
}

export function PrimaryMission({ view, side, referenceFor, guides }: Props) {
  if (!side.primaryCard) return null
  return (
    <section className="space-y-1.5">
      <p className="eyebrow">Primary mission</p>
      <div className={`${CARD} space-y-2`}>
        <MissionName name={side.primaryCard.name} card={referenceFor(side.primaryCard.key)} type="Primary mission" />
        <RoundScores
          view={view}
          scores={side.rounds.map((round) => round.primary)}
          total={side.primary}
          cap={guides.primary}
          stat="primary"
        />
      </div>
    </section>
  )
}

export function SecondaryMissions({ view, side, actionable, pending, send, referenceFor, guides }: Props) {
  const [showResolved, setShowResolved] = useState<boolean | null>(null)
  const showingResolved = showResolved ?? view.status === 'finished'
  // A tactical deck deals its own cards, so naming one would be choosing what you were dealt.
  const choosingSecret =
    actionable && side.secondaryMode === 'fixed' && !side.secondaries.some((card) => card.secret) && side.remainingSecondaries.length > 0
  // A card put back into the deck was never really held, so it does not belong in this list at all.
  const drawn = side.secondaries.filter((secondary) => secondary.status !== 'returned')
  const resolved = drawn.filter((secondary) => secondary.status !== 'active')
  const visible = showingResolved ? drawn : drawn.filter((secondary) => secondary.status === 'active')
  return (
    <section className="space-y-1.5">
      <p className="eyebrow">Secondary missions</p>
      <div className="border border-transparent px-2.5">
        <RoundScores
          view={view}
          scores={side.rounds.map((round) => round.secondary)}
          total={side.secondary}
          cap={guides.secondary}
          stat="secondary"
        />
      </div>
      {visible.length ? null : <p className="text-xs text-dim">No active missions.</p>}
      {visible.map((secondary) => {
        const scoredRounds = secondary.rounds.flatMap((points, index) => (points !== 0 ? [{ round: index + 1, points }] : []))
        const tacticalActive = secondary.status === 'active' && side.secondaryMode === 'tactical'
        return (
          <div key={secondary.key} data-secondary={secondary.key} className={`${CARD} space-y-1.5`}>
            <div className="flex items-baseline justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                <MissionName name={secondary.name} card={referenceFor(secondary.key)} type="Secondary mission" mode={side.secondaryMode} />
                {secondary.secret ? (
                  <span className="text-3xs font-semibold text-discarded uppercase">{secondary.revealed ? 'revealed' : 'secret'}</span>
                ) : null}
              </div>
              {tacticalActive ? (
                <span className="readout shrink-0 text-sm font-bold text-dim">
                  {secondary.points} <span className="text-3xs font-normal">VP</span>
                </span>
              ) : null}
            </div>
            {tacticalActive ? (
              scoredRounds.length ? (
                <ScoredRounds rounds={scoredRounds} />
              ) : null
            ) : secondary.status === 'active' ? (
              <RoundScores
                view={view}
                scores={secondary.rounds}
                total={secondary.points}
                cap={side.secondaryMode === 'fixed' ? side.mission?.fixedSecondaryCap : null}
                labels={false}
              />
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 text-3xs">
                  <span className={`font-semibold uppercase ${secondary.status === 'achieved' ? 'text-achieved' : 'text-discarded'}`}>
                    {secondary.status}
                  </span>
                  <ScoredRounds rounds={scoredRounds} />
                </div>
                <span className={`readout text-sm font-bold ${secondary.status === 'achieved' ? 'text-achieved' : 'text-dim'}`}>
                  {secondary.points} <span className="text-3xs font-normal">VP</span>
                </span>
              </div>
            )}
            {actionable && secondary.secret && !secondary.revealed ? (
              <Button
                variant="ghost"
                size="xs"
                className="text-azure"
                disabled={pending}
                onClick={() => send({ kind: 'reveal-secret', playerId: side.captain.id })}
              >
                Reveal
              </Button>
            ) : null}
          </div>
        )
      })}
      {resolved.length ? (
        <Button variant="ghost" size="xs" className="text-azure" onClick={() => setShowResolved(!showingResolved)}>
          {showingResolved
            ? 'Hide resolved missions'
            : `Show ${resolved.length} resolved ${resolved.length === 1 ? 'mission' : 'missions'}`}
        </Button>
      ) : null}
      {side.secondaryMode === 'tactical' && side.remainingSecondaries.length > 0 ? (
        <BattlePromptDialog minimizedLabel="Remaining secondary missions">
          <DialogTrigger
            render={
              <Button
                variant="ghost"
                size="xs"
                className="text-azure"
                aria-label={`View remaining secondary missions (${side.remainingSecondaries.length})`}
              />
            }
          >
            Remaining deck · {side.remainingSecondaries.length}
          </DialogTrigger>
          <BattleDialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Remaining secondary missions</DialogTitle>
              <DialogDescription>Cards still available to draw.</DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              {side.remainingSecondaries.map((card) => (
                <div key={card.key} className={CARD}>
                  <MissionName name={card.name} card={referenceFor(card.key)} type="Secondary mission" mode={side.secondaryMode} />
                </div>
              ))}
            </div>
          </BattleDialogContent>
        </BattlePromptDialog>
      ) : null}
      {choosingSecret ? (
        <SecretMissionDialog
          cards={side.remainingSecondaries}
          pending={pending}
          onPick={(card) => send({ kind: 'select-secret', secondary: card, playerId: side.captain.id })}
        />
      ) : null}
    </section>
  )
}

function ScoredRounds({ rounds }: { rounds: { round: number; points: number }[] }) {
  return (
    <ol className="flex flex-wrap gap-2 text-3xs text-dim" aria-label="Scored rounds">
      {rounds.map(({ round, points }) => (
        <li key={round} aria-label={`Round ${round}: ${points} VP`}>
          {rounds.length === 1 ? `R${round}` : `R${round} · ${points} VP`}
        </li>
      ))}
    </ol>
  )
}

/** Fixed play chooses its own hand, so it also chooses which of those is held face down. */
function SecretMissionDialog({
  cards,
  pending,
  onPick,
}: {
  cards: readonly { key: string; name: string }[]
  pending: boolean
  onPick: (card: { key: string; name: string }) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <BattlePromptDialog open={open} onOpenChange={setOpen} minimizedLabel="Select secret mission">
      <DialogTrigger render={<Button variant="outline" size="xs" disabled={pending} />}>Select secret mission</DialogTrigger>
      <BattleDialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-discarded">Select a secret mission</DialogTitle>
          <DialogDescription>Held face down until you reveal it. Your opponent sees only that you hold one.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1 sm:grid-cols-2">
          {cards.map((card) => (
            <Button
              key={card.key}
              variant="outline"
              size="sm"
              className="h-auto justify-start py-1.5 text-left whitespace-normal"
              disabled={pending}
              onClick={() => {
                onPick({ key: card.key, name: card.name })
                setOpen(false)
              }}
            >
              {card.name}
            </Button>
          ))}
        </div>
      </BattleDialogContent>
    </BattlePromptDialog>
  )
}

function RoundScores({
  view,
  scores,
  total,
  cap,
  stat,
  labels = true,
}: {
  view: Pick<BattleView, 'round' | 'rounds' | 'status'>
  scores: readonly number[]
  total: number
  cap?: number | null
  stat?: string
  labels?: boolean
}) {
  return (
    <div className="flex items-end gap-2">
      <ol className="flex min-w-0 flex-1 gap-1" aria-label="Victory points by battle round">
        {Array.from({ length: view.rounds }, (_, index) => {
          const round = index + 1
          const points = scores[index] ?? 0
          const played = round <= view.round || points !== 0
          const current = round === view.round && view.status === 'playing'
          return (
            <li
              key={round}
              className="min-w-0 flex-1 text-center"
              aria-label={`Round ${round}: ${played ? `${points} VP` : 'not played'}`}
              aria-current={current ? 'step' : undefined}
            >
              {labels ? (
                <span aria-hidden="true" className={`block text-3xs ${current ? 'font-semibold text-azure' : 'text-faint'}`}>
                  R{round}
                </span>
              ) : null}
              <span
                aria-hidden="true"
                className={`readout flex h-7 items-center justify-center border-b text-xs ${current ? 'rounded-t-sm border-azure bg-azure/10 font-bold text-bone' : played ? 'border-edge text-dim' : 'border-dashed border-edge/50 text-faint'}`}
              >
                {played ? points : '–'}
              </span>
            </li>
          )
        })}
      </ol>
      <span className="readout flex h-7 w-12 shrink-0 items-baseline justify-end gap-0.5 pt-1 text-xs text-dim">
        <span data-stat={stat} className="text-sm font-bold text-bone">
          {total}
        </span>
        {cap == null ? <span className="text-3xs">VP</span> : `/${cap}`}
      </span>
    </div>
  )
}

export function MissionName({
  name,
  card,
  type,
  mode,
  onRead,
  className = '',
}: {
  name: string
  card?: ReferenceCard
  type: string
  /** The side's secondary mode, so a card that pays two ways shows only the one in play. */
  mode?: string
  onRead?: (details: MissionDetails) => void
  /** A tint for the places where the card belongs to a named side rather than to the reader. */
  className?: string
}) {
  if (!card) return <span className={`${CARD_NAME} ${className}`}>{name}</span>
  const trigger = (
    <button
      type="button"
      aria-label={`Read ${name}`}
      className={`${CARD_NAME} text-left hover:underline ${className}`}
      onClick={onRead ? () => onRead({ name, card, type, mode }) : undefined}
    >
      {name}
    </button>
  )
  if (onRead) return trigger
  return (
    <BattlePromptDialog minimizedLabel={name} resumeLabel="Return to mission">
      <DialogTrigger render={trigger} />
      <MissionDetailsContent details={{ name, card, type, mode }} />
    </BattlePromptDialog>
  )
}

export function MissionDetailsDialog({ details, onOpenChange }: { details: MissionDetails; onOpenChange: (open: boolean) => void }) {
  return (
    <BattlePromptDialog open onOpenChange={onOpenChange} minimizedLabel={details.name} resumeLabel="Return to mission">
      <MissionDetailsContent details={details} />
    </BattlePromptDialog>
  )
}

function MissionDetailsContent({ details }: { details: MissionDetails }) {
  return (
    <BattleDialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{details.name}</DialogTitle>
        <DialogDescription>What this mission asks you to do and when it scores.</DialogDescription>
      </DialogHeader>
      <MissionCardReference card={details.card} type={details.type} mode={details.mode} />
      <MissionActions actions={details.card.actions} />
    </BattleDialogContent>
  )
}
