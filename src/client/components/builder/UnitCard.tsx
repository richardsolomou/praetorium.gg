import { ChevronRight, Copy, Crown, Minus, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Attachment } from '../../../core/attach'

export type BuiltUnit = {
  entryId: string
  name: string
  points: number
  size: { min: number; max: number; models: number; resizable: boolean }
  wargear: { name: string; count: number }[]
  attachment: Attachment | null
  toggles: { key: string; name: string; selected: boolean }[]
  enhancements: string[]
}

/** Who this unit is joined to, in whichever direction the card is showing. */
export type Joined = { label: string; name: string; action: string; onAct: () => void }

type Props = {
  unit: BuiltUnit
  selected: boolean
  onSelect: () => void
  onRemove: () => void
  onDuplicate: () => void
  onToggle: (key: string, selected: boolean) => void
  onResize: (models: number) => void
  /** Rows stating what this unit is attached to, or what is attached to it. */
  joined: Joined[]
  /** Units in the roster this one may join, when it may join any. */
  canJoin: { key: number; name: string }[]
  onJoin: (key: number) => void
}

/**
 * One unit in the roster, as a datasheet would print it: the name, what it is
 * carrying, what it costs, and who it is standing with.
 *
 * The model count is here rather than only in the loadout pane. Changing squad size
 * is the most common edit in list building and the least deserving of a trip to
 * another pane — on a phone that pane is a whole screen away.
 */
export function UnitCard({ unit, selected, onSelect, onRemove, onDuplicate, onToggle, onResize, joined, canJoin, onJoin }: Props) {
  return (
    <div
      data-unit={unit.name}
      className={`border bg-card transition-colors ${selected ? 'border-azure' : 'border-edge hover:border-edge-strong'}`}
    >
      <div className="flex items-start gap-2 px-2.5 py-2">
        <button type="button" className="min-w-0 flex-1 text-left" onClick={onSelect} aria-pressed={selected}>
          <span className="block truncate text-[0.9375rem] leading-tight font-bold tracking-[0.02em] uppercase">{unit.name}</span>
          {unit.wargear.length ? (
            <ul className="mt-1 space-y-px">
              {unit.wargear.map((piece) => (
                <li key={piece.name} className="truncate text-xs text-dim">
                  <span aria-hidden>• </span>
                  <span className="readout">{piece.count}x</span> {piece.name}
                </li>
              ))}
            </ul>
          ) : null}
        </button>
        <span className="flex shrink-0 items-center gap-1.5">
          {unit.size.resizable ? (
            <span className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon-sm"
                className="size-6"
                aria-label={`Fewer models in ${unit.name}`}
                disabled={unit.size.models <= unit.size.min}
                onClick={() => onResize(unit.size.models - 1)}
              >
                <Minus />
              </Button>
              <span className="readout w-6 text-center text-sm" aria-label={`${unit.name} models`}>
                {unit.size.models}
              </span>
              <Button
                variant="outline"
                size="icon-sm"
                className="size-6"
                aria-label={`More models in ${unit.name}`}
                disabled={unit.size.models >= unit.size.max}
                onClick={() => onResize(unit.size.models + 1)}
              >
                <Plus />
              </Button>
            </span>
          ) : null}
          <span className="chip">{unit.points} pts</span>
          {unit.toggles.map((toggle) => (
            <Button
              key={toggle.key}
              variant={toggle.selected ? 'default' : 'ghost'}
              size="icon-sm"
              aria-label={`${toggle.selected ? 'Remove' : 'Make'} ${unit.name} ${toggle.name}`}
              aria-pressed={toggle.selected}
              onClick={() => onToggle(toggle.key, !toggle.selected)}
            >
              <Crown />
            </Button>
          ))}
          <Button variant="ghost" size="icon-sm" aria-label={`Duplicate ${unit.name}`} onClick={onDuplicate}>
            <Copy />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label={`Remove ${unit.name}`} onClick={onRemove}>
            <X />
          </Button>
          <ChevronRight className="size-4 text-faint" aria-hidden />
        </span>
      </div>

      {unit.enhancements.map((enhancement) => (
        <div key={enhancement} className="flex items-center gap-2 border-t border-edge bg-raised px-2.5 py-1">
          <span className="chip text-achieved">Enhancement</span>
          <span className="truncate text-xs font-semibold">{enhancement}</span>
        </div>
      ))}

      {joined.map((row) => (
        <div key={`${row.label}-${row.name}`} className="flex items-center gap-2 border-t border-edge bg-raised px-2.5 py-1">
          <span className="chip shrink-0">{row.label}</span>
          <span className="min-w-0 flex-1 truncate text-xs">{row.name}</span>
          <button
            type="button"
            className="shrink-0 text-[0.6875rem] font-semibold tracking-[0.06em] text-azure uppercase"
            onClick={row.onAct}
          >
            {row.action}
          </button>
        </div>
      ))}

      {canJoin.length ? (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-edge bg-raised px-2.5 py-1">
          <span className="chip shrink-0">{unit.attachment?.kind === 'leader' ? 'Lead' : 'Support'}</span>
          {canJoin.map((target) => (
            <button
              key={target.key}
              type="button"
              className="text-[0.6875rem] font-semibold tracking-[0.06em] text-azure uppercase hover:text-bone"
              onClick={() => onJoin(target.key)}
            >
              {target.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
