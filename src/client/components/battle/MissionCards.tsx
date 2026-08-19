import { type ComponentProps, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import type { BattleView, Command } from '../../../core/battle'
import type { Side } from '../../sides'
import { MissionCardReference } from '../MissionCardReference'
import { CARD, CARD_NAME, HEADING } from './tints'

export type Award = {
  vp: number
  per: string | null
  mode: string | null
  when: string | null
  trigger: { timing: string | null; phase: string | null; playerTurn: string | null; roundMin: number | null; roundMax: number | null }
}

export type ReferenceCard = ComponentProps<typeof MissionCardReference>['card']

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
  // A tactical deck deals its own cards, so naming one would be choosing what you were dealt.
  const choosingSecret =
    actionable && side.secondaryMode === 'fixed' && !side.secondaries.some((card) => card.secret) && side.remainingSecondaries.length > 0
  return (
    <section className="space-y-1.5">
      <Total label="Secondary missions" scored={side.secondary} cap={guides.secondary} stat="secondary" />
      {side.secondaries.length ? null : <p className="text-xs text-dim">No cards in hand.</p>}
      {side.secondaries.map((secondary) => (
        <div key={secondary.key} data-secondary={secondary.key} className={`${CARD} space-y-1.5`}>
          <div className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1">
              <MissionName name={secondary.name} card={referenceFor(secondary.key)} type="Secondary mission" />
              <span className="mt-0.5 flex flex-wrap gap-1.5 text-[0.625rem] font-semibold uppercase">
                {secondary.secret ? <span className="text-azure">{secondary.revealed ? 'revealed' : 'secret'}</span> : null}
                {secondary.status === 'active' ? null : (
                  <span className={secondary.status === 'achieved' ? 'text-achieved' : 'text-discarded'}>{secondary.status}</span>
                )}
              </span>
            </span>
            <span className="readout shrink-0 font-bold">{secondary.points}</span>
          </div>
          {actionable && secondary.status === 'active' ? (
            <div className="flex flex-wrap gap-1">
              <Button
                variant="ghost"
                size="xs"
                className="text-achieved"
                disabled={pending}
                onClick={() => send({ kind: 'set-secondary-status', key: secondary.key, status: 'achieved' })}
              >
                Achieve
              </Button>
              {secondary.secret && !secondary.revealed ? (
                <Button variant="ghost" size="xs" className="text-azure" disabled={pending} onClick={() => send({ kind: 'reveal-secret' })}>
                  Reveal
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ))}
      {choosingSecret ? (
        <SecretMissionDialog
          cards={side.remainingSecondaries}
          pending={pending}
          onPick={(card) => send({ kind: 'select-secret', secondary: card })}
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
          <DialogTitle className="uppercase">Select a secret mission</DialogTitle>
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

export function MissionName({ name, card, type }: { name: string; card?: ReferenceCard; type: string }) {
  if (!card) return <span className={CARD_NAME}>{name}</span>
  return (
    <Dialog>
      <DialogTrigger render={<button type="button" aria-label={`Read ${name}`} className={`${CARD_NAME} text-left hover:underline`} />}>
        {name}
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto border border-edge bg-panel text-bone sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="uppercase">{name}</DialogTitle>
          <DialogDescription className="text-dim">What this mission asks you to do and when it scores.</DialogDescription>
        </DialogHeader>
        <MissionCardReference card={card} type={type} />
      </DialogContent>
    </Dialog>
  )
}

export const awardTitle = (award: Award) =>
  [award.mode, award.when?.replaceAll('-', ' '), award.per ? `per ${award.per.replaceAll('-', ' ')}` : null].filter(Boolean).join(' · ') ||
  undefined
