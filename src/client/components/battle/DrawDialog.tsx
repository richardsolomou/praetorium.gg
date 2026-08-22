import { Undo2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { Command } from '../../../core/battle'
import { HAND_SIZE, nextDraw } from '../../scoring'
import type { Side } from '../../sides'
import { redrawOffer, type WhenDrawn } from './drawOffer'
import { MissionDetailsDialog, MissionName, type MissionDetails, type ReferenceCard } from './MissionCards'
import { CARD } from './tints'

export type { WhenDrawn } from './drawOffer'

type Props = {
  side: Side
  round: number
  undoable: number | null
  initiallyPaused: boolean
  pending: boolean
  send: (command: Command) => void
  referenceFor: (key: string) => ReferenceCard | undefined
  whenDrawnFor: (key: string) => WhenDrawn | undefined
  onDone: () => void
}

/**
 * The tactical hand, drawn at the top of a turn.
 *
 * Cards come off the deck at random and are never picked: choosing which one you
 * are dealt is not a move the game has. Putting one back is, but only where the
 * card itself says so, which is why each offer names the condition it rests on.
 */
export function DrawDialog({ side, round, undoable, initiallyPaused, pending, send, referenceFor, whenDrawnFor, onDone }: Props) {
  const held = side.secondaries.filter((card) => card.status === 'active')
  const [paused, setPaused] = useState(initiallyPaused)
  const [inspected, setInspected] = useState<MissionDetails | null>(null)
  /**
   * What this prompt has already asked the deck for.
   *
   * A request is in flight for a moment before the hand it fills comes back, and the
   * effect can run again inside that moment. Counting the asks rather than watching a
   * request flag is what stops a hand of one being dealt back up to three.
   */
  const asked = useRef(new Set<string>())

  // A refused ask — the hand filled from elsewhere before this one landed — never
  // appears in `side.secondaries`, so nothing about the view changes to prompt a
  // cleanup. The round trip finishing is the only reliable signal that it is safe
  // to check whether an ask paid off or was refused.
  useEffect(() => {
    if (pending) return
    for (const key of asked.current) {
      if (!side.secondaries.some((card) => card.key === key)) asked.current.delete(key)
    }
  }, [pending, side.secondaries])

  // Drawing is not a decision, so it happens as soon as the hand is short rather than
  // waiting behind a button that has only one thing it can do. What to ask for is
  // decided here rather than during a render: two renders can be prepared before
  // either effect runs, and both would read the same tally and ask the deck twice.
  useEffect(() => {
    if (paused) return
    const card = nextDraw(side.secondaries, asked.current, side.remainingSecondaries)
    if (!card) return
    asked.current.add(card.key)
    send({ kind: 'draw-secondary', secondary: card })
  }, [paused, side.secondaries, side.remainingSecondaries, send])

  return (
    <>
      <Dialog open>
        <DialogContent
          showCloseButton={false}
          className="max-h-[85dvh] overflow-y-auto rounded-none border border-discarded/60 bg-panel text-bone sm:max-w-lg"
        >
          <DialogHeader>
            <DialogTitle className="text-discarded uppercase">Your secondary missions</DialogTitle>
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
                  <MissionName name={card.name} card={referenceFor(card.key)} type="Secondary mission" onRead={setInspected} />
                  {offer ? (
                    <>
                      <p className="text-[0.6875rem] text-dim">{offer}</p>
                      <Button
                        variant="outline"
                        size="xs"
                        className="text-discarded"
                        disabled={pending || !side.remainingSecondaries.length}
                        onClick={() => send({ kind: 'set-secondary-status', key: card.key, status: 'returned', playerId: side.captain.id })}
                      >
                        Put back and draw another
                      </Button>
                    </>
                  ) : null}
                </div>
              )
            })}
            {paused && held.length < HAND_SIZE ? <p className="text-sm text-dim">Drawing paused while you undo.</p> : null}
            {!paused && held.length < HAND_SIZE ? <p className="text-sm text-discarded">Drawing…</p> : null}
          </div>
          <DialogFooter className="rounded-none border-edge bg-sunken">
            <Button
              variant="outline"
              disabled={pending || undoable === null}
              onClick={() => {
                if (undoable === null) return
                setPaused(true)
                send({ kind: 'undo', target: undoable })
              }}
            >
              <Undo2 />
              Undo latest action
            </Button>
            {paused && held.length < HAND_SIZE ? (
              <Button disabled={pending} onClick={() => setPaused(false)}>
                Resume drawing
              </Button>
            ) : (
              <Button disabled={pending || held.length < HAND_SIZE} onClick={onDone}>
                Take the turn
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Base UI treats nested dialogs as one dismissible region, so details must be a sibling. */}
      {inspected ? <MissionDetailsDialog details={inspected} onOpenChange={(open) => !open && setInspected(null)} /> : null}
    </>
  )
}
