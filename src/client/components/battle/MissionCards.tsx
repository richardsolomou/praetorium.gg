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
  trigger: { phase: string | null; playerTurn: string | null; roundMin: number | null; roundMax: number | null }
}

export type ReferenceCard = ComponentProps<typeof MissionCardReference>['card']

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

export function PrimaryMission({ view, side, actionable, pending, send, awardsFor, referenceFor, guides }: Props) {
  if (!side.primaryCard) return null
  return (
    <section className="space-y-1.5">
      <Total label="Primary mission" scored={side.primary} cap={guides.primary} stat="primary" />
      <div className={`${CARD} space-y-2`}>
        <MissionName name={side.primaryCard.name} card={referenceFor(side.primaryCard.key)} type="Primary mission" />
        {actionable ? (
          <AwardRow
            awards={awardsFor(side.primaryCard.key)}
            view={view}
            side={side}
            pending={pending}
            label={(award) => `Primary plus ${award.vp}${award.per ? ` per ${award.per.replaceAll('-', ' ')}` : ''}`}
            onScore={(delta) => send({ kind: 'score', category: 'primary', delta })}
          />
        ) : null}
      </div>
    </section>
  )
}

export function SecondaryMissions({ view, side, actionable, pending, send, awardsFor, referenceFor, guides }: Props) {
  const held = side.secondaries.filter((card) => card.status === 'active').length
  const drawing = actionable && side.secondaryMode === 'tactical' && held < 2
  return (
    <section className="space-y-1.5">
      <Total label="Secondary missions" scored={side.secondary} cap={guides.secondary} stat="secondary" />
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
                <span className="readout text-faint">{secondary.rounds.map((points, round) => `T${round + 1} ${points}`).join(' · ')}</span>
              </span>
            </span>
            <span className="readout shrink-0 font-bold">{secondary.points}</span>
          </div>
          {actionable && secondary.status === 'active' ? (
            <>
              <AwardRow
                awards={awardsFor(secondary.key, side.secondaryMode)}
                view={view}
                side={side}
                pending={pending}
                label={(award) => `${secondary.name} plus ${award.vp}${award.per ? ` per ${award.per.replaceAll('-', ' ')}` : ''}`}
                onScore={(delta) => send({ kind: 'score-secondary', key: secondary.key, delta })}
              />
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
                {side.secondaryMode === 'tactical' ? (
                  <Button
                    variant="ghost"
                    size="xs"
                    className="text-discarded"
                    disabled={pending}
                    onClick={() => send({ kind: 'set-secondary-status', key: secondary.key, status: 'discarded' })}
                  >
                    Discard
                  </Button>
                ) : null}
                {secondary.secret && !secondary.revealed ? (
                  <Button
                    variant="ghost"
                    size="xs"
                    className="text-azure"
                    disabled={pending}
                    onClick={() => send({ kind: 'reveal-secret' })}
                  >
                    Reveal
                  </Button>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      ))}
      {drawing ? <DrawMission side={side} pending={pending} send={send} /> : null}
      {actionable && !side.secondaries.some((card) => card.secret) ? (
        <PickCardDialog
          trigger="Select secret mission"
          title="Select a secret mission"
          description="Held face down until you reveal it. Your opponent sees only that you hold one."
          cards={side.remainingSecondaries}
          pending={pending}
          onPick={(card) => send({ kind: 'select-secret', secondary: card })}
        />
      ) : null}
    </section>
  )
}

/** A tactical hand is drawn from the deck as the battle runs, so the prompt stands open. */
function DrawMission({ side, pending, send }: { side: Side; pending: boolean; send: (command: Command) => void }) {
  return (
    <div className="space-y-2 rounded-sm border border-azure/40 bg-azure/5 px-2.5 py-2">
      <p className="flex items-baseline justify-between gap-2">
        <span className={HEADING}>{side.secondaries.length ? 'Draw a replacement' : 'Draw a mission'}</span>
        <span className="readout text-[0.625rem] text-dim">{side.remainingSecondaries.length} left</span>
      </p>
      <div className="flex flex-wrap gap-1">
        <Button
          variant="secondary"
          size="sm"
          disabled={pending || !side.remainingSecondaries.length}
          onClick={() => {
            const card = randomEntry(side.remainingSecondaries)
            if (card) send({ kind: 'draw-secondary', secondary: card })
          }}
        >
          Draw at random
        </Button>
        <PickCardDialog
          trigger="Choose a card"
          title="Draw a secondary mission"
          description="Every card still in the deck. Drawing one puts it in your hand for both devices."
          cards={side.remainingSecondaries}
          pending={pending}
          onPick={(card) => send({ kind: 'draw-secondary', secondary: card })}
        />
      </div>
    </div>
  )
}

/**
 * The deck runs to dozens of cards, so it opens over the page rather than inside the
 * panel it belongs to, and closes on the pick: the card is drawn and there is
 * nothing left to choose.
 */
function PickCardDialog({
  trigger,
  title,
  description,
  cards,
  pending,
  onPick,
}: {
  trigger: string
  title: string
  description: string
  cards: readonly { key: string; name: string }[]
  pending: boolean
  onPick: (card: { key: string; name: string }) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" disabled={pending || !cards.length} />}>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto rounded-none border border-edge bg-panel text-bone sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="uppercase">{title}</DialogTitle>
          <DialogDescription className="text-dim">{description}</DialogDescription>
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
    <p className="flex items-baseline justify-between gap-2 border-t border-edge pt-2.5">
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

function AwardRow({
  awards,
  view,
  side,
  pending,
  label,
  onScore,
}: {
  awards: Award[]
  view: BattleView
  side: Side
  pending: boolean
  label: (award: Award) => string
  onScore: (delta: number) => void
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {pick(awards).map((award) => {
        const why = blocked(award, view, side)
        return (
          <Button
            key={`${award.vp}-${award.per ?? ''}-${award.mode ?? ''}`}
            variant="outline"
            size="sm"
            className="w-auto px-2"
            disabled={pending || why !== null}
            title={why ? `Only ${why}` : awardTitle(award)}
            aria-label={label(award)}
            onClick={() => onScore(award.vp)}
          >
            +{award.vp}
            {award.per ? <span className="ml-0.5 text-[0.625rem] opacity-70">ea</span> : null}
          </Button>
        )
      })}
    </div>
  )
}

const ANY: Award['trigger'] = { phase: null, playerTurn: null, roundMin: null, roundMax: null }

/** When a card's payouts are not known, plain steps are better than no way to score. */
const FALLBACK_AWARDS: Award[] = [
  { vp: 1, per: null, mode: null, when: null, trigger: ANY },
  { vp: 5, per: null, mode: null, when: null, trigger: ANY },
]

const pick = (awards: Award[]) => (awards.length ? awards : FALLBACK_AWARDS)

/** Why this payout is not available right now, or null when it is. */
function blocked(award: Award, view: BattleView, side: Side): string | null {
  const trigger = award.trigger
  if (trigger.playerTurn === 'your-turn' && !side.isActive) return 'on your own turn'
  if (trigger.phase && trigger.phase !== view.phase) return `in the ${trigger.phase} phase`
  if (trigger.roundMin !== null && view.round < trigger.roundMin) return `from round ${trigger.roundMin}`
  if (trigger.roundMax !== null && view.round > trigger.roundMax) return `up to round ${trigger.roundMax}`
  return null
}

const awardTitle = (award: Award) =>
  [award.mode, award.when?.replaceAll('-', ' '), award.per ? `per ${award.per.replaceAll('-', ' ')}` : null].filter(Boolean).join(' · ') ||
  undefined

function MissionName({ name, card, type }: { name: string; card?: ReferenceCard; type: string }) {
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

function randomEntry<T>(entries: readonly T[]) {
  return entries[randomIndex(entries.length)]
}

function randomIndex(length: number) {
  if (!length) return 0
  const value = new Uint32Array(1)
  crypto.getRandomValues(value)
  return (value[0] ?? 0) % length
}
