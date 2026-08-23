import { Link } from '@tanstack/react-router'
import { EllipsisVertical, Eye, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { summarySides } from '../../battleSummary'
import { formatDate } from '../../dates'
import type { Battle } from './battle'

/**
 * One heading's worth of battles, as a row per game.
 *
 * Both sides read the same way whichever seat the viewer holds, so a shelf of
 * finished games can be scanned without working out who was who each time.
 */
export function BattleShelf({
  title,
  battles,
  viewerId,
  onDelete,
}: {
  title: string
  battles: Battle[]
  viewerId: string
  onDelete: (battle: Battle) => void
}) {
  if (!battles.length) return null
  return (
    <section data-battle-shelf={title}>
      <p className="rubric flex items-baseline justify-between border-b border-edge pb-2">
        <span>{title}</span>
        <span className="readout">{battles.length}</span>
      </p>
      <div className="mt-2 space-y-2">
        {battles.map((battle) => {
          const canDelete = battle.playerIds[0] === viewerId
          // Folded into sides rather than read seat by seat: an ally of a 2v1 sits second.
          const [ours, theirs] = summarySides(battle)
          const label = battle.players.join(' versus ')
          const actions = (
            <>
              <DropdownMenuItem render={<Link to="/battles/$token" params={{ token: battle.token }} />}>
                <Eye /> Open battle
              </DropdownMenuItem>
              {canDelete ? (
                <DropdownMenuItem variant="destructive" onClick={() => onDelete(battle)}>
                  <Trash2 /> Delete battle
                </DropdownMenuItem>
              ) : null}
            </>
          )
          return (
            <ContextMenu key={battle.token}>
              <ContextMenuTrigger render={<article className="flex items-center border border-edge bg-panel hover:border-edge-strong" />}>
                <Link
                  to="/battles/$token"
                  params={{ token: battle.token }}
                  className="grid min-w-0 flex-1 grid-cols-2 items-center gap-x-3 gap-y-2 p-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:gap-3"
                >
                  <BattleSide
                    player={ours?.players.join(' & ')}
                    army={ours?.armies.join(' & ') || null}
                    detachments={ours?.detachments ?? []}
                    score={ours?.score ?? 0}
                    side="a"
                  />
                  <span className="col-span-2 row-start-1 border-b border-edge pb-2 text-center sm:col-span-1 sm:col-start-2 sm:row-start-auto sm:border-0 sm:pb-0">
                    <span className="eyebrow block">{battle.status === 'playing' ? `Round ${battle.round}` : battle.status}</span>
                    <span className="block text-xs text-dim">
                      {battle.status === 'playing' ? `${battle.phase} phase · ` : ''}
                      {formatDate(battle.lastActivity)}
                    </span>
                    <span className="mt-1 block text-[0.625rem] text-faint">
                      {battle.settings.limit ? `${battle.settings.limit} pts` : 'Legacy format'}
                      {battle.mission ? ` · ${battle.mission.name}` : ''}
                      {battle.deploymentId ? ` · ${battle.deploymentId.replaceAll('-', ' ')}` : ''}
                      {battle.result?.reason ? ` · ${battle.result.reason.replaceAll('-', ' ')}` : ''}
                    </span>
                  </span>
                  <BattleSide
                    player={theirs?.players.join(' & ') || undefined}
                    army={theirs?.armies.join(' & ') || null}
                    detachments={theirs?.detachments ?? []}
                    score={theirs?.score ?? 0}
                    side="b"
                    emptyLabel="Open seat"
                    emptyArmy="Waiting for an opponent"
                  />
                </Link>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={<Button variant="ghost" size="icon-sm" className="mr-2" aria-label={`Actions for ${label}`} />}
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
                  <ContextMenuItem variant="destructive" onClick={() => onDelete(battle)}>
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
  player,
  army,
  detachments,
  score,
  side,
  emptyLabel = 'Open seat',
  emptyArmy = 'Waiting for an opponent',
}: {
  player?: string
  army?: string | null
  detachments?: string[]
  score?: number
  side: 'a' | 'b'
  emptyLabel?: string
  emptyArmy?: string
}) {
  const waiting = !player
  return (
    <span className={`min-w-0 ${side === 'b' ? 'text-right' : ''}`}>
      <span className={`readout block text-2xl ${side === 'a' ? 'text-side-a' : 'text-side-b'}`}>{score ?? 0}</span>
      <span className="block truncate font-bold uppercase">{player ?? emptyLabel}</span>
      <span className="block truncate text-xs text-dim">{army ?? (waiting ? emptyArmy : 'List not attached')}</span>
      {detachments?.length ? <span className="block truncate text-[0.625rem] text-faint">{detachments.join(' · ')}</span> : null}
    </span>
  )
}
