import { Check, Undo2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { Command } from '../../../core/battle'
import { HAND_SIZE, nextDraw } from '../../scoring'
import { type Side, sideName } from '../../sides'
import { redrawOffer, type WhenDrawn } from './drawOffer'
import { DrawUndoAlert } from './DrawUndoAlert'
import { MissionDetailsDialog, MissionName, type MissionDetails, type ReferenceCard } from './MissionCards'
import { CARD } from './tints'

export type { WhenDrawn } from './drawOffer'

type Props = {
  side: Side
  round: number
  undoable: number | null
  confirmUndo: boolean
  pending: boolean
  send: (command: Command) => void
  referenceFor: (key: string) => ReferenceCard | undefined
  whenDrawnFor: (key: string) => WhenDrawn | undefined
  onDone: () => void
}

/**
 * The tactical hand, drawn at the top of a turn.
 *
 * Random draws stay server-chosen. Manual selection keeps a corrected command log
 * aligned with a physical hand. The named side owns either draw, including a
 * practice opponent's hand.
 */
export function DrawDialog({ side, round, undoable, confirmUndo, pending, send, referenceFor, whenDrawnFor, onDone }: Props) {
  const held = side.secondaries.filter((card) => card.status === 'active')
  /**
   * What this turn dealt, apart from what the hand was already carrying.
   *
   * A hand keeps its unscored cards from turn to turn, so most turns open with cards
   * that were not drawn now — and a card may only be put back the moment it is drawn.
   * Listing all of them as one deal said the turn had dealt four cards when it dealt
   * two, and offered a card from two turns ago back to the deck.
   */
  const dealtNow = new Set(side.secondariesDrawnThisTurn)
  const drawn = held.filter((card) => dealtNow.has(card.key))
  const carried = held.filter((card) => !dealtNow.has(card.key))
  const [paused, setPaused] = useState(true)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [inspected, setInspected] = useState<MissionDetails | null>(null)
  const [confirmingUndo, setConfirmingUndo] = useState<number | null>(null)
  const owed = Math.min(HAND_SIZE - side.secondariesDrawnThisTurn.length, side.remainingSecondaries.length)
  const needsDraw = owed > 0
  const canUndo = side.secondariesDrawnThisTurn.length > 0 && undoable !== null
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

  // Once random drawing is chosen, what to ask for is decided here rather than during
  // a render: two renders can be prepared before either effect runs, and both would
  // read the same tally and ask the deck twice.
  useEffect(() => {
    if (paused) return
    const requested = new Set(asked.current)
    const secondaries = []
    while (true) {
      const card = nextDraw(side.secondariesDrawnThisTurn.length, requested, side.secondaries, side.remainingSecondaries)
      if (!card) break
      requested.add(card.key)
      secondaries.push(card)
    }
    if (!secondaries.length) return
    for (const card of secondaries) asked.current.add(card.key)
    // Named, because the table may be dealing a practice opponent's hand rather than its own.
    send({ kind: 'draw-secondaries', secondaries, playerId: side.captain.id })
  }, [side.secondariesDrawnThisTurn, paused, side.captain.id, side.secondaries, side.remainingSecondaries, send])

  useEffect(() => {
    setSelected((current) => {
      const next = current.filter((key) => side.remainingSecondaries.some((card) => card.key === key))
      return next.length === current.length ? current : next
    })
  }, [side.remainingSecondaries])

  const toggleSelected = (key: string) =>
    setSelected((current) => {
      if (current.includes(key)) return current.filter((candidate) => candidate !== key)
      return current.length < owed ? [...current, key] : current
    })

  const chooseSelected = () => {
    const secondaries = side.remainingSecondaries.filter((card) => selected.includes(card.key))
    if (secondaries.length !== owed) return
    setSelected([])
    setSelecting(false)
    send({ kind: 'draw-secondaries', secondaries, selected: true, playerId: side.captain.id })
  }

  return (
    <>
      <Dialog open>
        <DialogContent
          showCloseButton={false}
          className="max-h-[85dvh] overflow-y-auto rounded-none border border-discarded/60 bg-panel text-bone sm:max-w-lg"
        >
          <DialogHeader>
            <DialogTitle className="text-discarded uppercase">
              {side.isViewer ? 'Your secondary missions' : `${sideName(side)}’s secondary missions`}
            </DialogTitle>
            <DialogDescription className="text-dim">
              {needsDraw
                ? `Draw ${owed} at random or select the exact ${owed === 1 ? 'mission' : 'missions'} from the deck. `
                : carried.length
                  ? `${drawn.length} drawn this turn, on top of the ${carried.length} your hand was already holding. `
                  : `${drawn.length} drawn this turn. `}
              {side.remainingSecondaries.length} cards left. Some missions may be put back the moment they are drawn.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {selecting && needsDraw ? (
              <>
                <p className="eyebrow">
                  Select {owed} mission{owed === 1 ? '' : 's'} · {selected.length}/{owed}
                </p>
                <ul className="space-y-1.5">
                  {side.remainingSecondaries.map((card) => {
                    const chosen = selected.includes(card.key)
                    return (
                      <li
                        key={card.key}
                        className={`flex items-center justify-between gap-2 rounded-sm px-2.5 py-1.5 ${chosen ? 'bg-parchment/10' : 'bg-sunken'}`}
                      >
                        <MissionName
                          name={card.name}
                          card={referenceFor(card.key)}
                          type="Secondary mission"
                          mode={side.secondaryMode}
                          onRead={setInspected}
                        />
                        <Button
                          variant="outline"
                          size="xs"
                          aria-pressed={chosen}
                          aria-label={`${chosen ? 'Remove' : 'Select'} ${card.name}`}
                          className={`shrink-0 ${chosen ? 'border-parchment text-parchment' : ''}`}
                          disabled={pending || (!chosen && selected.length >= owed)}
                          onClick={() => toggleSelected(card.key)}
                        >
                          {chosen ? <Check aria-hidden /> : null}
                          {chosen ? 'Selected' : 'Select'}
                        </Button>
                      </li>
                    )
                  })}
                </ul>
              </>
            ) : null}
            {!selecting && carried.length ? <p className="eyebrow">Drawn this turn</p> : null}
            {!selecting &&
              drawn.map((card) => {
                const rule = whenDrawnFor(card.key)
                const offer = redrawOffer(rule, round, held)
                return (
                  <div key={card.key} data-drawn={card.key} className={`${CARD} space-y-1.5`}>
                    <MissionName
                      name={card.name}
                      card={referenceFor(card.key)}
                      type="Secondary mission"
                      mode={side.secondaryMode}
                      onRead={setInspected}
                    />
                    {offer ? (
                      <>
                        <p className="text-[0.6875rem] text-dim">{offer.message}</p>
                        <Button
                          variant="outline"
                          size="xs"
                          className="text-discarded"
                          disabled={pending || !side.remainingSecondaries.length}
                          onClick={() =>
                            send({ kind: 'set-secondary-status', key: card.key, status: offer.status, playerId: side.captain.id })
                          }
                        >
                          {offer.label}
                        </Button>
                      </>
                    ) : null}
                  </div>
                )
              })}
            {/*
             * Named for what they are: still in hand, and not this turn's to put back.
             * Drawn under the new cards rather than above them, because the question the
             * prompt is asking is about the ones that just arrived.
             */}
            {!selecting && carried.length ? (
              <>
                <p className="eyebrow pt-1">Still in hand</p>
                {carried.map((card) => (
                  <div key={card.key} data-held={card.key} className={`${CARD} space-y-1.5`}>
                    <MissionName
                      name={card.name}
                      card={referenceFor(card.key)}
                      type="Secondary mission"
                      mode={side.secondaryMode}
                      onRead={setInspected}
                    />
                  </div>
                ))}
              </>
            ) : null}
            {!selecting && !paused && needsDraw ? <p className="text-sm text-discarded">Drawing…</p> : null}
          </div>
          <DialogFooter className="rounded-none border-edge bg-sunken">
            <Button
              variant="outline"
              disabled={pending || !canUndo}
              onClick={() => {
                if (undoable === null) return
                if (confirmUndo) {
                  setConfirmingUndo(undoable)
                  return
                }
                setPaused(true)
                setSelecting(false)
                setSelected([])
                send({ kind: 'undo', target: undoable })
              }}
            >
              <Undo2 />
              Undo latest action
            </Button>
            {selecting && needsDraw ? (
              <>
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={() => {
                    setSelected([])
                    setSelecting(false)
                  }}
                >
                  Cancel selection
                </Button>
                <Button disabled={pending || selected.length !== owed} onClick={chooseSelected}>
                  Add selected missions
                </Button>
              </>
            ) : paused && needsDraw ? (
              <>
                <Button variant="outline" disabled={pending} onClick={() => setSelecting(true)}>
                  Select missions
                </Button>
                <Button disabled={pending} onClick={() => setPaused(false)}>
                  Draw at random
                </Button>
              </>
            ) : (
              <Button disabled={pending || needsDraw} onClick={onDone}>
                Take the turn
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Base UI treats nested dialogs as one dismissible region, so details must be a sibling. */}
      {inspected ? <MissionDetailsDialog details={inspected} onOpenChange={(open) => !open && setInspected(null)} /> : null}
      <DrawUndoAlert
        open={confirmingUndo !== null}
        pending={pending}
        onOpenChange={(open) => !open && setConfirmingUndo(null)}
        onConfirm={() => {
          if (confirmingUndo === null) return
          setPaused(true)
          setSelecting(false)
          setSelected([])
          setConfirmingUndo(null)
          send({ kind: 'undo', target: confirmingUndo })
        }}
      />
    </>
  )
}
