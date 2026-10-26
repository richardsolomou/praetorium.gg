import { BellRing, BookmarkPlus, Copy, Crown, EllipsisVertical, Plus, Unlink, Users, X } from 'lucide-react'
import { type ReactNode, useId } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu'
import {
  DropdownMenu,
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
import { countLabel } from '../../../text'
import { asSentence } from '../../../text'
import type { EmbarkChoice } from './embarkModel'
import { PointsChip } from './PointsChip'

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

/** Who this unit is joined to or riding with, in whichever direction the card is showing. */
export type Joined = { label: string; name: string; action?: string; onAct?: () => void }

type Props = {
  unit: BuiltUnit
  warlord?: boolean
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
  /** Absent for a visitor, who has no account to keep a loadout in. */
  onSaveLoadout?: () => void
  /** Absent for a unit standing alone, which has nothing to save with it. */
  onSaveAttachedUnit?: () => void
  /** Present while this unit leads or supports another. */
  onDetach?: () => void
  /** Units this one may join. */
  canJoin: AttachChoice[]
  onJoin: (choice: AttachChoice) => void
  /** Units that may join this one. */
  canHost: AttachChoice[]
  onHost: (choice: AttachChoice) => void
  /** Transports this unit may start in. */
  canBoard: EmbarkChoice[]
  onBoard: (choice: EmbarkChoice) => void
  /** Units that may start in this transport. */
  canCarry: EmbarkChoice[]
  onCarry: (choice: EmbarkChoice) => void
}

/**
 * One unit in the roster, as a datasheet would print it: the name, what it is
 * carrying, what it costs, and who it is standing with.
 */
export function UnitCard({
  unit,
  warlord,
  nickname,
  note,
  alliedFaction,
  selected,
  onSelect,
  onRemove = noop,
  onDuplicate = noop,
  canDuplicate = true,
  onSaveLoadout,
  onSaveAttachedUnit,
  onDetach,
  joined = NONE,
  canJoin = NONE,
  onJoin = noop,
  canHost = NONE,
  onHost = noop,
  canBoard = NONE,
  onBoard = noop,
  canCarry = NONE,
  onCarry = noop,
  status,
  alertCount = 0,
  editable = true,
}: Props) {
  const cardClassName = `relative min-w-0 max-w-full overflow-hidden border bg-card transition-colors [contain:layout_style] ${
    selected ? 'border-parchment' : 'border-edge hover:border-info'
  }`
  const actions = { onDuplicate, canDuplicate, onSaveLoadout, onSaveAttachedUnit, onDetach, onRemove }

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
                  <UnitActions parts={DROPDOWN_PARTS} {...actions} />
                </DropdownMenuContent>
              </DropdownMenu>
            </span>
          ) : null}
        </span>
        <div className="pointer-events-none text-left">
          <span className="w-full min-w-0">
            <span className="rubric block leading-tight text-bone">
              {warlord ? (
                <span className="mr-1 inline-flex align-middle text-info" title="Warlord">
                  <Crown className="size-3.5 fill-current" aria-label="Warlord" />
                </span>
              ) : null}
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
              <span className="mt-1 block text-xs text-dim">{countLabel(unit.modelCount, 'model')}</span>
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
        <JoinedRow key={`${row.label}-${row.name}`} row={row} editable={editable} />
      ))}

      {editable && canJoin.length ? (
        <AttachMenu label="Attach to unit" ariaLabel={`Attach ${unit.name} to unit`} choices={canJoin} onChoose={onJoin} />
      ) : null}

      {editable && canHost.length ? (
        <AttachMenu label="Attach unit" ariaLabel={`Attach a unit to ${unit.name}`} choices={canHost} onChoose={onHost} />
      ) : null}

      {editable && canBoard.length ? (
        <EmbarkMenu
          label="Embark in transport"
          ariaLabel={`Embark ${unit.name} in transport`}
          choiceLabel={(choice) => `Embark ${unit.name} in ${choice.name}`}
          choices={canBoard}
          onChoose={onBoard}
        />
      ) : null}

      {editable && canCarry.length ? (
        <EmbarkMenu
          label="Embark unit"
          ariaLabel={`Embark a unit in ${unit.name}`}
          choiceLabel={(choice) => `Embark ${choice.name} in ${unit.name}`}
          choices={canCarry}
          onChoose={onCarry}
        />
      ) : null}

      {/* A wider gap than the rows above it: two counters side by side put one's `+` next to the other's `-`. */}
      {status ? (
        <div data-print-hide data-unit-status className={`${ROW} relative z-10 flex-wrap gap-x-4 gap-y-1.5 [&_button]:pointer-events-auto`}>
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
        <UnitActions parts={CONTEXT_PARTS} {...actions} />
      </ContextMenuContent>
    </ContextMenu>
  )
}

const noop = () => undefined
const NONE: never[] = []

/** A line under the unit's name: an enhancement, an upgrade, or who it is standing with. */
export const ROW = 'flex items-center border-t border-edge bg-raised px-2.5 py-1'
const MENU = 'w-44'
const ITEM = 'text-xs font-semibold uppercase'

/** A row naming who a unit is joined to or riding with, and the button undoing it while the roster can be edited. */
export function JoinedRow({ row, editable }: { row: Joined; editable: boolean }) {
  return (
    <div className={`${ROW} pointer-events-none relative z-10 flex-wrap gap-2 [&_button]:pointer-events-auto`}>
      <span className="chip shrink-0">{row.label}</span>
      <span className="min-w-24 flex-1 text-xs break-words">{row.name}</span>
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
  )
}

export function AttachMenu({
  label,
  ariaLabel,
  choices,
  onChoose,
}: {
  label: string
  ariaLabel: string
  choices: AttachChoice[]
  onChoose: (choice: AttachChoice) => void
}) {
  const id = useId()
  const roster = choices.filter((choice) => choice.kind === 'roster')
  const added = choices.filter((choice) => choice.kind === 'new')
  return (
    <CardMenu label={label} ariaLabel={ariaLabel}>
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
              <PointsChip points={choice.points} />
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      ) : null}
    </CardMenu>
  )
}

export function EmbarkMenu({
  label,
  ariaLabel,
  choiceLabel,
  choices,
  onChoose,
}: {
  label: string
  ariaLabel: string
  choiceLabel: (choice: EmbarkChoice) => string
  choices: EmbarkChoice[]
  onChoose: (choice: EmbarkChoice) => void
}) {
  const id = useId()
  return (
    <CardMenu label={label} ariaLabel={ariaLabel}>
      {choices.map((choice, at) => (
        <DropdownMenuItem
          key={choice.name}
          aria-label={choiceLabel(choice)}
          aria-describedby={choice.reason ? `${id}-${at}` : undefined}
          disabled={Boolean(choice.reason)}
          className="items-start data-disabled:opacity-100"
          onClick={() => onChoose(choice)}
        >
          <span className="min-w-0 flex-1">
            <span className={`block ${ITEM} ${choice.reason ? 'text-faint' : ''}`}>{choice.name}</span>
            {choice.detail ? <span className="readout mt-0.5 block text-2xs text-dim">{choice.detail}</span> : null}
            {choice.reason ? (
              <span id={`${id}-${at}`} className="mt-0.5 block text-2xs text-discarded">
                {asSentence(choice.reason)}
              </span>
            ) : null}
          </span>
        </DropdownMenuItem>
      ))}
    </CardMenu>
  )
}

/** A card row opening a menu of what the unit can be paired with. */
function CardMenu({ label, ariaLabel, children }: { label: string; ariaLabel: string; children: ReactNode }) {
  return (
    <div data-print-hide className={`${ROW} pointer-events-none relative z-10 [&_button]:pointer-events-auto`}>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="xs"
              className="!px-1 text-2xs tracking-label text-azure uppercase hover:bg-transparent hover:text-bone"
              aria-label={ariaLabel}
            />
          }
        >
          {label}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72 max-w-[calc(100vw-1rem)]">
          {children}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function UnitAlertMarker({ count, unitName }: { count: number; unitName: string }) {
  const summary = `${countLabel(count, 'alert')} set for ${unitName}`
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

const DROPDOWN_PARTS = { Item: DropdownMenuItem, Separator: DropdownMenuSeparator }
const CONTEXT_PARTS = { Item: ContextMenuItem, Separator: ContextMenuSeparator }

function UnitActions({
  parts: { Item, Separator },
  onDuplicate,
  canDuplicate,
  onSaveLoadout,
  onSaveAttachedUnit,
  onDetach,
  onRemove,
}: {
  parts: typeof DROPDOWN_PARTS | typeof CONTEXT_PARTS
  onDuplicate: () => void
  canDuplicate: boolean
  onSaveLoadout?: () => void
  onSaveAttachedUnit?: () => void
  onDetach?: () => void
  onRemove: () => void
}) {
  return (
    <>
      <Item className={ITEM} disabled={!canDuplicate} onClick={onDuplicate}>
        <Copy className="size-3.5" /> Duplicate unit
      </Item>
      {onSaveLoadout || onSaveAttachedUnit ? <Separator /> : null}
      {onSaveLoadout ? (
        <Item className={ITEM} onClick={onSaveLoadout}>
          <BookmarkPlus className="size-3.5" /> Save loadout
        </Item>
      ) : null}
      {onSaveAttachedUnit ? (
        <Item className={ITEM} onClick={onSaveAttachedUnit}>
          <Users className="size-3.5" /> Save attached unit
        </Item>
      ) : null}
      {onDetach ? (
        <>
          <Separator />
          <Item className={ITEM} onClick={onDetach}>
            <Unlink className="size-3.5" /> Detach from unit
          </Item>
        </>
      ) : null}
      <Separator />
      <Item variant="destructive" className={ITEM} onClick={onRemove}>
        <X className="size-3.5" /> Delete unit
      </Item>
    </>
  )
}
