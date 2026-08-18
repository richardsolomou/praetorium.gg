import { Copy, EllipsisVertical, Heart, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Attachment } from '../../../core/attach'
import { FactionLabel, type FactionPresentation } from '../FactionMark'

type BuiltUnit = {
  entryId: string
  name: string
  points: number
  wargear: { name: string; count: number }[]
  attachment: Attachment | null
  enhancements: string[]
  upgrades: string[]
}

/** Who this unit is joined to, in whichever direction the card is showing. */
type Joined = { label: string; name: string; action: string; onAct: () => void }

type Props = {
  unit: BuiltUnit
  alliedFaction?: FactionPresentation
  selected: boolean
  onSelect: () => void
  onRemove: () => void
  onDuplicate: () => void
  owned: boolean
  onOwned: () => void
  /** Rows stating what this unit is attached to, or what is attached to it. */
  joined: Joined[]
  /** Units in the roster this one may join, when it may join any. */
  canJoin: { key: number; name: string }[]
  onJoin: (key: number) => void
}

/**
 * One unit in the roster, as a datasheet would print it: the name, what it is
 * carrying, what it costs, and who it is standing with.
 */
export function UnitCard({
  unit,
  alliedFaction,
  selected,
  onSelect,
  onRemove,
  onDuplicate,
  owned,
  onOwned,
  joined,
  canJoin,
  onJoin,
}: Props) {
  return (
    <div
      data-unit={unit.name}
      className={`border bg-card transition-colors ${selected ? 'border-azure' : 'border-edge hover:border-azure'}`}
    >
      <div className="relative flex items-start gap-2 px-2.5 py-2">
        <Button
          variant="ghost"
          className="absolute inset-0 h-full w-full rounded-none hover:bg-transparent dark:hover:bg-transparent"
          onClick={onSelect}
          aria-pressed={selected}
          aria-label={unit.name}
        />
        <div className="pointer-events-none min-w-0 flex-1 text-left">
          <span className="w-full min-w-0">
            <span className="block text-[0.9375rem] leading-tight font-bold tracking-[0.02em] uppercase">{unit.name}</span>
            {alliedFaction ? (
              <span className="eyebrow mt-1 flex items-center gap-1 text-azure">
                Allied unit · <FactionLabel faction={alliedFaction} />
              </span>
            ) : null}
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
          <span className="chip">{unit.points} pts</span>
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
        </span>
      </div>

      {unit.enhancements.map((enhancement) => (
        <div key={enhancement} className="flex items-center gap-2 border-t border-edge bg-raised px-2.5 py-1">
          <span className="chip text-achieved">Enhancement</span>
          <span className="text-xs font-semibold">{enhancement}</span>
        </div>
      ))}

      {unit.upgrades.map((upgrade) => (
        <div key={upgrade} className="flex items-center gap-2 border-t border-edge bg-raised px-2.5 py-1">
          <span className="chip text-achieved">Upgrade</span>
          <span className="text-xs font-semibold">{upgrade}</span>
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
