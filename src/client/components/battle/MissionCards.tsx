import { type ComponentProps, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import type { Command } from '../../../core/battle'
import type { BattleView } from '../../../core/battleView'
import type { Side } from '../../sides'
import { MissionActions } from '../MissionActions'
import { MissionCardReference } from '../MissionCardReference'
import { CARD, CARD_NAME, HEADING } from './tints'

import type { MissionAction } from '../../../server/missionActions'
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

/**
 * The cards in play, and what they have paid so far.
 *
 * Nothing here scores. A card pays at the moment its own text names, so the ask
 * arrives with the phase or turn that ends rather than sitting on screen all game
 * where it could be pressed at a moment the card does not allow.
 */
export function PrimaryMission({ side, referenceFor, guides }: Props) {
  if (!side.primaryCard) return null
  return (
    <section className="space-y-1.5">
      <Total label="Primary mission" scored={side.primary} cap={guides.primary} stat="primary" />
      <div className={CARD}>
        <MissionName name={side.primaryCard.name} card={referenceFor(side.primaryCard.key)} type="Primary mission" />
      </div>
    </section>
  )
}

export function SecondaryMissions({ side, actionable, pending, send, referenceFor, guides }: Props) {
  const [showResolved, setShowResolved] = useState(false)
  // A tactical deck deals its own cards, so naming one would be choosing what you were dealt.
  const choosingSecret =
    actionable && side.secondaryMode === 'fixed' && !side.secondaries.some((card) => card.secret) && side.remainingSecondaries.length > 0
  // A card put back into the deck was never really held, so it does not belong in this list at all.
  const drawn = side.secondaries.filter((secondary) => secondary.status !== 'returned')
  const resolved = drawn.filter((secondary) => secondary.status !== 'active')
  const visible = showResolved ? drawn : drawn.filter((secondary) => secondary.status === 'active')
  return (
    <section className="space-y-1.5">
      <Total label="Secondary missions" scored={side.secondary} cap={guides.secondary} stat="secondary" />
      {drawn.length ? null : <p className="text-xs text-dim">No cards in hand.</p>}
      {visible.map((secondary) => (
        <div key={secondary.key} data-secondary={secondary.key} className={`${CARD} space-y-1.5`}>
          <div className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1">
              <MissionName name={secondary.name} card={referenceFor(secondary.key)} type="Secondary mission" mode={side.secondaryMode} />
              <span className="mt-0.5 flex flex-wrap gap-1.5 text-[0.625rem] font-semibold uppercase">
                {secondary.secret ? <span className="text-discarded">{secondary.revealed ? 'revealed' : 'secret'}</span> : null}
                {secondary.status === 'active' ? null : (
                  <span className={secondary.status === 'achieved' ? 'text-achieved' : 'text-discarded'}>{secondary.status}</span>
                )}
              </span>
            </span>
            <span className="readout shrink-0 font-bold">{secondary.points}</span>
          </div>
          {actionable && secondary.secret && !secondary.revealed ? (
            <Button
              variant="ghost"
              size="xs"
              className="text-azure"
              onClick={() => send({ kind: 'reveal-secret', playerId: side.captain.id })}
            >
              Reveal
            </Button>
          ) : null}
        </div>
      ))}
      {resolved.length ? (
        <Button variant="ghost" size="xs" className="text-azure" onClick={() => setShowResolved((shown) => !shown)}>
          {showResolved ? 'Hide resolved missions' : `Show ${resolved.length} resolved ${resolved.length === 1 ? 'mission' : 'missions'}`}
        </Button>
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="xs" disabled={pending} />}>Select secret mission</DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto rounded-none border border-edge bg-panel text-bone sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-discarded uppercase">Select a secret mission</DialogTitle>
          <DialogDescription className="text-dim">
            Held face down until you reveal it. Your opponent sees only that you hold one.
          </DialogDescription>
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
      </DialogContent>
    </Dialog>
  )
}

function Total({ label, scored, cap, stat }: { label: string; scored: number; cap: number; stat: string }) {
  return (
    <p className="flex items-baseline justify-between gap-2">
      <span className={HEADING}>{label}</span>
      <span className="readout text-xs text-dim">
        <span data-stat={stat} className="text-bone">
          {scored}
        </span>
        /{cap}
      </span>
    </p>
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
    <Dialog>
      <DialogTrigger render={trigger} />
      <MissionDetailsContent details={{ name, card, type, mode }} />
    </Dialog>
  )
}

export function MissionDetailsDialog({ details, onOpenChange }: { details: MissionDetails; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <MissionDetailsContent details={details} />
    </Dialog>
  )
}

function MissionDetailsContent({ details }: { details: MissionDetails }) {
  return (
    <DialogContent className="max-h-[85dvh] overflow-y-auto border border-edge bg-panel text-bone sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle className="uppercase">{details.name}</DialogTitle>
        <DialogDescription className="text-dim">What this mission asks you to do and when it scores.</DialogDescription>
      </DialogHeader>
      <MissionCardReference card={details.card} type={details.type} mode={details.mode} />
      <MissionActions actions={details.card.actions} />
    </DialogContent>
  )
}
