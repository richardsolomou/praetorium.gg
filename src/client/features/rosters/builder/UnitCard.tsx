import { BellRing, Boxes, Copy, EllipsisVertical, Plus, X } from 'lucide-react'
import { type ReactNode, useId } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ContextMenu, ContextMenuCheckboxItem, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Attachment } from '../../../../core/attach'
import { nicknamedUnit } from '../../../../core/unitNotes'
import { FactionLabel, type FactionPresentation } from '../../../components/FactionMark'

type BuiltUnit = {
  entryId: string
  name: string
  points: number
  modelCount?: number
  wargear: { name: string; count: number }[]
  attachment: Attachment | null
  enhancements: string[]
  upgrades: string[]
}

/** A unit already in the roster to attach, or a datasheet to add as a new unit and attach in the same edit. */
export type AttachChoice =
  | { kind: 'roster'; key: number; name: string }
  | { kind: 'new'; entryId: string; name: string; points: number | null; reason: string | null }

/** Who this unit is joined to, in whichever direction the card is showing. */
type Joined = { label: string; name: string; action?: string; onAct?: () => void }

type Props = {
  unit: BuiltUnit
  /** The player's name for the unit, shown above the datasheet name. */
  nickname?: string
  /** Only present for readers allowed to see it. */
  note?: string
  alliedFaction?: FactionPresentation
  selected: boolean
  /** Omit when the card has no detail pane to open, such as a frozen battle snapshot. */
  onSelect?: () => void
  /** Rows stating what this unit is attached to, or what is attached to it. */
  joined?: Joined[]
  /** A last row of the card's own: what a battle has done to this unit, and what can be done about it. */
  status?: ReactNode
  alertCount?: number
  editable?: boolean
} & Partial<Editing>

/** Everything a card only has while its roster can still be changed. */
type Editing = {
  onRemove: () => void
  onDuplicate: () => void
  canDuplicate: boolean
  owned: boolean
  onOwned: () => void
  /** Units this one may join. */
  canJoin: AttachChoice[]
  onJoin: (choice: AttachChoice) => void
  /** Units that may join this one. */
  canHost: AttachChoice[]
  onHost: (choice: AttachChoice) => void
}

/**
 * One unit in the roster, as a datasheet would print it: the name, what it is
 * carrying, what it costs, and who it is standing with.
 */
export function UnitCard({
  unit,
  nickname,
  note,
  alliedFaction,
  selected,
  onSelect,
  onRemove = noop,
  onDuplicate = noop,
  canDuplicate = true,
  owned = false,
  onOwned,
  joined = NONE,
  canJoin = NONE,
  onJoin = noop,
  canHost = NONE,
  onHost = noop,
  status,
  alertCount = 0,
  editable = true,
}: Props) {
  const cardClassName = `relative min-w-0 max-w-full overflow-hidden border bg-card transition-colors [contain:layout_style] ${
    selected ? 'border-parchment' : 'border-edge hover:border-info'
  }`
  const actions = { owned, onOwned, onDuplicate, canDuplicate, onRemove }

  // One target over the whole card, under everything on it. An enhancement, an
  // upgrade and who a unit is standing with are all things a player reads on the
  // card and then wants to open, so the rows saying so open it too — and the
  // buttons that do something else take their clicks back.
  const card = (
    <>
      {onSelect ? (
        <Button
          variant="ghost"
          className="absolute inset-0 h-full w-full hover:bg-transparent dark:hover:bg-transparent"
          data-print-hide
          onClick={onSelect}
          aria-pressed={selected}
          aria-label={nicknamedUnit(unit.name, nickname)}
        />
      ) : null}
      <div className="flow-root px-2.5 py-2">
        <span className="pointer-events-none relative z-10 float-right ml-2 flex shrink-0 items-center gap-1.5 [&_button]:pointer-events-auto">
          <span className="chip text-info">{unit.points} pts</span>
          {editable ? (
            <span data-print-hide>
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Unit actions for ${unit.name}`} />}>
                  <EllipsisVertical />
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
            <span className="rubric block leading-tight text-bone">
              {nickname ?? unit.name}
              {alertCount ? <UnitAlertMarker count={alertCount} unitName={unit.name} /> : null}
            </span>
            {nickname ? <span className="mt-0.5 block text-xs text-dim">{unit.name}</span> : null}
            {alliedFaction ? (
              <span className="eyebrow mt-1 flex items-center gap-1 text-info">
                Allied unit · <FactionLabel faction={alliedFaction} />
              </span>
            ) : null}
            {unit.modelCount !== undefined ? (
              <span className="mt-1 block text-xs text-dim">
                {unit.modelCount} {unit.modelCount === 1 ? 'model' : 'models'}
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

      {note ? (
        <div className={`${ROW} ph-no-capture pointer-events-none items-start gap-2`} data-unit-note>
          <span className="chip shrink-0">Note</span>
          <span className="min-w-0 flex-1 text-xs break-words whitespace-pre-line line-clamp-3 print:line-clamp-none">{note}</span>
        </div>
      ) : null}

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
          {editable && row.action ? (
            <Button
              data-print-hide
              variant="ghost"
              size="xs"
              className="shrink-0 text-2xs tracking-label text-azure uppercase"
              onClick={row.onAct}
            >
              {row.action}
            </Button>
          ) : null}
        </div>
      ))}

      {editable && canJoin.length ? (
        <AttachMenu
          label="Attach to unit"
          ariaLabel={`Attach ${unit.name} to unit`}
          onboarding="unit-attachment"
          choices={canJoin}
          onChoose={onJoin}
        />
      ) : null}

      {editable && canHost.length ? (
        <AttachMenu label="Attach unit" ariaLabel={`Attach a unit to ${unit.name}`} choices={canHost} onChoose={onHost} />
      ) : null}

      {/* A wider gap than the rows above it: two counters side by side put one's `+` next to the other's `-`. */}
      {status ? (
        <div data-print-hide className={`${ROW} relative z-10 flex-wrap gap-x-4 gap-y-1.5 [&_button]:pointer-events-auto`}>
          {status}
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

const noop = () => undefined
const NONE: never[] = []

/** A line under the unit's name: an enhancement, an upgrade, or who it is standing with. */
const ROW = 'flex items-center border-t border-edge bg-raised px-2.5 py-1'
const MENU = 'w-44'
const ITEM = 'text-xs font-semibold uppercase'

function AttachMenu({
  label,
  ariaLabel,
  onboarding,
  choices,
  onChoose,
}: {
  label: string
  ariaLabel: string
  onboarding?: string
  choices: AttachChoice[]
  onChoose: (choice: AttachChoice) => void
}) {
  const id = useId()
  const roster = choices.filter((choice) => choice.kind === 'roster')
  const added = choices.filter((choice) => choice.kind === 'new')
  return (
    <div data-print-hide className={`${ROW} pointer-events-none relative z-10 [&_button]:pointer-events-auto`}>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="xs"
              className="!px-1 text-2xs tracking-label text-azure uppercase hover:bg-transparent hover:text-bone"
              data-onboarding={onboarding}
              aria-label={ariaLabel}
            />
          }
        >
          {label}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72 max-w-[calc(100vw-1rem)]">
          {roster.length ? (
            <DropdownMenuGroup>
              <DropdownMenuLabel className="eyebrow text-faint">In this roster</DropdownMenuLabel>
              {roster.map((choice) => (
                <DropdownMenuItem key={choice.key} className={ITEM} onClick={() => onChoose(choice)}>
                  {choice.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          ) : null}
          {roster.length && added.length ? <DropdownMenuSeparator /> : null}
          {added.length ? (
            <DropdownMenuGroup>
              <DropdownMenuLabel className="eyebrow text-faint">Add a new unit</DropdownMenuLabel>
              {added.map((choice) => (
                <DropdownMenuItem
                  key={choice.entryId}
                  aria-label={`Add new ${choice.name} and attach`}
                  aria-describedby={choice.reason ? `${id}-${choice.entryId}` : undefined}
                  disabled={Boolean(choice.reason)}
                  className="items-start data-disabled:opacity-100"
                  onClick={() => onChoose(choice)}
                >
                  <Plus className={`mt-0.5 size-3.5 ${choice.reason ? 'text-faint' : 'text-info'}`} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className={`block ${ITEM} ${choice.reason ? 'text-faint' : ''}`}>{choice.name}</span>
                    {choice.reason ? (
                      <span id={`${id}-${choice.entryId}`} className="mt-0.5 block text-2xs text-discarded">
                        {choice.reason}
                      </span>
                    ) : null}
                  </span>
                  {choice.points === null ? null : (
                    <span className="chip w-[4.5rem] shrink-0 justify-center text-info">{choice.points} pts</span>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function UnitAlertMarker({ count, unitName }: { count: number; unitName: string }) {
  const summary = `${count} ${count === 1 ? 'alert' : 'alerts'} set for ${unitName}`
  return (
    <Tooltip>
      <TooltipTrigger
        closeOnClick={false}
        render={<output aria-label={summary} className="pointer-events-auto relative z-10 ml-1 inline-flex align-middle text-parchment" />}
      >
        <BellRing className="size-3" aria-hidden />
      </TooltipTrigger>
      <TooltipContent role="tooltip" side="bottom">
        {summary}
      </TooltipContent>
    </Tooltip>
  )
}

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
  canDuplicate,
  onRemove,
}: {
  Item: typeof DropdownMenuItem | typeof ContextMenuItem
  Checkbox: typeof DropdownMenuCheckboxItem | typeof ContextMenuCheckboxItem
  owned: boolean
  onOwned?: () => void
  onDuplicate: () => void
  canDuplicate: boolean
  onRemove: () => void
}) {
  return (
    <>
      <Item className={ITEM} disabled={!canDuplicate} onClick={onDuplicate}>
        <Copy className="size-3.5" /> Duplicate unit
      </Item>
      {onOwned ? (
        <Checkbox className={ITEM} checked={owned} onCheckedChange={onOwned}>
          <Boxes className="size-3.5" />
          {owned ? 'Remove from collection' : 'Add to collection'}
        </Checkbox>
      ) : null}
      <Item variant="destructive" className={ITEM} onClick={onRemove}>
        <X className="size-3.5" /> Delete unit
      </Item>
    </>
  )
}
