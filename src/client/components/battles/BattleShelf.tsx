import { Link } from '@tanstack/react-router'
import { EllipsisVertical, Eye, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { battleStage } from '../../battleStage'
import { summarySides } from '../../battleSummary'
import { formatDate } from '../../dates'
import { FactionMark } from '../FactionMark'
import { PlayerAvatar } from '../PlayerAvatar'
import type { Battle } from './battle'

/**
 * One heading's worth of battles, as a row per game.
 *
 * Both sides read the same way whichever seat the viewer holds, so a shelf of
 * finished games can be scanned without working out who was who each time.
 *
 * `title` is optional because a shelf that is already the whole of a named tab
 * would only repeat that name over itself.
 */
export function BattleShelf({
  title,
  battles,
  viewerId,
  onDelete,
}: {
  title?: string
  battles: Battle[]
  viewerId?: string
  onDelete?: (battle: Battle) => void
}) {
  if (!battles.length) return null
  return (
    <section data-battle-shelf={title ?? ''}>
      {title ? (
        <p className="rubric flex items-baseline justify-between border-b border-edge pb-2">
          <span>{title}</span>
          <span className="readout">{battles.length}</span>
        </p>
      ) : null}
      <div className={`space-y-3 ${title ? 'mt-2' : ''}`}>
        {battles.map((battle) => {
          const canDelete = Boolean(viewerId && onDelete && battle.playerIds[0] === viewerId)
          // Folded into sides rather than read seat by seat: an ally of a 2v1 sits second.
          const [ours, theirs] = summarySides(battle)
          const label = battle.players.join(' versus ')
          const actions = (
            <>
              <DropdownMenuItem render={<Link to="/battles/$token" params={{ token: battle.token }} />}>
                <Eye /> Open battle
              </DropdownMenuItem>
              {canDelete ? (
                <DropdownMenuItem variant="destructive" onClick={() => onDelete?.(battle)}>
                  <Trash2 /> Delete battle
                </DropdownMenuItem>
              ) : null}
            </>
          )
          return (
            <ContextMenu key={battle.token}>
              <ContextMenuTrigger render={<article className="relative border border-edge bg-panel hover:border-edge-strong" />}>
                <Link
                  to="/battles/$token"
                  params={{ token: battle.token }}
                  className="flex min-w-0 flex-col gap-2 p-3 sm:grid sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center sm:gap-3 sm:pr-10"
                >
                  <span className="border-b border-edge pb-2 text-center sm:order-2 sm:border-0 sm:pb-0">
                    <span className={`chip ${battleStage(battle.status).tint}`}>{battleStage(battle.status).name}</span>
                    <span className="mt-1 block text-xs text-dim">
                      {battle.status === 'playing' ? `Round ${battle.round} · ${battle.phase} phase` : formatDate(battle.lastActivity)}
                    </span>
                    <span className="mt-1 block text-[0.625rem] text-faint">
                      {battle.settings.limit ? `${battle.settings.limit} pts` : 'Legacy format'}
                      {battle.mission ? ` · ${battle.mission.name}` : ''}
                      {battle.deploymentId ? ` · ${battle.deploymentId.replaceAll('-', ' ')}` : ''}
                      {battle.result?.reason ? ` · ${battle.result.reason.replaceAll('-', ' ')}` : ''}
                    </span>
                  </span>
                  <BattleSide seats={ours?.seats ?? []} score={ours?.score ?? 0} side="a" className="sm:order-1" />
                  <BattleSide
                    seats={theirs?.seats ?? []}
                    score={theirs?.score ?? 0}
                    side="b"
                    emptyLabel="Open seat"
                    emptyArmy="Waiting for an opponent"
                    className="sm:order-3"
                  />
                </Link>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="absolute top-2 right-2 sm:top-1/2 sm:-translate-y-1/2"
                        aria-label={`Actions for ${label}`}
                      />
                    }
                  >
                    <EllipsisVertical />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="rounded-none border border-edge bg-panel text-bone">
                    {actions}
                  </DropdownMenuContent>
                </DropdownMenu>
              </ContextMenuTrigger>
              <ContextMenuContent className="rounded-none border border-edge bg-panel text-bone">
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
          )
        })}
      </div>
    </section>
  )
}

function BattleSide({
  seats,
  score,
  side,
  emptyLabel = 'Open seat',
  emptyArmy = 'Waiting for an opponent',
  className = '',
}: {
  seats: {
    player: { id: string; name: string; image: string | null }
    army: string | null
    faction: { slug: string; displayName: string; icon: string | null } | null
    detachments: string[]
  }[]
  score?: number
  side: 'a' | 'b'
  emptyLabel?: string
  emptyArmy?: string
  className?: string
}) {
  const waiting = !seats.length
  return (
    <span className={`flex min-w-0 items-center gap-3 ${side === 'b' ? 'sm:justify-end' : ''} ${className}`}>
      <span className="min-w-0 flex-1 sm:flex-initial">
        {waiting ? (
          <>
            <span className="block truncate font-bold uppercase">{emptyLabel}</span>
            <span className="block truncate text-xs text-dim">{emptyArmy}</span>
          </>
        ) : (
          <>
            <span className="flex min-w-0 items-center gap-2">
              <span className="flex shrink-0 -space-x-2">
                {seats.map(({ player }) => (
                  <PlayerAvatar
                    key={player.id || player.name}
                    name={player.name}
                    image={player.image}
                    className="size-7 border-2 border-panel text-[0.5625rem]"
                  />
                ))}
              </span>
              <span className="min-w-0 truncate font-bold uppercase">{seats.map(({ player }) => player.name).join(' & ')}</span>
            </span>
            {seats.map(({ player, army, faction, detachments }) => (
              <span key={player.id || player.name} className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-dim">
                {faction ? <FactionMark id={faction.slug} icon={faction.icon} size="sm" /> : null}
                <span className="truncate">
                  {faction?.displayName ?? army ?? 'List not attached'}
                  {detachments.length ? <span className="text-faint"> · {detachments.join(' · ')}</span> : null}
                </span>
              </span>
            ))}
          </>
        )}
      </span>
      <span className={`readout shrink-0 text-2xl ${side === 'a' ? 'text-side-a' : 'text-side-b'}`}>{score ?? 0}</span>
    </span>
  )
}
