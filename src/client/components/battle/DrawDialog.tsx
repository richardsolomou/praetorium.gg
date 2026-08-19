import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { Command, Secondary } from '../../../core/battle'
import type { Side } from '../../sides'
import { MissionName, type ReferenceCard } from './MissionCards'
import { CARD } from './tints'

/** What the rules say about putting a card back the moment it is drawn. */
export type WhenDrawn = {
  operation: 'redraw' | 'replace'
  roundMax: number | null
  heldCards: string[]
  condition: string | null
}

type Props = {
  side: Side
  round: number
  pending: boolean
  send: (command: Command) => void
  referenceFor: (key: string) => ReferenceCard | undefined
  whenDrawnFor: (key: string) => WhenDrawn | undefined
  onDone: () => void
}

const HAND_SIZE = 2

/**
 * The tactical hand, drawn at the top of a turn.
 *
 * Cards come off the deck at random and are never picked: choosing which one you
 * are dealt is not a move the game has. Putting one back is, but only where the
 * card itself says so, which is why each offer names the condition it rests on.
 */
export function DrawDialog({ side, round, pending, send, referenceFor, whenDrawnFor, onDone }: Props) {
  const held = side.secondaries.filter((card) => card.status === 'active')
  const short = HAND_SIZE - held.length

  // Drawing is not a decision, so it happens as soon as the hand is short rather than
  // waiting behind a button that has only one thing it can do.
  useEffect(() => {
    if (pending || short <= 0) return
    const card = randomEntry(side.remainingSecondaries)
    if (card) send({ kind: 'draw-secondary', secondary: card })
  }, [pending, short, side.remainingSecondaries, send])

  return (
    <Dialog open onOpenChange={(open) => !open && onDone()}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto rounded-none border border-edge bg-panel text-bone sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="uppercase">Your secondary missions</DialogTitle>
          <DialogDescription className="text-dim">
            Drawn at random from the deck, {side.remainingSecondaries.length} cards left. Some cards may be put back the moment they are
            drawn.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {held.map((card) => {
            const rule = whenDrawnFor(card.key)
            const offer = redrawOffer(rule, round, held)
            return (
              <div key={card.key} data-drawn={card.key} className={`${CARD} space-y-1.5`}>
                <MissionName name={card.name} card={referenceFor(card.key)} type="Secondary mission" />
                {offer ? (
                  <>
                    <p className="text-[0.6875rem] text-dim">{offer}</p>
                    <Button
                      variant="outline"
                      size="xs"
                      className="text-discarded"
                      disabled={pending || !side.remainingSecondaries.length}
                      onClick={() => send({ kind: 'set-secondary-status', key: card.key, status: 'discarded' })}
                    >
                      Put back and draw another
                    </Button>
                  </>
                ) : null}
              </div>
            )
          })}
          {short > 0 ? <p className="text-sm text-dim">Drawing…</p> : null}
        </div>
        <DialogFooter className="rounded-none border-edge bg-sunken">
          <Button disabled={pending || short > 0} onClick={onDone}>
            Take the turn
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Why this card may go back, or null when it may not.
 *
 * Round and already-held conditions the battle can settle itself. A condition about
 * what is on the table it cannot, so that one is stated for the player to judge —
 * the same reason objective control is never inferred anywhere else.
 */
export function redrawOffer(rule: WhenDrawn | undefined, round: number, held: readonly { key: string }[]): string | null {
  if (!rule) return null
  if (rule.roundMax !== null) {
    return round <= rule.roundMax ? `You may put this back in battle round ${rule.roundMax} or earlier.` : null
  }
  if (rule.heldCards.length) {
    return held.some((card) => rule.heldCards.includes(card.key)) ? 'You may put this back while you hold the card it pairs with.' : null
  }
  return rule.condition ? `You may put this back if ${rule.condition}.` : null
}

function randomEntry<T>(entries: readonly T[]): T | undefined {
  if (!entries.length) return undefined
  const value = new Uint32Array(1)
  crypto.getRandomValues(value)
  return entries[(value[0] ?? 0) % entries.length]
}

export type DrawableCard = Secondary
