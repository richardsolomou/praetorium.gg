import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { BattleView, Command } from '../../../core/battle'
import { cardsDue, type DueCard } from '../../scoring'
import type { Side } from '../../sides'
import { type Award, awardTitle, MissionName, type ReferenceCard } from './MissionCards'
import { CARD } from './tints'

type Props = {
  view: BattleView
  side: Side
  due: DueCard[]
  pending: boolean
  send: (command: Command) => void
  referenceFor: (key: string) => ReferenceCard | undefined
  onDone: () => void
  onCancel: () => void
}

/**
 * What a card pays, asked at the moment the card says it pays.
 *
 * The controls exist only here, so a payout can never be taken in a phase its own
 * text does not allow. The numbers come from the card; whether the board earned
 * them is the player's call, which is why nothing is entered for them.
 */
export function ScoringDialog({ view, side, due, pending, send, referenceFor, onDone, onCancel }: Props) {
  const moment = view.phase === 'end' ? 'as you pass the turn' : `as the ${view.phase} phase ends`

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto rounded-none border border-edge bg-panel text-bone sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="uppercase">Score {moment}</DialogTitle>
          <DialogDescription className="text-dim">
            {due.length === 1 ? 'This card pays out now.' : `${due.length} cards pay out now.`} Add what you actually scored, then continue.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {due.map((card) => (
            <div key={card.key} data-due={card.key} className={`${CARD} space-y-2`}>
              <div className="flex items-baseline justify-between gap-2">
                <MissionName
                  name={card.name}
                  card={referenceFor(card.key)}
                  type={card.category === 'primary' ? 'Primary mission' : 'Secondary mission'}
                />
                <span className="readout shrink-0 text-xs text-dim">{scoredSoFar(side, card)}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {card.awards.map((award) => (
                  <Button
                    key={`${award.vp}-${award.per ?? ''}-${award.mode ?? ''}`}
                    variant="outline"
                    size="sm"
                    title={awardTitle(award)}
                    aria-label={`${card.name} plus ${award.vp}${award.per ? ` per ${award.per.replaceAll('-', ' ')}` : ''}`}
                    disabled={pending}
                    onClick={() =>
                      send(
                        card.category === 'primary'
                          ? { kind: 'score', category: 'primary', delta: award.vp }
                          : { kind: 'score-secondary', key: card.key, delta: award.vp },
                      )
                    }
                  >
                    +{award.vp}
                    {award.per ? <span className="ml-0.5 text-[0.625rem] opacity-70">ea</span> : null}
                  </Button>
                ))}
              </div>
              {card.awards.some((award) => award.per) ? (
                <p className="text-[0.625rem] text-faint">Press once for each {perLabel(card)} you scored.</p>
              ) : null}
            </div>
          ))}
        </div>
        <DialogFooter className="rounded-none border-edge bg-sunken">
          <Button variant="outline" disabled={pending} onClick={onCancel}>
            Go back
          </Button>
          <Button disabled={pending} onClick={onDone}>
            {view.phase === 'end' ? 'Pass the turn' : 'End the phase'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** The cards this advance settles, or an empty list when it settles none. */
export function dueForAdvance(
  view: BattleView,
  side: Side,
  awardsFor: (key: string, mode?: string) => Award[],
): ReturnType<typeof cardsDue> {
  const cards = [
    ...(side.primaryCard ? [{ ...side.primaryCard, category: 'primary' as const, awards: awardsFor(side.primaryCard.key) }] : []),
    ...side.secondaries
      .filter((secondary) => secondary.status === 'active')
      .map((secondary) => ({
        key: secondary.key,
        name: secondary.name,
        category: 'secondary' as const,
        awards: awardsFor(secondary.key, side.secondaryMode),
      })),
  ]
  return cardsDue(view, side.isActive, cards)
}

const scoredSoFar = (side: Side, card: DueCard) =>
  card.category === 'primary' ? `${side.primary} so far` : `${side.secondaries.find((entry) => entry.key === card.key)?.points ?? 0} so far`

const perLabel = (card: DueCard) => card.awards.find((award) => award.per)?.per?.replaceAll('-', ' ') ?? 'one'
