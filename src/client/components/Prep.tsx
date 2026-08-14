import { useQuery } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useRef } from 'react'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { BattleView, Command, Secondary, SecondaryMode } from '../../core/battle'
import { SECONDARIES_MAX, SECONDARY_MODES, STRATAGEMS_MAX } from '../../core/battle'
import { detachmentRulesQuery } from '../queries'

type Props = { view: BattleView; missionId: string | null; send: (command: Command) => void; pending: boolean }

/**
 * The one card decision a player actually makes: how their secondaries are drawn.
 *
 * Everything else follows from what is already on the table. The stratagems are the
 * detachment's plus the core ones every army has, and the primary is whatever the two
 * force dispositions play — so neither is offered as a choice that could be got wrong.
 */
export function Prep({ view, missionId, send, pending }: Props) {
  const you = view.players.find((player) => player.isViewer)
  const built = you?.roster?.built
  const detachmentNames = built?.detachments?.map((detachment) => detachment.name) ?? (built?.detachment ? [built.detachment] : [])
  const { data: rules } = useQuery(detachmentRulesQuery(built?.catalogueId ?? '', detachmentNames))

  const stratagems = rules ? [...rules.stratagems, ...rules.core].slice(0, STRATAGEMS_MAX) : []
  const primaryCard = rules?.primaries.find((card) => card.key === missionId)
  const primary: Secondary | null = primaryCard ? { key: primaryCard.key, name: primaryCard.name } : null
  const mode: SecondaryMode = you?.secondaryMode ?? 'tactical'
  const chosen = you?.secondaries.map(({ key, name }) => ({ key, name })) ?? []

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
    if (!rules || !you) return
    const missingStratagems = stratagems.length > 0 && you.stratagems.length === 0
    const missingPrimary = primary !== null && you.primaryCard === null
    if (!missingStratagems && !missingPrimary) return
    save({})
    // Re-runs only when one of those two facts changes, and both are satisfied by the save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rules, you?.stratagems.length, you?.primaryCard, primary?.key])

  if (!rules) {
    return (
      <p className="text-sm text-dim">
        No stratagem or mission data on this instance. Run <span className="readout">pnpm catalogue:sync</span> and reload.
      </p>
    )
  }

  return (
    <div className="space-y-5">
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
          {SECONDARY_MODES.map((entry) => (
            <ToggleGroupItem key={entry} value={entry} disabled={pending}>
              {entry === 'fixed' ? 'Fixed' : 'Tactical'}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <p className="text-xs text-dim">
          {mode === 'tactical'
            ? 'Drawn from the deck as the battle runs. Nothing to choose now.'
            : `Choose up to ${SECONDARIES_MAX} cards to play for the whole battle.`}
        </p>
      </section>

      {mode === 'fixed' ? (
        <SecondaryPicker
          cards={rules.secondaries}
          chosen={chosen}
          pending={pending}
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
  pending,
  onToggle,
}: {
  cards: readonly { key: string; name: string }[]
  chosen: readonly Secondary[]
  pending: boolean
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
              disabled={pending}
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
