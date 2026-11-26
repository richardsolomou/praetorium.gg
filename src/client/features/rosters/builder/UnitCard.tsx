import { BellRing, BookmarkPlus, Copy, Crown, EllipsisVertical, MessageSquareWarning, Plus, Unlink, Users, X } from 'lucide-react'
import { type ReactNode, useId } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ContextMenu, ContextMenuContent, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
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
import { ContextMenuItem, DropdownMenuItem, DropdownMenuLabel } from '../../../components/Menu'

type BuiltUnit = {
  entryId: string
  name: string
  /** Left out where the card shows a unit in play rather than what it costs. */
  points?: number
  modelCount?: number
  wargear: { name: string; count: number }[]
  attachment: Attachment | null
  enhancements: string[]
  upgrades: string[]
}

/** A unit already in the roster to attach, or a datasheet to add as a new unit and attach in the same edit. */
export type AttachChoice =
  | { kind: 'roster'; key: number; name: string }
  | { kind: 'new'; entryId: string; name: string; points: number | null; over: number | null; reason: string | null }

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
  /** Quiet icon actions of the card's own, beside its points. */
  tools?: ReactNode
  alertCount?: number
  editable?: boolean
} & Partial<Editing>

/** Everything a card only has while its roster can still be changed. */
type Editing = {
  onRemove: () => void
  onDuplicate: () => void
  canDuplicate: boolean
  /** Why another copy would break the unit's limit, said under the disabled Duplicate unit. */
  duplicateLimit: string | null
  /** Absent for a visitor, who has no account to keep a loadout in. */
  onSaveLoadout?: () => void
  /** Absent for a unit standing alone, which has nothing to save with it. */
  onSaveAttachedUnit?: () => void
  /** Present while this unit leads or supports another. */
  onDetach?: () => void
  /** Opens feedback about this unit's datasheet. */
  onReport?: () => void
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
  duplicateLimit = null,
  onSaveLoadout,
  onSaveAttachedUnit,
  onDetach,
  onReport,
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
  tools,
  alertCount = 0,
  editable = true,
}: Props) {
  const rowClassName = `relative min-w-0 max-w-full border-b border-edge px-2 transition-colors [contain:layout_style] ${
    selected ? 'bg-raised' : 'hover:bg-panel/60'
  }`
  const gate = selected ? 'current' : undefined
  const actions = { editable, onDuplicate, canDuplicate, duplicateLimit, onSaveLoadout, onSaveAttachedUnit, onDetach, onReport, onRemove }
  // A reader keeps what only touches their own library or a report: saving the loadout and saying something is wrong.
  const hasActions = editable || Boolean(onSaveLoadout || onSaveAttachedUnit || onReport)
  // A row naming no unit only says the role this datasheet plays in the unit drawn around it, so it is set as a tag
  // before the name; its undoing is the menu's Detach from unit whenever the menu offers that.
  const roles = joined.filter((row) => !row.name)
  const rows = joined.filter((row) => row.name)
  const looseRoleActions = roles.filter((row) => editable && row.action && !onDetach)
  const models = unit.modelCount !== undefined && unit.modelCount > 1 ? unit.modelCount : null

  // One target over the whole row, under everything on it. An enhancement, an
  // upgrade and who a unit is standing with are all things a player reads on the
  // row and then wants to open, so the lines saying so open it too — and the
  // buttons that do something else take their clicks back.
  const card = (
    <>
      {onSelect ? (
        <Button
          variant="ghost"
          className="absolute inset-0 h-full w-full rounded-none hover:bg-transparent dark:hover:bg-transparent"
          data-print-hide
          onClick={onSelect}
          aria-pressed={selected}
          aria-label={nicknamedUnit(unit.name, nickname)}
        />
      ) : null}
      <div className="flex items-start gap-2.5 py-2.5">
        <div className="pointer-events-none min-w-0 flex-1 text-left">
          <span className="block text-[1.0625rem] leading-snug font-semibold text-bone">
            {roles.map((row) => (
              <span key={row.label} className={`${TAG} mr-1.5 align-[0.1em]`}>
                {row.label}
              </span>
            ))}
            <span>{nickname ?? unit.name}</span>
            {models === null ? null : (
              <span className="ml-1.5 font-medium text-faint">
                <span aria-hidden>×</span>
                <span className="sr-only">, </span>
                {models}
                <span className="sr-only"> models</span>
              </span>
            )}
            {alertCount ? <UnitAlertMarker count={alertCount} unitName={unit.name} /> : null}
          </span>
          {nickname ? <span className="mt-0.5 block text-xs text-dim">{unit.name}</span> : null}
          {alliedFaction ? (
            <span className="eyebrow mt-1 flex items-center gap-1 text-info">
              Allied unit · <FactionLabel faction={alliedFaction} />
            </span>
          ) : null}
          {warlord || unit.wargear.length ? (
            // One run of wargear rather than a line each; a separator is held to the piece before it, so no line starts with a dot.
            <ul className="mt-0.5 w-full min-w-0 text-xs text-dim">
              {warlord ? (
                <li className="inline">
                  <span className="font-semibold text-parchment" title="Warlord">
                    <Crown className="mr-1 inline size-3.5 fill-current align-[-0.15em]" aria-hidden />
                    Warlord
                  </span>
                  {unit.wargear.length ? <span aria-hidden>{'\u00a0· '}</span> : null}
                </li>
              ) : null}
              {unit.wargear.map((piece, at) => (
                <li key={piece.name} className="inline">
                  {piece.count === 1 ? null : <span className="readout">{piece.count}x </span>}
                  {piece.name}
                  {at < unit.wargear.length - 1 ? <span aria-hidden>{'\u00a0· '}</span> : null}
                </li>
              ))}
            </ul>
          ) : null}
          {unit.enhancements.map((enhancement) => (
            <span key={enhancement} className="mt-0.5 block text-xs font-semibold text-achieved">
              <span className="sr-only">Enhancement: </span>
              <span>{enhancement}</span>
            </span>
          ))}
          {unit.upgrades.map((upgrade) => (
            <span key={upgrade} className="mt-0.5 block text-xs font-semibold text-achieved">
              <span className="sr-only">Upgrade: </span>
              <span>{upgrade}</span>
            </span>
          ))}
        </div>
        <span className="pointer-events-none relative z-10 flex shrink-0 items-center gap-0.5 [&_button]:pointer-events-auto">
          {tools}
          {unit.points === undefined ? null : <PointsChip points={unit.points} />}
          {hasActions ? (
            <span data-print-hide>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="-my-1 text-faint hover:text-bone"
                      aria-label={`Unit actions for ${unit.name}`}
                    />
                  }
                >
                  <EllipsisVertical />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className={MENU}>
                  <UnitActions parts={DROPDOWN_PARTS} {...actions} />
                </DropdownMenuContent>
              </DropdownMenu>
            </span>
          ) : null}
        </span>
      </div>

      {note ? (
        <div className={`${ROW} ph-no-capture pointer-events-none items-start gap-2`} data-unit-note>
          <span className="eyebrow shrink-0 text-dim">Note</span>
          <span className="min-w-0 flex-1 text-xs break-words whitespace-pre-line line-clamp-3 print:line-clamp-none">{note}</span>
        </div>
      ) : null}

      {looseRoleActions.map((row) => (
        <div key={row.label} className={`${ROW} pointer-events-none relative z-10 justify-end [&_button]:pointer-events-auto`}>
          <QuietAction onClick={row.onAct}>{row.action}</QuietAction>
        </div>
      ))}

      {rows.map((row) => (
        <JoinedRow key={`${row.label}-${row.name}`} row={row} editable={editable} />
      ))}

      {editable && (canJoin.length || canHost.length || canBoard.length || canCarry.length) ? (
        <div data-print-hide className={`${ROW} pointer-events-none relative z-10 flex-wrap gap-x-3 [&_button]:pointer-events-auto`}>
          {canJoin.length ? <AttachMenu label="Attach to unit" unit={unit.name} choices={canJoin} onChoose={onJoin} /> : null}
          {canHost.length ? <AttachMenu label="Attach unit" unit={unit.name} choices={canHost} onChoose={onHost} /> : null}
          {canBoard.length ? (
            <EmbarkMenu
              label="Embark in transport"
              unit={unit.name}
              choiceLabel={(choice) => `Embark ${unit.name} in ${choice.name}`}
              choices={canBoard}
              onChoose={onBoard}
            />
          ) : null}
          {canCarry.length ? (
            <EmbarkMenu
              label="Embark unit"
              unit={unit.name}
              choiceLabel={(choice) => `Embark ${choice.name} in ${unit.name}`}
              choices={canCarry}
              onChoose={onCarry}
            />
          ) : null}
        </div>
      ) : null}

      {/* A wider gap than the rows above it: two counters side by side put one's `+` next to the other's `-`. */}
      {status ? (
        <div
          data-print-hide
          data-unit-status
          className={`${ROW} pointer-events-none relative z-10 flex-wrap gap-x-4 gap-y-1.5 [&_button]:pointer-events-auto`}
        >
          {status}
        </div>
      ) : null}
    </>
  )

  if (!hasActions) {
    return (
      <div data-unit={unit.name} data-gate={gate} className={rowClassName}>
        {card}
      </div>
    )
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger render={<div data-unit={unit.name} data-gate={gate} className={rowClassName} />}>{card}</ContextMenuTrigger>
      <ContextMenuContent className={MENU}>
        <UnitActions parts={CONTEXT_PARTS} {...actions} />
      </ContextMenuContent>
    </ContextMenu>
  )
}

const noop = () => undefined
const NONE: never[] = []

/** A line under the unit's name: who it is standing with, or what can be done with it. */
const ROW = 'flex items-center -mt-1.5 pb-1.5'
const MENU = 'w-44'
/** A small outlined caps label naming the part a datasheet plays. */
const TAG = 'inline-block rounded-sm border border-edge px-1.5 text-xs leading-5 font-medium text-dim'

/** A text button that stays out of the way of the row it acts on. */
function QuietAction({ onClick, children }: { onClick?: () => void; children: ReactNode }) {
  return (
    <Button
      data-print-hide
      variant="ghost"
      size="xs"
      className="!px-1 text-xs text-dim hover:bg-transparent hover:text-bone"
      onClick={onClick}
    >
      {children}
    </Button>
  )
}

/** A row naming who a unit is joined to or riding with, and the button undoing it while the roster can be edited. */
export function JoinedRow({ row, editable }: { row: Joined; editable: boolean }) {
  return (
    <div className={`${ROW} pointer-events-none relative z-10 flex-wrap gap-x-2 [&_button]:pointer-events-auto`}>
      <span className={`${TAG} shrink-0`}>{row.label}</span>
      <span className="min-w-24 flex-1 text-xs break-words text-dim">{row.name}</span>
      {editable && row.action ? <QuietAction onClick={row.onAct}>{row.action}</QuietAction> : null}
    </div>
  )
}

export function AttachMenu({
  label,
  unit,
  choices,
  onChoose,
}: {
  label: string
  unit: string
  choices: AttachChoice[]
  onChoose: (choice: AttachChoice) => void
}) {
  const id = useId()
  const roster = choices.filter((choice) => choice.kind === 'roster')
  const added = choices.filter((choice) => choice.kind === 'new')
  return (
    <CardMenu label={label} unit={unit}>
      {roster.length ? (
        <DropdownMenuGroup>
          <DropdownMenuLabel>In this roster</DropdownMenuLabel>
          {roster.map((choice) => (
            <DropdownMenuItem key={choice.key} onClick={() => onChoose(choice)}>
              {choice.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      ) : null}
      {roster.length && added.length ? <DropdownMenuSeparator /> : null}
      {added.length ? (
        <DropdownMenuGroup>
          <DropdownMenuLabel>Add a new unit</DropdownMenuLabel>
          {added.map((choice) => (
            <DropdownMenuItem
              key={choice.entryId}
              aria-label={`Add new ${choice.name} and attach`}
              aria-describedby={choice.reason ? `${id}-${choice.entryId}` : undefined}
              disabled={Boolean(choice.reason)}
              className="items-start data-disabled:opacity-100"
              onClick={() => onChoose(choice)}
            >
              <Plus className={`mt-0.5 ${choice.reason ? 'text-faint' : 'text-info'}`} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className={choice.reason ? 'block text-faint' : 'block'}>{choice.name}</span>
                {choice.reason ? (
                  <span id={`${id}-${choice.entryId}`} className="mt-0.5 block text-2xs text-discarded">
                    {choice.reason}
                  </span>
                ) : null}
              </span>
              <PointsChip points={choice.points} over={choice.over} />
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      ) : null}
    </CardMenu>
  )
}

export function EmbarkMenu({
  label,
  unit,
  choiceLabel,
  choices,
  onChoose,
}: {
  label: string
  unit: string
  choiceLabel: (choice: EmbarkChoice) => string
  choices: EmbarkChoice[]
  onChoose: (choice: EmbarkChoice) => void
}) {
  const id = useId()
  return (
    <CardMenu label={label} unit={unit}>
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
            <span className={choice.reason ? 'block text-faint' : 'block'}>{choice.name}</span>
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

/** A quiet text action opening a menu of what the unit can be paired with, named by its visible label first so speech input can reach it. */
function CardMenu({ label, unit, children }: { label: string; unit: string; children: ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            data-print-hide
            variant="ghost"
            size="xs"
            className="-ml-1 !px-1 text-2xs text-faint hover:bg-transparent hover:text-bone aria-expanded:text-bone"
            aria-label={`${label}: ${unit}`}
          />
        }
      >
        <Plus className="size-3.5" aria-hidden />
        {label}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72 max-w-[calc(100vw-1rem)]">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
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
  editable,
  onDuplicate,
  canDuplicate,
  duplicateLimit,
  onSaveLoadout,
  onSaveAttachedUnit,
  onDetach,
  onReport,
  onRemove,
}: {
  parts: typeof DROPDOWN_PARTS | typeof CONTEXT_PARTS
  editable: boolean
  onDuplicate: () => void
  canDuplicate: boolean
  duplicateLimit: string | null
  onSaveLoadout?: () => void
  onSaveAttachedUnit?: () => void
  onDetach?: () => void
  onReport?: () => void
  onRemove: () => void
}) {
  const limitId = useId()
  const limit = canDuplicate ? null : duplicateLimit
  const saving = Boolean(onSaveLoadout || onSaveAttachedUnit)
  if (!editable)
    return (
      <>
        {onSaveLoadout ? (
          <Item onClick={onSaveLoadout}>
            <BookmarkPlus /> Save loadout
          </Item>
        ) : null}
        {onSaveAttachedUnit ? (
          <Item onClick={onSaveAttachedUnit}>
            <Users /> Save attached unit
          </Item>
        ) : null}
        {onReport ? (
          <>
            {saving ? <Separator /> : null}
            <Item onClick={onReport}>
              <MessageSquareWarning /> Something wrong?
            </Item>
          </>
        ) : null}
      </>
    )
  return (
    <>
      <Item
        className="items-start data-disabled:opacity-100"
        aria-label="Duplicate unit"
        disabled={!canDuplicate}
        aria-describedby={limit ? limitId : undefined}
        onClick={onDuplicate}
      >
        <Copy className={`mt-0.5 ${canDuplicate ? '' : 'text-faint'}`} />
        <span className="min-w-0 flex-1">
          <span className={canDuplicate ? 'block' : 'block text-faint'}>Duplicate unit</span>
          {limit ? (
            <span id={limitId} className="mt-0.5 block text-2xs text-discarded">
              {limit}
            </span>
          ) : null}
        </span>
      </Item>
      {saving ? <Separator /> : null}
      {onSaveLoadout ? (
        <Item onClick={onSaveLoadout}>
          <BookmarkPlus /> Save loadout
        </Item>
      ) : null}
      {onSaveAttachedUnit ? (
        <Item onClick={onSaveAttachedUnit}>
          <Users /> Save attached unit
        </Item>
      ) : null}
      {onDetach ? (
        <>
          <Separator />
          <Item onClick={onDetach}>
            <Unlink /> Detach from unit
          </Item>
        </>
      ) : null}
      {onReport ? (
        <>
          <Separator />
          <Item onClick={onReport}>
            <MessageSquareWarning /> Something wrong?
          </Item>
        </>
      ) : null}
      <Separator />
      <Item variant="destructive" onClick={onRemove}>
        <X /> Delete unit
      </Item>
    </>
  )
}
