import { type ComponentProps, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { DialogBody, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../../components/Dialog'
import { BattleDialogContent, BattlePromptDialog } from './BattlePromptDialog'
import type { Command } from '../../../core/battle'
import type { BattleView } from '../../../core/battleView'
import type { Side } from '../../sides'
import { MissionCardReference } from '../../components/MissionCardReference'
import { CARD, CARD_NAME, CARD_NAME_LINK } from './battleTints'
import { DispositionChip, useDispositionNames } from './setup/chrome'
import { MissionSelectionRecords } from './MissionSelectionRecord'
import { MissionSelectionDialog } from './MissionSelectionDialog'
import { MARKER_PLACEMENT_COPY } from './markerPlacementCopy'
import { isMarkerPlacement, type MarkerPlacementKind, type MissionSelectionKind } from '../../../core/missionSelections'

import type { MissionAction } from '../../../contracts/missions'
import { countLabel } from '../../text'

/** A card, and the action it names, because the reader prints both. */
export type ReferenceCard = ComponentProps<typeof MissionCardReference>['card'] & { actions: MissionAction[] }
export type MissionDetails = { name: string; card: ReferenceCard; type: string; mode?: string }

/** What a stratagem actually says, as the detachment page prints it. */
export type StratagemText = {
  type: string | null
  description: string | null
  keywordRules: { name: string; description: string }[]
  /** The rules version it is written for, whose release summarizes a card the build has only in its app. */
  catalogueId?: string
}

type Props = {
  view: BattleView
  side: Side
  pending: boolean
  send: (command: Command) => void
  referenceFor: (key: string) => ReferenceCard | undefined
  guides: { primary: number; secondary: number }
  /** Names and totals only, for a side the reader follows rather than plays; each card still opens in full. */
  compact?: boolean
}

const HEADING = 'text-base font-semibold text-bone'

export function PrimaryMission({ view, side, pending, send, referenceFor, guides, compact = false }: Props) {
  const nameDisposition = useDispositionNames()
  if (!side.primaryCard) return null
  return (
    <section className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={HEADING}>Primary mission</p>
        <DispositionChip disposition={nameDisposition(side.disposition)} />
      </div>
      <div className="space-y-2.5 border-y border-edge py-3">
        <div className="flex items-baseline justify-between gap-3">
          <MissionName
            name={side.primaryCard.name}
            card={referenceFor(side.primaryCard.key)}
            type="Primary mission"
            className="text-base font-semibold normal-case"
          />
          <Total total={side.primary} cap={guides.primary} stat="primary" small />
        </div>
        <MissionSelectionRecords records={side.captain.missionSelections ?? []} cardKey={side.primaryCard.key} />
        <MissionChoices
          view={view}
          side={side}
          cardKey={side.primaryCard.key}
          pending={pending}
          send={send}
          reference={referenceFor(side.primaryCard.key)}
        />
        {compact ? null : <RoundScores view={view} scores={side.rounds.map((round) => round.primary)} />}
      </div>
    </section>
  )
}

const CHOICE_LABELS: Record<Exclude<MissionSelectionKind, MarkerPlacementKind>, string> = {
  punishment: 'Record condemned units',
  guards: 'Record guards',
  'tempting-target': 'Record tempting target',
  beacon: 'Record Beacon',
  'locate-and-deny': 'Record operation markers',
  'sensor-sweep': 'Record Sensor Sweep',
  consecrate: 'Record consecrations',
  surveil: 'Record removed markers',
}
const choiceLabel = (kind: MissionSelectionKind) => (isMarkerPlacement(kind) ? MARKER_PLACEMENT_COPY[kind].label : CHOICE_LABELS[kind])

function MissionChoices({
  view,
  side,
  cardKey,
  pending,
  send,
  reference,
}: Pick<Props, 'view' | 'side' | 'pending' | 'send'> & { cardKey: string; reference?: ReferenceCard }) {
  const [openKind, setOpenKind] = useState<MissionSelectionKind | null>(null)
  const choices =
    view.missionChoices?.filter(
      (candidate) => candidate.playerId === side.captain.id && candidate.cardKey === cardKey && candidate.canChoose,
    ) ?? []
  const opened = choices.find((choice) => choice.kind === openKind)
  if (!choices.length) return null
  return (
    <>
      {choices.map((choice) => (
        <Button
          key={choice.kind}
          size="xs"
          variant="ghost"
          className="text-parchment"
          disabled={pending}
          onClick={() => setOpenKind(choice.kind)}
        >
          {choiceLabel(choice.kind)}
        </Button>
      ))}
      {opened ? (
        <MissionSelectionDialog
          key={`${opened.kind}:${opened.occurrence}`}
          view={view}
          choice={opened}
          pending={pending}
          send={send}
          reference={reference}
          onClose={() => setOpenKind(null)}
          onRecorded={() => setOpenKind(null)}
        />
      ) : null}
    </>
  )
}

export function SecondaryMissions({ view, side, pending, send, referenceFor, guides, compact = false }: Props) {
  const [showResolved, setShowResolved] = useState<boolean | null>(null)
  const showingResolved = showResolved ?? view.status === 'finished'
  // A card put back into the deck was never really held, so it does not belong in this list at all.
  const drawn = side.secondaries.filter((secondary) => secondary.status !== 'returned')
  const resolved = drawn.filter((secondary) => secondary.status !== 'active')
  const visible = showingResolved ? drawn : drawn.filter((secondary) => secondary.status === 'active')
  return (
    <section className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className={HEADING}>
          Secondary missions
          {/* Every card in the hand is drawn the same way, so the mode is said once rather than on each card. */}
          {side.secondaryMode ? (
            <span className="font-normal text-dim"> · {side.secondaryMode === 'fixed' ? 'Fixed' : 'Tactical'}</span>
          ) : null}
        </p>
        <Total total={side.secondary} cap={guides.secondary} stat="secondary" small />
      </div>
      {visible.length ? null : <p className="text-xs text-dim">No active missions.</p>}
      {/* A discarded card stays in the list, struck through, so the hand reads as it was played. */}
      <ul className={cn('divide-y divide-edge border-y border-edge', visible.length ? '' : 'hidden')}>
        {visible.map((secondary) => {
          const scoredRounds = secondary.rounds.flatMap((points, index) => (points !== 0 ? [{ round: index + 1, points }] : []))
          const active = secondary.status === 'active'
          const tacticalActive = active && side.secondaryMode === 'tactical'
          const discarded = secondary.status === 'discarded'
          return (
            <li
              key={secondary.key}
              data-secondary={secondary.key}
              data-gate={active ? 'current' : discarded ? 'cut' : undefined}
              className={cn('space-y-1.5 py-2.5', discarded && 'opacity-70')}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <MissionName
                    name={secondary.name}
                    card={referenceFor(secondary.key)}
                    type="Secondary mission"
                    mode={side.secondaryMode}
                    className={cn(
                      'text-base font-semibold normal-case',
                      discarded && 'animate-strike text-dim line-through decoration-discarded decoration-2',
                    )}
                  />
                  {!active || (tacticalActive && scoredRounds.length) ? (
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-3xs">
                      {active ? null : (
                        <span className={`first-letter:uppercase ${secondary.status === 'achieved' ? 'text-achieved' : 'text-discarded'}`}>
                          {secondary.status}
                        </span>
                      )}
                      {!active && scoredRounds.length ? (
                        <span aria-hidden className="text-faint">
                          ·
                        </span>
                      ) : null}
                      {scoredRounds.length ? <ScoredRounds rounds={scoredRounds} /> : null}
                    </div>
                  ) : null}
                </div>
                <span
                  className={cn(
                    'figure readout shrink-0 text-2xl leading-none',
                    secondary.status === 'achieved' ? 'text-achieved' : discarded ? 'text-faint' : 'text-bone',
                  )}
                >
                  {secondary.points}
                  {active && side.secondaryMode === 'fixed' && side.mission?.fixedSecondaryCap != null ? (
                    <span className="text-sm text-faint">/{side.mission.fixedSecondaryCap}</span>
                  ) : null}
                  <span className="sr-only"> VP</span>
                </span>
              </div>
              <MissionSelectionRecords records={side.captain.missionSelections ?? []} cardKey={secondary.key} />
              {active && secondary.beaconLost ? (
                <p className="text-xs text-discarded">Beacon unit destroyed. Discard this card at the end of your turn.</p>
              ) : null}
              <MissionChoices
                view={view}
                side={side}
                cardKey={secondary.key}
                pending={pending}
                send={send}
                reference={referenceFor(secondary.key)}
              />
              {active && !tacticalActive && !compact ? <RoundScores view={view} scores={secondary.rounds} compact labels={false} /> : null}
            </li>
          )
        })}
      </ul>
      {resolved.length ? (
        <Button variant="ghost" size="xs" className="text-parchment" onClick={() => setShowResolved(!showingResolved)}>
          {showingResolved ? 'Hide resolved missions' : `Show ${countLabel(resolved.length, 'resolved mission')}`}
        </Button>
      ) : null}
      {side.secondaryMode === 'tactical' && side.remainingSecondaries.length > 0 ? (
        <BattlePromptDialog minimizedLabel="Remaining secondary missions">
          <DialogTrigger render={<Button variant="ghost" size="xs" className="text-parchment" />}>
            Remaining deck · {side.remainingSecondaries.length}
          </DialogTrigger>
          <BattleDialogContent>
            <DialogHeader>
              <DialogTitle>Remaining secondary missions</DialogTitle>
              <DialogDescription>Cards still available to draw.</DialogDescription>
            </DialogHeader>
            <DialogBody className="gap-1.5">
              {side.remainingSecondaries.map((card) => (
                <div key={card.key} className={CARD}>
                  <MissionName name={card.name} card={referenceFor(card.key)} type="Secondary mission" mode={side.secondaryMode} />
                </div>
              ))}
            </DialogBody>
          </BattleDialogContent>
        </BattlePromptDialog>
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

/** A running total against the ceiling it plays to, or with its unit when nothing caps it. */
function Total({ total, cap, stat, small = false }: { total: number; cap?: number | null; stat: string; small?: boolean }) {
  return (
    <span className={cn('figure readout shrink-0 leading-none text-bone', small ? 'text-lg' : 'text-2xl')}>
      <span data-stat={stat}>{total}</span>
      <span className={cn('text-faint', small ? 'text-xs' : 'text-sm')}>{cap == null ? ' VP' : `/${cap}`}</span>
    </span>
  )
}

/** Rounds played on a solid underline, the one being played on a heavy green one over a raised ground, the rest on a hairline. */
function RoundScores({
  view,
  scores,
  compact = false,
  labels = true,
}: {
  view: Pick<BattleView, 'round' | 'rounds' | 'status'>
  scores: readonly number[]
  compact?: boolean
  labels?: boolean
}) {
  return (
    <ol className="flex gap-1.5" aria-label="Victory points by battle round">
      {Array.from({ length: view.rounds }, (_, index) => {
        const round = index + 1
        const points = scores[index] ?? 0
        const played = round <= view.round || points !== 0
        const current = round === view.round && view.status === 'playing'
        return (
          <li
            key={round}
            className={cn(
              'min-w-0 flex-1 text-center',
              compact ? 'pb-0.5' : 'pt-0.5 pb-1',
              current
                ? 'border-b-[3px] border-parchment bg-raised text-bone'
                : played
                  ? 'border-b-2 border-runner-hi text-bone'
                  : 'border-b border-runner text-faint',
            )}
            aria-label={`Round ${round}: ${played ? `${points} VP` : 'not played'}`}
            aria-current={current ? 'step' : undefined}
          >
            <span aria-hidden="true" className={cn('figure readout block leading-tight', compact ? 'text-sm' : 'text-lg')}>
              {played ? points : '–'}
            </span>
            {labels ? (
              <span aria-hidden="true" className={cn('block text-3xs', current ? 'font-semibold text-parchment' : 'text-faint')}>
                R{round}
              </span>
            ) : null}
          </li>
        )
      })}
    </ol>
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
  if (!card) return <span className={cn(CARD_NAME, className)}>{name}</span>
  const trigger = (
    <button
      type="button"
      aria-label={`Read ${name}`}
      className={cn(CARD_NAME, CARD_NAME_LINK, 'text-left', className)}
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
    <BattleDialogContent size="md">
      <DialogHeader>
        <DialogTitle>{details.name}</DialogTitle>
        <DialogDescription>What this mission asks you to do and when it scores.</DialogDescription>
      </DialogHeader>
      <DialogBody>
        <MissionCardReference card={details.card} type={details.type} mode={details.mode} />
      </DialogBody>
    </BattleDialogContent>
  )
}
