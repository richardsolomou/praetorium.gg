import { ChevronRight, Copy, Crown, EllipsisVertical, Heart, Minus, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Toggle } from '@/components/ui/toggle'
import type { Attachment } from '../../../core/attach'

type BuiltUnit = {
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
type Joined = { label: string; name: string; action: string; onAct: () => void }

type Props = {
  unit: BuiltUnit
  force?: string
  selected: boolean
  onSelect: () => void
  onRemove: () => void
  onDuplicate: () => void
  owned: boolean
  onOwned: () => void
  onToggle: (key: string, name: string, selected: boolean) => void
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
export function UnitCard({
  unit,
  force,
  selected,
  onSelect,
  onRemove,
  onDuplicate,
  owned,
  onOwned,
  onToggle,
  onResize,
  joined,
  canJoin,
  onJoin,
}: Props) {
  return (
    <div
      data-unit={unit.name}
      className={`border bg-card transition-colors ${selected ? 'border-azure' : 'border-edge hover:border-edge-strong'}`}
    >
      <div className="relative flex items-start gap-2 px-2.5 py-2 transition-colors hover:bg-raised">
        <Button
          variant="ghost"
          className="absolute inset-0 h-full w-full rounded-none hover:bg-transparent"
          onClick={onSelect}
          aria-pressed={selected}
          aria-label={unit.name}
        />
        <div className="pointer-events-none min-w-0 flex-1 text-left">
          <span className="w-full min-w-0">
            <span className="block text-[0.9375rem] leading-tight font-bold tracking-[0.02em] uppercase">{unit.name}</span>
            {force ? <span className="eyebrow mt-0.5 block text-azure">Allied force · {force}</span> : null}
          </span>
          {unit.wargear.length ? (
            <ul className="mt-1 w-full min-w-0 space-y-px">
              {unit.wargear.map((piece) => (
                <li key={piece.name} className="text-xs text-dim">
                  <span aria-hidden>• </span>
                  <span className="readout">{piece.count}x</span> {piece.name}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <span className="pointer-events-none relative z-10 flex shrink-0 items-center gap-1.5 [&_button]:pointer-events-auto">
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
            <Toggle
              key={toggle.key}
              variant="default"
              size="sm"
              className="size-7 p-0"
              aria-label={`${toggle.selected ? 'Remove' : 'Make'} ${unit.name} ${toggle.name}`}
              pressed={toggle.selected}
              onPressedChange={(pressed) => onToggle(toggle.key, toggle.name, pressed)}
            >
              <Crown />
            </Toggle>
          ))}
          <DropdownMenu>
            <DropdownMenuTrigger
              className="flex size-7 cursor-pointer items-center justify-center rounded-sm hover:bg-raised"
              aria-label={`Unit actions for ${unit.name}`}
            >
              <EllipsisVertical className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44 rounded-none border border-edge-strong bg-raised shadow-xl ring-0">
              <DropdownMenuItem className="rounded-none text-xs font-semibold uppercase focus:bg-edge" onClick={onDuplicate}>
                <Copy className="size-3.5" /> Duplicate unit
              </DropdownMenuItem>
              <DropdownMenuCheckboxItem
                className="rounded-none text-xs font-semibold uppercase focus:bg-edge"
                checked={owned}
                onCheckedChange={onOwned}
              >
                <Heart className={`size-3.5 ${owned ? 'fill-azure text-azure' : ''}`} />
                {owned ? 'Remove from collection' : 'Add to collection'}
              </DropdownMenuCheckboxItem>
              <DropdownMenuItem variant="destructive" className="rounded-none text-xs font-semibold uppercase" onClick={onRemove}>
                <X className="size-3.5" /> Delete unit
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <ChevronRight className="size-4 text-faint" aria-hidden />
        </span>
      </div>

      {unit.enhancements.map((enhancement) => (
        <div key={enhancement} className="flex items-center gap-2 border-t border-edge bg-raised px-2.5 py-1">
          <span className="chip text-achieved">Enhancement</span>
          <span className="text-xs font-semibold">{enhancement}</span>
        </div>
      ))}

      {joined.map((row) => (
        <div key={`${row.label}-${row.name}`} className="flex items-center gap-2 border-t border-edge bg-raised px-2.5 py-1">
          <span className="chip shrink-0">{row.label}</span>
          <span className="min-w-0 flex-1 text-xs">{row.name}</span>
          <Button
            variant="ghost"
            size="xs"
            className="shrink-0 text-[0.6875rem] tracking-[0.06em] text-azure uppercase"
            onClick={row.onAct}
          >
            {row.action}
          </Button>
        </div>
      ))}

      {canJoin.length ? (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-edge bg-raised px-2.5 py-1">
          <span className="chip shrink-0">{unit.attachment?.kind === 'leader' ? 'Lead' : 'Support'}</span>
          {canJoin.map((target) => (
            <Button
              key={target.key}
              variant="ghost"
              size="xs"
              className="text-[0.6875rem] tracking-[0.06em] text-azure uppercase hover:bg-transparent hover:text-bone"
              onClick={() => onJoin(target.key)}
            >
              {target.name}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
