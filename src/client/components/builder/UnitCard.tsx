import { Copy, EllipsisVertical, Heart, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ContextMenu, ContextMenuCheckboxItem, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu'
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
  editable?: boolean
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
  editable = true,
}: Props) {
  const cardClassName = `relative border bg-card transition-colors ${selected ? 'border-parchment' : 'border-edge hover:border-info'}`
  const actions = { owned, onOwned, onDuplicate, onRemove }

  // One target over the whole card, under everything on it. An enhancement, an
  // upgrade and who a unit is standing with are all things a player reads on the
  // card and then wants to open, so the rows saying so open it too — and the
  // buttons that do something else take their clicks back.
  const card = (
    <>
      <Button
        variant="ghost"
        className="absolute inset-0 h-full w-full rounded-none hover:bg-transparent dark:hover:bg-transparent"
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={unit.name}
      />
      <div className="flow-root px-2.5 py-2">
        <span className="pointer-events-none relative z-10 float-right ml-2 flex shrink-0 items-center gap-1.5 [&_button]:pointer-events-auto">
          <span className="chip text-info">{unit.points} pts</span>
          {editable ? (
            <span data-print-hide>
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="flex size-7 cursor-pointer items-center justify-center rounded-sm hover:bg-raised"
                  aria-label={`Unit actions for ${unit.name}`}
                >
                  <EllipsisVertical className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className={MENU}>
                  <UnitActions Item={DropdownMenuItem} Checkbox={DropdownMenuCheckboxItem} {...actions} />
                </DropdownMenuContent>
              </DropdownMenu>
            </span>
          ) : null}
        </span>
        <div className="pointer-events-none text-left">
          <span className="w-full min-w-0">
            <span className="block text-[0.9375rem] leading-tight font-bold tracking-[0.02em] uppercase">{unit.name}</span>
            {alliedFaction ? (
              <span className="eyebrow mt-1 flex items-center gap-1 text-info">
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
      </div>

      {unit.enhancements.map((enhancement) => (
        <div key={enhancement} className={`${ROW} pointer-events-none gap-2`}>
          <span className="chip text-achieved">Enhancement</span>
          <span className="text-xs font-semibold">{enhancement}</span>
        </div>
      ))}

      {unit.upgrades.map((upgrade) => (
        <div key={upgrade} className={`${ROW} pointer-events-none gap-2`}>
          <span className="chip text-achieved">Upgrade</span>
          <span className="text-xs font-semibold">{upgrade}</span>
        </div>
      ))}

      {joined.map((row) => (
        <div key={`${row.label}-${row.name}`} className={`${ROW} pointer-events-none relative z-10 gap-2 [&_button]:pointer-events-auto`}>
          <span className="chip shrink-0">{row.label}</span>
          <span className="min-w-0 flex-1 text-xs">{row.name}</span>
          {editable ? (
            <Button
              data-print-hide
              variant="ghost"
              size="xs"
              className="shrink-0 text-[0.6875rem] tracking-[0.06em] text-azure uppercase"
              onClick={row.onAct}
            >
              {row.action}
            </Button>
          ) : null}
        </div>
      ))}

      {editable && canJoin.length ? (
        <div className={`${ROW} pointer-events-none relative z-10 flex-wrap gap-1.5 [&_button]:pointer-events-auto`}>
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
    </>
  )

  if (!editable) {
    return (
      <div data-unit={unit.name} className={cardClassName}>
        {card}
      </div>
    )
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger render={<div data-unit={unit.name} className={cardClassName} />}>{card}</ContextMenuTrigger>
      <ContextMenuContent className={MENU}>
        <UnitActions Item={ContextMenuItem} Checkbox={ContextMenuCheckboxItem} {...actions} />
      </ContextMenuContent>
    </ContextMenu>
  )
}

/** A line under the unit's name: an enhancement, an upgrade, or who it is standing with. */
const ROW = 'flex items-center border-t border-edge bg-raised px-2.5 py-1'
const MENU = 'w-44 rounded-none border border-edge-strong bg-raised shadow-xl ring-0'
const ITEM = 'rounded-none text-xs font-semibold uppercase focus:bg-edge'

/**
 * The same three actions, in whichever menu asked for them.
 *
 * The overflow button and the right-click menu are two ways to reach one list, so the
 * list is written once and handed the item components of the menu drawing it.
 */
function UnitActions({
  Item,
  Checkbox,
  owned,
  onOwned,
  onDuplicate,
  onRemove,
}: {
  Item: typeof DropdownMenuItem | typeof ContextMenuItem
  Checkbox: typeof DropdownMenuCheckboxItem | typeof ContextMenuCheckboxItem
  owned: boolean
  onOwned: () => void
  onDuplicate: () => void
  onRemove: () => void
}) {
  return (
    <>
      <Item className={ITEM} onClick={onDuplicate}>
        <Copy className="size-3.5" /> Duplicate unit
      </Item>
      <Checkbox className={ITEM} checked={owned} onCheckedChange={onOwned}>
        <Heart className={`size-3.5 ${owned ? 'fill-azure text-azure' : ''}`} />
        {owned ? 'Remove from collection' : 'Add to collection'}
      </Checkbox>
      <Item variant="destructive" className="rounded-none text-xs font-semibold uppercase" onClick={onRemove}>
        <X className="size-3.5" /> Delete unit
      </Item>
    </>
  )
}
