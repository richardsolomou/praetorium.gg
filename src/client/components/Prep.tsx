import { useQuery } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useRef } from 'react'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { Command, Secondary, SecondaryMode } from '../../core/battle'
import type { BattleView } from '../../core/battleView'
import { isKotcLimit, SECONDARIES_MAX, SECONDARY_MODES, STRATAGEMS_MAX } from '../../core/battle'
import { detachmentRulesQuery } from '../queries'
import { sides } from '../sides'

type Props = { view: BattleView; missionId: string | null; send: (command: Command) => void; pending: boolean }

/**
 * The one card decision a player actually makes: how their secondaries are drawn.
 *
 * Everything else follows from what is already on the table. The stratagems are the
 * detachment's plus the core ones every army has, and the primary comes from this
 * side's ordered disposition matchup — so neither is offered as a choice.
 *
 * These belong to the side, not the seat, so only the seat the domain folds a side's
 * resources onto writes them. Letting both allies record their own detachment's
 * stratagems into one pool left the survivor down to whichever request landed last.
 */
export function Prep({ view, missionId, send, pending }: Props) {
  const yourSide = sides(view).find((side) => side.isViewer)
  const captain = yourSide?.captain
  const writes = captain?.id === view.viewerId
  const you = view.players.find((player) => player.isViewer)
  const built = you?.roster?.built
  const detachmentNames = built?.detachments?.map((detachment) => detachment.name) ?? (built?.detachment ? [built.detachment] : [])
  const { data: rules } = useQuery(detachmentRulesQuery(built?.catalogueId ?? '', detachmentNames))

  const stratagems = rules ? [...rules.stratagems, ...rules.core].slice(0, STRATAGEMS_MAX) : []
  const primaryCard = rules?.primaries.find((card) => card.key === missionId)
  const primary: Secondary | null = primaryCard ? { key: primaryCard.key, name: primaryCard.name } : null
  const tacticalOnly = isKotcLimit(view.settings.limit)
  const storedMode: SecondaryMode = you?.secondaryMode ?? 'tactical'
  const mode: SecondaryMode = tacticalOnly ? 'tactical' : storedMode
  const chosen = you?.secondaries.map(({ key, name }) => ({ key, name })) ?? []
  const deckReady = mode !== 'tactical' || Boolean(you?.remainingSecondaries.length)

  const save = (next: { mode?: SecondaryMode; secondaries?: Secondary[] }) => {
    if (!rules) return
    const nextMode = next.mode ?? mode
    send({
      kind: 'set-prep',
      stratagems,
      // A tactical hand starts empty and is drawn from the deck once the battle begins.
      secondaries: nextMode === 'tactical' ? [] : (next.secondaries ?? chosen),
      secondaryDeck: nextMode === 'tactical' ? rules.secondaries.map(({ key, name }) => ({ key, name })) : undefined,
      primary,
      secondaryMode: nextMode,
    })
  }

  // What the army brings is not a decision, so it is recorded as soon as it is known —
  // and the matchup can settle later than the stratagems do, so this stays live rather
  // than firing once.
  useEffect(() => {
    if (!writes || !rules || !you || pending) return
    const missingStratagems = stratagems.length > 0 && you.stratagems.length === 0
    const wrongPrimary = primary?.key !== you.primaryCard?.key
    const missingDeck = mode === 'tactical' && rules.secondaries.length > 0 && you.remainingSecondaries.length === 0
    const invalidMode = tacticalOnly && storedMode !== 'tactical'
    if (!missingStratagems && !wrongPrimary && !missingDeck && !invalidMode) return
    save({})
    // Re-runs only when one of those two facts changes, and both are satisfied by the save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    rules,
    you?.stratagems.length,
    you?.primaryCard,
    you?.remainingSecondaries.length,
    primary?.key,
    mode,
    storedMode,
    tacticalOnly,
    pending,
    writes,
  ])

  if (!writes) {
    return (
      <div data-secondary-deck-ready={deckReady} className="space-y-2">
        <Label>Secondary play</Label>
        <p className="text-sm">{mode === 'fixed' ? 'Fixed cards, chosen for the whole battle.' : 'Tactical, drawn as the battle runs.'}</p>
        <p className="text-xs text-dim">
          {captain?.name ?? 'Your ally'} sets the cards and stratagems your side plays. You both draw from the one hand.
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
    <div data-secondary-deck-ready={deckReady} className="space-y-5">
      <section className="space-y-2">
        <Label>Secondary play</Label>
        <ToggleGroup
          value={[mode]}
          onValueChange={(value) => {
            const next = SECONDARY_MODES.find((entry) => entry === value[0])
            if (next && next !== mode) save({ mode: next })
          }}
          variant="outline"
          size="sm"
        >
          {SECONDARY_MODES.filter((entry) => !tacticalOnly || entry === 'tactical').map((entry) => (
            <ToggleGroupItem key={entry} value={entry}>
              {entry === 'fixed' ? 'Fixed' : 'Tactical'}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <p className="text-xs text-dim">
          {tacticalOnly
            ? 'King of the Colosseum requires tactical secondaries.'
            : mode === 'tactical'
              ? 'Drawn from the deck as the battle runs. Nothing to choose now.'
              : `Choose up to ${SECONDARIES_MAX} cards to play for the whole battle.`}
        </p>
      </section>

      {mode === 'fixed' ? (
        <SecondaryPicker
          cards={rules.secondaries}
          chosen={chosen}
          onToggle={(card) => {
            const held = chosen.some((entry) => entry.key === card.key)
            const secondaries = held
              ? chosen.filter((entry) => entry.key !== card.key)
              : [...chosen, { key: card.key, name: card.name }].slice(0, SECONDARIES_MAX)
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

/** The fixed deck is long enough to be worth windowing rather than laying out whole. */
function SecondaryPicker({
  cards,
  chosen,
  onToggle,
}: {
  cards: readonly { key: string; name: string }[]
  chosen: readonly Secondary[]
  onToggle: (card: { key: string; name: string }) => void
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const rows = useVirtualizer({
    count: cards.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => 44,
    overscan: 8,
  })

  return (
    <div ref={scroller} className="h-72 overflow-y-auto rounded-sm border border-edge bg-sunken p-2">
      <div className="relative w-full" style={{ height: rows.getTotalSize() }}>
        {rows.getVirtualItems().map((row) => {
          const card = cards[row.index]
          if (!card) return null
          const held = chosen.some((entry) => entry.key === card.key)
          return (
            <button
              key={card.key}
              type="button"
              aria-pressed={held}
              onClick={() => onToggle(card)}
              className={`absolute top-0 left-0 flex w-full items-center justify-between gap-2 rounded-sm border px-2.5 py-1.5 text-left ${
                held ? 'border-azure bg-azure/10' : 'border-edge hover:border-edge-strong'
              }`}
              style={{ height: row.size - 4, transform: `translateY(${row.start}px)` }}
            >
              <span className={`text-sm leading-tight font-bold uppercase ${held ? 'text-azure' : 'text-bone'}`}>{card.name}</span>
              {held ? <span className="text-[0.625rem] font-semibold text-azure uppercase">taken</span> : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
