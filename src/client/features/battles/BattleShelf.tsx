import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { EllipsisVertical, Eye, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@/components/ui/context-menu'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { buttonClass } from '../../components/buttonClass'
import { BATTLE_ROUNDS, pointsLabel } from '../../../core/battle'
import { battleEnding, sideLost, viewerStage } from '../../battleStage'
import { Armies, Names, StatusChip } from './BattleLines'
import { deploymentName, summarySides, type SummarySide } from '../../battleSummary'
import { deploymentsQuery } from '../../queries'
import { useDateFormatting } from '../../dates'
import { FactionMark } from '../../components/FactionMark'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import type { Battle } from './battle'
import { SectionHeading } from '../../components/SectionHeading'
import { tint } from '../battle/battleTints'
import { battleColours } from '../../../core/playerColours'
import { BattleColoursProvider, PlayerTint } from '../battle/battleColours'
import { ContextMenuItem, DropdownMenuItem } from '../../components/Menu'

/**
 * One heading's worth of battles, a hairline row each: how it stands, who played whom with
 * what army, and each side's score in its colour.
 *
 * A battle the viewer sat in reads from their side. A finished one leads with how it went
 * for them, the fold the leaderboard and profile count, so the row cannot call a game
 * differently from either.
 *
 * `title` is optional because a shelf that is already the whole of a named tab, or sits
 * under its page's own heading, would only repeat that name over itself; `name` then
 * still identifies the shelf.
 */
export function BattleShelf({
  title,
  name = title,
  battles,
  viewerId,
  onDelete,
  label,
  lead = false,
}: {
  title?: string
  name?: string
  battles: readonly Battle[]
  viewerId?: string
  onDelete?: (battle: Battle) => void
  /** What the battle was played for, leading its footer, where a page holds battles of more than one kind. */
  label?: (battle: Battle) => string
  /** Each battle as the wide plate a page leads with: the viewer's side on the left, the score large between, and the way back in. */
  lead?: boolean
}) {
  const { date } = useDateFormatting()
  const [idleBefore] = useState(() => Date.now() - IDLE_AFTER)
  const { data: deployments } = useQuery({ ...deploymentsQuery(), enabled: battles.some((battle) => battle.deploymentId !== null) })
  if (!battles.length) return null
  // Rows line up their scores whether or not each carries the actions menu.
  const menus = Boolean(viewerId && onDelete)
  return (
    <section data-battle-shelf={name ?? ''}>
      {title ? <SectionHeading title={title} count={battles.length} /> : null}
      <div className={lead ? 'grid gap-3' : '@container divide-y divide-edge border-y border-edge'}>
        {battles.map((battle) => {
          const canDelete = Boolean(viewerId && onDelete && battle.playerIds[0] === viewerId)
          // Folded into sides rather than read seat by seat: an ally of a 2v1 sits second.
          const sides = summarySides(battle)
          const [ours, theirs] = sides[1]?.seats.some(({ player }) => player.id === viewerId) ? [sides[1], sides[0]] : sides
          const stage = viewerStage(battle, viewerId)
          const battlefield = deploymentName(battle.deploymentId, deployments)
          // A row says only where the game is: the round and phase while it is played, otherwise what was played.
          const detail =
            battle.status === 'playing'
              ? `Round ${battle.round} · ${battle.phase.charAt(0).toUpperCase()}${battle.phase.slice(1)}`
              : [
                  ...(label ? [label(battle)] : []),
                  ...(battle.settings.manual ? ['Manual tracking'] : battle.mission ? [battle.mission.name] : []),
                  ...[battleEnding(battle.result?.reason)].filter((ending) => ending !== undefined),
                ].join(' · ')
          const colours = battleColours(
            [ours, theirs].flatMap((side) => side?.seats.map(({ player }) => ({ ...player, side: side.index })) ?? []),
          )
          const idle =
            battle.status !== 'finished' && Boolean(viewerId && battle.playerIds.includes(viewerId)) && battle.lastActivity < idleBefore
          const lost = (side?: SummarySide) => side !== undefined && sideLost(battle, side.index)
          const when = idle ? (
            <span data-battle-idle className="shrink-0 text-discarded">
              {date(battle.lastActivity)} · <span className="font-semibold">Resume</span>
            </span>
          ) : (
            <span className="shrink-0">{date(battle.lastActivity)}</span>
          )
          return (
            <BattleColoursProvider key={battle.token} value={colours?.players ?? NO_COLOURS}>
              <ContextMenu>
                <ContextMenuTrigger
                  render={
                    <article
                      data-gate={battle.status === 'playing' ? 'current' : battle.status === 'setup' ? 'pending' : undefined}
                      className={
                        lead
                          ? 'group relative min-w-0 part'
                          : cn('group relative min-w-0 transition-colors hover:bg-raised', battle.status === 'playing' && 'bg-raised/50')
                      }
                      style={colours?.variables}
                    />
                  }
                >
                  {lead ? (
                    <Plate
                      battle={battle}
                      sides={[ours, theirs]}
                      viewerId={viewerId}
                      when={date(battle.lastActivity)}
                      idle={idle}
                      setting={[
                        ...(label ? [label(battle)] : []),
                        ...(battle.settings.limit && battle.mission && !battle.settings.manual ? [pointsLabel(battle.settings.limit)] : []),
                        ...(battle.settings.manual ? ['Manual tracking'] : []),
                        ...(battlefield ? [battlefield] : []),
                        ...[battleEnding(battle.result?.reason)].filter((ending) => ending !== undefined),
                      ]}
                      reserveMenu={canDelete}
                    />
                  ) : (
                    <Link
                      to="/battles/$token"
                      params={{ token: battle.token }}
                      data-battle-status={battle.status}
                      className={cn(
                        'grid min-h-16 min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-3 pl-2 @2xl:grid-cols-[4.75rem_minmax(0,1fr)_auto_14rem] @2xl:gap-x-4',
                        menus ? 'pr-9' : 'pr-2',
                      )}
                    >
                      {/*
                       * Explicit grid lines throughout: a span utility at a breakpoint resets the start line it sat beside.
                       * A narrow row gives the names the width and says the outcome in its last line instead.
                       */}
                      <span className="hidden @2xl:col-[1] @2xl:row-[1/3] @2xl:block">
                        <StatusChip name={stage.name} className={stage.tint} />
                      </span>
                      <span className="col-[1] row-[1] text-[0.9375rem] leading-snug [overflow-wrap:anywhere] @2xl:col-[2] @2xl:truncate @2xl:leading-tight">
                        <Names battle={battle} side={ours} ratings />
                        <span className="text-faint"> vs </span>
                        <Names battle={battle} side={theirs} ratings />
                      </span>
                      {battle.status === 'setup' ? null : (
                        <span className="figure col-[2] row-[1] text-xl leading-none whitespace-nowrap @2xl:col-[3] @2xl:row-[1/3] @2xl:text-3xl">
                          <Score side={ours} lost={lost(ours)} />
                          <span className="px-1 text-base text-faint @2xl:text-xl">–</span>
                          <Score side={theirs} lost={lost(theirs)} />
                        </span>
                      )}
                      <span className="col-[1/3] row-[2] truncate text-2xs text-dim @2xl:col-[2]">
                        <Armies side={ours} />
                        <span className="text-faint"> vs </span>
                        <Armies side={theirs} />
                      </span>
                      <span className="col-[1/3] row-[3] flex min-w-0 text-2xs text-faint @2xl:hidden">
                        <span className={cn("shrink-0 font-medium after:px-[0.25em] after:text-faint after:content-['·']", stage.tint)}>
                          {stage.name}
                        </span>
                        {detail ? <span className="truncate">{detail}</span> : null}
                        <span className={cn('flex shrink-0', detail && "before:px-[0.25em] before:content-['·']")}>{when}</span>
                      </span>
                      <span className="col-[4] row-[1/3] hidden text-right text-2xs text-faint @2xl:block">
                        {detail ? <span className="block truncate text-dim">{detail}</span> : null}
                        <span className="flex justify-end">{when}</span>
                      </span>
                    </Link>
                  )}
                  {canDelete ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className={cn(
                              'absolute right-1 size-7 opacity-60 group-hover:opacity-100',
                              lead ? 'bottom-0' : 'top-1/2 -translate-y-1/2',
                            )}
                            aria-label={`Actions for ${battle.players.join(' versus ')}`}
                          />
                        }
                      >
                        <EllipsisVertical />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem variant="destructive" onClick={() => onDelete?.(battle)}>
                          <Trash2 /> Delete battle
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem render={<Link to="/battles/$token" params={{ token: battle.token }} />}>
                    <Eye /> Open battle
                  </ContextMenuItem>
                  {canDelete ? (
                    <ContextMenuItem variant="destructive" onClick={() => onDelete?.(battle)}>
                      <Trash2 /> Delete battle
                    </ContextMenuItem>
                  ) : null}
                </ContextMenuContent>
              </ContextMenu>
            </BattleColoursProvider>
          )
        })}
      </div>
    </section>
  )
}

/** How long a game the viewer sits in goes untouched before its card asks them back to it. */
const IDLE_AFTER = 3 * 24 * 60 * 60 * 1_000

const NO_COLOURS = new Map()
const FADED = 'opacity-50'

/** The stage as a mark in the result tile's place, so a list sorts by eye: setup a ring, live a dot, over a bar. */
/** A side's score in its colour, faded when it lost. */
function Score({ side, lost }: { side?: SummarySide; lost: boolean }) {
  return <span className={cn(side && tint(side.index).score, lost && FADED)}>{side?.score ?? 0}</span>
}

/**
 * One battle as the wide plate a page leads with: the viewer's side on the left whatever seat they took, the score
 * large between the sides in their colours, how far the game has got, and the way back into it.
 */
function Plate({
  battle,
  sides,
  viewerId,
  when,
  idle,
  setting,
  reserveMenu,
}: {
  battle: Battle
  sides: (SummarySide | undefined)[]
  viewerId?: string
  when: string
  idle: boolean
  setting: string[]
  reserveMenu: boolean
}) {
  const [left, right] = sides[1]?.seats.some(({ player }) => player.id === viewerId) ? [sides[1], sides[0]] : [sides[0], sides[1]]
  const headline =
    !battle.settings.manual && battle.mission ? battle.mission.name : battle.settings.limit ? pointsLabel(battle.settings.limit) : null
  const playing = battle.status === 'playing'
  return (
    <Link to="/battles/$token" params={{ token: battle.token }} className="@container block min-w-0">
      <span className="grid min-w-0 grid-cols-2 items-center gap-x-4 gap-y-4 px-5 py-5 @2xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] @2xl:gap-x-8 @2xl:px-8 @2xl:py-6">
        <span className="col-span-2 flex min-w-0 flex-col items-center gap-1.5 text-center @2xl:col-span-1 @2xl:col-start-2 @2xl:row-start-1">
          <span data-battle-status={battle.status} className={`eyebrow max-w-full truncate ${playing ? '' : 'text-discarded'}`}>
            {[viewerStage(battle, viewerId).name, headline].filter(Boolean).join(' · ')}
          </span>
          <span className="figure text-6xl leading-none whitespace-nowrap @2xl:text-[5.5rem]">
            {battle.status === 'setup' ? (
              <span className="text-4xl text-faint @2xl:text-6xl">vs</span>
            ) : (
              <>
                <span className={left && tint(left.index).score}>{left?.score ?? 0}</span>
                <span className="px-2 text-faint @2xl:px-3">–</span>
                <span className={right && tint(right.index).score}>{right?.score ?? 0}</span>
              </>
            )}
          </span>
          {playing ? (
            <span className="text-sm text-dim">
              Round {battle.round} of {BATTLE_ROUNDS} · {battle.phase.charAt(0).toUpperCase()}
              {battle.phase.slice(1)} phase
            </span>
          ) : null}
          <span className="text-2xs text-faint">
            {[...setting, ...(idle ? [] : [when])].join(' · ')}
            {idle ? (
              <span data-battle-idle className="text-discarded">
                {setting.length ? ' · ' : ''}
                {when}
              </span>
            ) : null}
          </span>
        </span>
        <PlateSide side={left} viewerId={viewerId} className="@2xl:col-start-1 @2xl:row-span-2 @2xl:row-start-1" />
        <PlateSide side={right} viewerId={viewerId} mirrored className="@2xl:col-start-3 @2xl:row-span-2 @2xl:row-start-1" />
        <span className={`col-span-2 flex justify-center @2xl:col-span-1 @2xl:col-start-2 @2xl:row-start-2 ${reserveMenu ? 'px-8' : ''}`}>
          <span className={buttonClass({ className: 'w-full @2xl:w-auto' })}>{playing ? 'Resume battle' : 'Continue setup'}</span>
        </span>
      </span>
    </Link>
  )
}

/** One side of a plate: each player's name large in their colour over the army they brought. */
function PlateSide({
  side,
  viewerId,
  mirrored = false,
  className,
}: {
  side?: SummarySide
  viewerId?: string
  mirrored?: boolean
  className?: string
}) {
  const seats = side?.seats ?? []
  return (
    <span className={cn('min-w-0 space-y-3 self-start @2xl:self-center', mirrored && 'text-right', className)}>
      {seats.length ? (
        seats.map(({ player, army, faction, detachments }) => (
          <span key={player.id || player.name} className="block min-w-0">
            <span className={cn('flex min-w-0 items-center gap-2', mirrored && 'flex-row-reverse')}>
              <PlayerAvatar name={player.name} image={player.image} className="size-8 text-xs @2xl:size-10 @2xl:text-sm" />
              <PlayerTint
                playerId={player.id}
                className={cn(
                  'truncate font-display text-[1.375rem] leading-tight font-bold @2xl:text-[2rem]',
                  side && tint(side.index).text,
                )}
              >
                {player.name}
              </PlayerTint>
              {player.id === viewerId ? <span className="eyebrow shrink-0 @max-2xl:hidden">You</span> : null}
            </span>
            <span className={cn('mt-1 flex min-w-0 items-center gap-1.5 text-sm text-dim @2xl:text-base', mirrored && 'flex-row-reverse')}>
              {faction ? <FactionMark faction={faction} size="sm" /> : null}
              <span className="line-clamp-2 @2xl:truncate">
                {faction?.displayName ?? army ?? 'List not attached'}
                {detachments.length ? <span className="text-faint"> · {detachments.join(' · ')}</span> : null}
              </span>
            </span>
          </span>
        ))
      ) : (
        <span className="block">
          <span className="block font-display text-2xl font-bold text-faint">Open seat</span>
          <span className="block text-sm text-faint">Waiting for an opponent</span>
        </span>
      )}
    </span>
  )
}
