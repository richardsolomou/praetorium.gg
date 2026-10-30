import { Check } from 'lucide-react'
import { loadedWords, useSourceTexts } from '../../sourceText'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { DialogBody, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/Dialog'
import { nextDraw } from '../../scoring'
import { type Side, sideName } from '../../sides'
import type { WhenDrawn } from '../../../contracts/missions'
import { redrawOffer } from './drawOffer'
import { MissionDetailsDialog, MissionName, type MissionDetails, type ReferenceCard } from './MissionCards'
import { CARD } from './battleTints'
import { UndoLatest, type UndoTarget } from './UndoLatest'
import { BattleDialogContent, BattlePromptDialog } from './BattlePromptDialog'
import { countLabel } from '../../text'
import type { SendCommand } from './useCommand'

type Props = {
  side: Side
  round: number
  undo: UndoTarget
  pending: boolean
  send: SendCommand
  referenceFor: (key: string) => ReferenceCard | undefined
  whenDrawnFor: (key: string) => WhenDrawn | undefined
  onDone: () => void
  initialSelection?: DrawSelection
  onSelectionChange: (selection: DrawSelection) => void
}

export type DrawSelection = { selecting: boolean; selected: string[] }

/**
 * The tactical hand, drawn at the top of a turn.
 *
 * Random draws stay server-chosen. Manual selection keeps a corrected command log
 * aligned with a physical hand. The named side owns either draw, including a
 * practice opponent's hand.
 */
export function DrawDialog({
  side,
  round,
  undo,
  pending,
  send,
  referenceFor,
  whenDrawnFor: publishedWhenDrawn,
  onDone,
  initialSelection,
  onSelectionChange,
}: Props) {
  const held = side.secondaries.filter((card) => card.status === 'active')
  useSourceTexts(held.map((card) => publishedWhenDrawn(card.key)?.condition))
  // The condition is the card's own words, so it reads as those once they load and is named generically until then.
  const whenDrawnFor = (key: string) => {
    const rule = publishedWhenDrawn(key)
    return rule?.condition ? { ...rule, condition: loadedWords(rule.condition) ?? 'the card’s condition holds' } : rule
  }
  /**
   * What this turn dealt, apart from what the hand was already carrying.
   *
   * A hand keeps its unscored cards from turn to turn, so most turns open with cards
   * that were not drawn now — and a card may only be put back the moment it is drawn.
   * Listing all of them as one deal would say the turn dealt four cards when it dealt
   * two, and offer a card from two turns ago back to the deck.
   */
  const dealtNow = new Set(side.secondariesToReview)
  const drawn = held.filter((card) => dealtNow.has(card.key))
  const carried = held.filter((card) => !dealtNow.has(card.key))
  const owed = Math.min(side.secondaryDrawTarget - side.secondariesDrawnThisTurn.length, side.remainingSecondaries.length)
  const [paused, setPaused] = useState(true)
  const [selecting, setSelecting] = useState(initialSelection?.selecting ?? false)
  const [selected, setSelected] = useState<string[]>(() =>
    (initialSelection?.selected ?? []).filter((key) => side.remainingSecondaries.some((card) => card.key === key)).slice(0, owed),
  )
  const [inspected, setInspected] = useState<MissionDetails | null>(null)
  const needsDraw = owed > 0
  const requiredReturn = drawn.some((card) => redrawOffer(whenDrawnFor(card.key), round, held)?.required)
  /**
   * What this prompt has already asked the deck for.
   *
   * A request is in flight for a moment before the hand it fills comes back, and the
   * effect can run again inside that moment. Counting the asks rather than watching a
   * request flag is what stops a hand of one being dealt back up to three.
   */
  const asked = useRef(new Set<string>())
  const recordSelection = (next: DrawSelection) => {
    setSelecting(next.selecting)
    setSelected(next.selected)
    onSelectionChange(next)
  }
  const resetForUndo = () => {
    if (!undo.undoableDraw) return
    setPaused(true)
    recordSelection({ selecting: false, selected: [] })
  }

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
    const secondaries: Side['remainingSecondaries'] = []
    while (true) {
      const card = nextDraw(
        side.secondariesDrawnThisTurn.length,
        side.secondaryDrawTarget,
        requested,
        side.secondaries,
        side.remainingSecondaries,
      )
      if (!card) break
      requested.add(card.key)
      secondaries.push(card)
    }
    if (!secondaries.length) return
    for (const card of secondaries) asked.current.add(card.key)
    send(
      { kind: 'draw-secondaries', secondaries, playerId: side.captain.id },
      {
        complete: (appended) => {
          if (appended) return
          for (const card of secondaries) asked.current.delete(card.key)
          setPaused(true)
        },
      },
    )
  }, [side.secondariesDrawnThisTurn, side.secondaryDrawTarget, paused, side.captain.id, side.secondaries, side.remainingSecondaries, send])

  // A card that leaves the deck leaves the selection.
  const stillInDeck = selected.filter((key) => side.remainingSecondaries.some((card) => card.key === key))
  if (stillInDeck.length !== selected.length) setSelected(stillInDeck)

  const cardName = (card: { key: string; name: string }) => (
    <MissionName name={card.name} card={referenceFor(card.key)} type="Secondary mission" mode={side.secondaryMode} onRead={setInspected} />
  )

  const toggleSelected = (key: string) =>
    recordSelection({
      selecting: true,
      selected: selected.includes(key)
        ? selected.filter((candidate) => candidate !== key)
        : selected.length < owed
          ? [...selected, key]
          : selected,
    })

  const chooseSelected = () => {
    const secondaries = side.remainingSecondaries.filter((card) => selected.includes(card.key))
    if (secondaries.length !== owed) return
    recordSelection({ selecting: false, selected: [] })
    send({ kind: 'draw-secondaries', secondaries, selected: true, playerId: side.captain.id })
  }

  return (
    <>
      <BattlePromptDialog open minimizedLabel={`Secondary missions · ${sideName(side)}`}>
        <BattleDialogContent showCloseButton={false} minimizeDisabled={pending || (!paused && needsDraw)} className="border-discarded/60">
          <DialogHeader>
            <DialogTitle className="text-discarded">
              {side.isViewer ? 'Your secondary missions' : `${sideName(side)}’s secondary missions`}
            </DialogTitle>
            <DialogDescription>
              {needsDraw
                ? `Draw ${owed} at random or select the exact ${owed === 1 ? 'mission' : 'missions'} from the deck. `
                : carried.length
                  ? `${drawn.length} drawn this turn, on top of the ${carried.length} your hand was already holding. `
                  : `${drawn.length} drawn this turn. `}
              {countLabel(side.remainingSecondaries.length, 'card')} left.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="gap-2">
            {selecting && needsDraw ? (
              <>
                <p className="eyebrow">
                  Select {countLabel(owed, 'mission')} · {selected.length}/{owed}
                </p>
                <ul className="space-y-1.5">
                  {side.remainingSecondaries.map((card) => {
                    const chosen = selected.includes(card.key)
                    return (
                      <li
                        key={card.key}
                        className={`flex items-center justify-between gap-2 rounded-sm px-2.5 py-1.5 ${chosen ? 'bg-parchment/10' : 'bg-sunken'}`}
                      >
                        {cardName(card)}
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
                    {cardName(card)}
                    {offer ? (
                      <>
                        <p className="text-2xs text-dim">{offer.message}</p>
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
                    {cardName(card)}
                  </div>
                ))}
              </>
            ) : null}
            {!selecting && !paused && needsDraw ? <p className="text-sm text-discarded">Drawing…</p> : null}
          </DialogBody>
          <DialogFooter>
            <UndoLatest undo={undo} send={send} pending={pending} beforeUndo={resetForUndo} />
            {selecting && needsDraw ? (
              <>
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={() => {
                    recordSelection({ selecting: false, selected: [] })
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
                <Button variant="outline" disabled={pending} onClick={() => recordSelection({ selecting: true, selected: [] })}>
                  Select missions
                </Button>
                <Button disabled={pending} onClick={() => setPaused(false)}>
                  Draw at random
                </Button>
              </>
            ) : (
              <Button disabled={pending || needsDraw || requiredReturn} onClick={onDone}>
                Take the turn
              </Button>
            )}
          </DialogFooter>
        </BattleDialogContent>
      </BattlePromptDialog>
      {/* Base UI treats nested dialogs as one dismissible region, so details must be a sibling. */}
      {inspected ? <MissionDetailsDialog details={inspected} onOpenChange={(open) => !open && setInspected(null)} /> : null}
    </>
  )
}
