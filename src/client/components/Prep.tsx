import { useQueries, useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import type { Command, Secondary, SecondaryMode } from '../../core/battle'
import type { BattleView } from '../../core/battleView'
import { FIXED_SECONDARIES, isKotcLimit, SECONDARY_MODES } from '../../core/battle'
import { detachmentRulesQuery, gameReferencesQuery } from '../queries'
import { primaryCards, secondaryCards } from '../missionDeck'
import { armyRulesRequest, sideStratagems } from '../sideRules'
import { MissionName, type ReferenceCard } from './battle/MissionCards'
import { CHOOSABLE, CHOSEN } from './setup/chrome'
import type { Side } from '../sides'

type Props = { view: BattleView; side: Side; missionId: string | null; send: (command: Command) => void; pending: boolean }

/**
 * The one card decision a side actually makes: how its secondaries are drawn.
 *
 * Everything else follows from what is already on the table. The stratagems are every
 * detachment the side fields plus the core ones every army has, and the primary comes
 * from this side's ordered disposition matchup — so neither is offered as a choice.
 *
 * A 2v1 side reads both armies, because the pair share one pool and each ally brings
 * its own detachment to it. Only one seat writes that pool, though: the side's
 * `writer`. Letting both allies record their own into it left the survivor down to
 * whichever request landed last. A side of practice opponents has no seat that could
 * write them, so the table facing it does — the same rule, asked of who is actually
 * playing the side.
 */
export function Prep({ view, side, missionId, send, pending }: Props) {
  const captain = side.captain
  const writes = side.played && (side.writer.id === view.viewerId || side.automated)
  const requests = side.armies.map((army) => armyRulesRequest(army.roster))
  const { data: references } = useQuery(gameReferencesQuery())
  const results = useQueries({ queries: requests.map((request) => detachmentRulesQuery(request.catalogueId, request.detachmentNames)) })
  // The cards, the mission text and the attribution are the instance's rather than
  // any one army's, so the first army to answer settles them for the side.
  const rules = results.map((result) => result.data).find((data) => data) ?? null
  const stratagems = sideStratagems(
    results.map((result, at) => ({ detachments: requests[at]?.detachmentNames ?? [], stratagems: result.data?.stratagems ?? [] })),
    rules?.core ?? [],
  )
  // An army with no list yet, or one whose list names no detachment, has nothing to
  // contribute; every other army has to have answered before the pool is whole. What
  // an arriving ally adds is written when it arrives, which is why the effect below
  // compares the pool rather than firing once.
  const pooled = results.every((result, at) => {
    const request = requests[at]
    return !request?.catalogueId || !request.detachmentNames.length || Boolean(result.data)
  })
  // The deck is the instance's, so it is read once here rather than once per army.
  const primaryCard = primaryCards(references).find((card) => card.key === missionId)
  const deck = secondaryCards(references)
  /**
   * The cards that may be taken as fixed.
   *
   * The pack marks them with a symbol no source carries as a flag, but it prints a
   * separate payout for fixed play on exactly those cards — so a card that says what
   * it pays when fixed is a card that can be fixed, and one that says nothing cannot.
   */
  const fixedCards = deck.filter((card) => card.awards.some((award) => award.mode === 'fixed'))
  const primary: Secondary | null = primaryCard ? { key: primaryCard.key, name: primaryCard.name } : null
  const tacticalOnly = isKotcLimit(view.settings.limit)
  const storedMode: SecondaryMode = captain.secondaryMode
  const mode: SecondaryMode = tacticalOnly ? 'tactical' : storedMode
  const chosen = captain.secondaries.map(({ key, name }) => ({ key, name }))
  const deckReady = mode !== 'tactical' || Boolean(captain.remainingSecondaries.length)

  const save = (next: { mode?: SecondaryMode; secondaries?: Secondary[] }) => {
    if (!rules) return
    const nextMode = next.mode ?? mode
    send({
      kind: 'set-prep',
      playerId: captain.id,
      stratagems,
      // A tactical hand starts empty and is drawn from the deck once the battle begins.
      // Fixed play is clamped on the way out, because a side that settled its cards
      // when the picker offered six is still holding them: sending those back
      // verbatim is refused by the rule this now sends, and a refusal here would
      // wedge every other prep write the side makes.
      secondaries: nextMode === 'tactical' ? [] : (next.secondaries ?? chosen).slice(-FIXED_SECONDARIES),
      secondaryDeck: nextMode === 'tactical' ? deck.map(({ key, name }) => ({ key, name })) : undefined,
      primary,
      secondaryMode: nextMode,
    })
  }

  // What the armies bring is not a decision, so it is recorded as soon as it is known —
  // and both the matchup and an ally's list can settle later than the first army's
  // stratagems do, so this stays live rather than firing once.
  const recorded = captain.stratagems.map((stratagem) => stratagem.key).join()
  const wanted = stratagems.map((stratagem) => stratagem.key).join()
  useEffect(() => {
    // The deck is part of what a write records, and it comes from the references rather
    // than from this side's rules, so an unanswered references request is as much a
    // reason to wait as an unanswered one for the stratagems: writing here without it
    // sends an empty tactical deck, which is refused, which leaves this asking again.
    if (!writes || !rules || !references || pending) return
    // Compared against what would be sent, so a pool already written is left alone
    // and a pool an arriving ally changes is rewritten exactly once.
    const wrongStratagems = pooled && wanted.length > 0 && wanted !== recorded
    const wrongPrimary = primary?.key !== captain.primaryCard?.key
    const missingDeck = mode === 'tactical' && deck.length > 0 && captain.remainingSecondaries.length === 0
    const invalidMode = tacticalOnly && storedMode !== 'tactical'
    if (!wrongStratagems && !wrongPrimary && !missingDeck && !invalidMode) return
    save({})
    // Re-runs only when one of those facts changes, and every one is satisfied by the save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    rules,
    references,
    pooled,
    wanted,
    recorded,
    captain.primaryCard,
    captain.remainingSecondaries.length,
    primary?.key,
    mode,
    storedMode,
    tacticalOnly,
    pending,
    writes,
  ])

  if (!writes) {
    return (
      <div data-secondary-deck-ready={deckReady} className="space-y-1">
        <p className="text-sm font-bold uppercase">{mode === 'fixed' ? 'Fixed cards' : 'Tactical cards'}</p>
        <p className="text-xs text-dim">
          {mode === 'fixed' ? 'Chosen now and played for the whole battle.' : 'Drawn at random or selected as the battle runs.'}
        </p>
        <p className="text-xs text-dim">
          {side.writer.name} sets the cards and stratagems your side plays. You both draw from the one hand.
        </p>
      </div>
    )
  }

  if (!rules) {
    return (
      <p className="text-sm text-dim">
        No stratagem or mission data on this instance. Run <span className="readout">pnpm catalogue:sync</span> and reload.
      </p>
    )
  }

  return (
    <div data-secondary-deck-ready={deckReady} className="space-y-3">
      {/*
       * The two ways to play, each saying what it means rather than leaving a word to
       * carry it. They are the same size and sit side by side because they are a real
       * choice between two halves of the game, not a setting with a default.
       */}
      <fieldset>
        <legend className="sr-only">Secondary play</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {SECONDARY_MODES.filter((entry) => !tacticalOnly || entry === 'tactical').map((entry) => (
            <Button
              key={entry}
              variant="outline"
              aria-pressed={mode === entry}
              className={`h-auto flex-col items-start gap-0.5 px-3 py-2 text-left ${mode === entry ? CHOSEN : CHOOSABLE}`}
              onClick={() => entry !== mode && save({ mode: entry })}
            >
              <span className="text-sm font-bold uppercase">{entry === 'fixed' ? 'Fixed' : 'Tactical'}</span>
              <span className="text-[0.6875rem] leading-tight font-normal whitespace-normal text-dim">
                {entry === 'fixed'
                  ? `Select ${FIXED_SECONDARIES} secondary missions for the battle now`
                  : 'Draw secondary missions at random or select them during the battle'}
              </span>
            </Button>
          ))}
        </div>
        {tacticalOnly ? <p className="mt-1.5 text-xs text-dim">King of the Colosseum requires tactical secondaries.</p> : null}
      </fieldset>

      {mode === 'fixed' ? (
        <SecondaryPicker
          cards={fixedCards}
          chosen={chosen}
          onToggle={(card) => {
            const held = chosen.some((entry) => entry.key === card.key)
            const secondaries = held
              ? chosen.filter((entry) => entry.key !== card.key)
              : [...chosen, { key: card.key, name: card.name }].slice(-FIXED_SECONDARIES)
            save({ secondaries })
          }}
        />
      ) : null}

      <p className="text-[0.6875rem] text-dim">
        {rules.attribution}
        {rules.dataslate ? ` · ${rules.dataslate.replaceAll('-', ' ')}` : ''}
      </p>
    </div>
  )
}

/**
 * The cards a fixed hand may hold, laid out whole.
 *
 * There are four of them, so nothing is windowed and nothing scrolls: this used to
 * be the entire deck behind a fixed-height scroller, which at four rows was a tall
 * box mostly full of nothing.
 *
 * The name opens the card and the toggle takes it — two controls rather than one, so
 * reading what a mission asks for is never a press that commits you to playing it.
 * These are held for the whole battle, which makes that the wrong press to guess at.
 */
function SecondaryPicker({
  cards,
  chosen,
  onToggle,
}: {
  cards: readonly (ReferenceCard & { key: string })[]
  chosen: readonly Secondary[]
  onToggle: (card: { key: string; name: string }) => void
}) {
  return (
    <ul className="space-y-1.5">
      {cards.map((card) => {
        const held = chosen.some((entry) => entry.key === card.key)
        return (
          // Only the toggle is drawn as a control. The row is a surface, so a taken
          // card is not outlined twice over on a list this short.
          <li
            key={card.key}
            className={`flex items-center justify-between gap-2 rounded-sm px-2.5 py-1.5 ${held ? 'bg-parchment/10' : 'bg-sunken'}`}
          >
            <MissionName name={card.name} card={card} type="Secondary mission" mode="fixed" />
            <Button
              variant="outline"
              size="xs"
              aria-pressed={held}
              aria-label={`${held ? 'Remove' : 'Select'} ${card.name}`}
              className={`shrink-0 ${held ? 'border-parchment text-parchment' : ''}`}
              onClick={() => onToggle(card)}
            >
              {held ? 'Taken' : 'Select'}
            </Button>
          </li>
        )
      })}
    </ul>
  )
}
