import { Link } from '@tanstack/react-router'
import { EllipsisVertical, Eye, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { battleStage } from '../../battleStage'
import { summarySides } from '../../battleSummary'
import { useDateFormatting } from '../../dates'
import { FactionMark } from '../../components/FactionMark'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import type { OnboardingTarget } from '../onboarding/onboarding'
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
  onboarding,
  onDelete,
}: {
  title?: string
  battles: Battle[]
  viewerId?: string
  onboarding?: OnboardingTarget
  onDelete?: (battle: Battle) => void
}) {
  const { date } = useDateFormatting()
  if (!battles.length) return null
  return (
    <section className="mx-auto max-w-[88rem]" data-onboarding={onboarding} data-battle-shelf={title ?? ''}>
      {title ? (
        <p className="rubric flex items-baseline justify-between border-b border-edge pb-2">
          <span>{title}</span>
          <span className="readout">{battles.length}</span>
        </p>
      ) : null}
      <div className={`grid items-stretch gap-3 lg:grid-cols-2 ${title ? 'mt-2' : ''}`}>
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
              <ContextMenuTrigger
                render={<article className="relative h-full min-w-0 border border-edge bg-panel hover:border-edge-strong" />}
              >
                <Link to="/battles/$token" params={{ token: battle.token }} className="flex h-full min-w-0 flex-col gap-2 p-3">
                  <span className="border-b border-edge pb-2 text-center">
                    <span className={`chip ${battleStage(battle.status).tint}`}>{battleStage(battle.status).name}</span>
                    <span className="mt-1 block text-xs text-dim">
                      {battle.status === 'playing'
                        ? `Round ${battle.round} · ${battle.phase} phase · ${date(battle.lastActivity)}`
                        : date(battle.lastActivity)}
                    </span>
                    <span className="mt-1 block text-3xs text-faint">
                      {battle.settings.limit ? `${battle.settings.limit} pts` : 'Legacy format'}
                      {battle.mission ? ` · ${battle.mission.name}` : ''}
                      {battle.deploymentId ? ` · ${battle.deploymentId.replaceAll('-', ' ')}` : ''}
                      {battle.result?.reason ? ` · ${battle.result.reason.replaceAll('-', ' ')}` : ''}
                    </span>
                  </span>
                  <BattleSide seats={ours?.seats ?? []} score={ours?.score ?? 0} side="a" />
                  <BattleSide
                    seats={theirs?.seats ?? []}
                    score={theirs?.score ?? 0}
                    side="b"
                    emptyLabel="Open seat"
                    emptyArmy="Waiting for an opponent"
                  />
                </Link>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button variant="ghost" size="icon-sm" className="absolute top-2 right-2" aria-label={`Actions for ${label}`} />
                    }
                  >
                    <EllipsisVertical />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">{actions}</DropdownMenuContent>
                </DropdownMenu>
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
}) {
  const waiting = !seats.length
  return (
    <span className="flex min-w-0 items-center gap-3">
      <span className="min-w-0 flex-1">
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
                    className="size-7 border-2 border-panel text-3xs"
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
