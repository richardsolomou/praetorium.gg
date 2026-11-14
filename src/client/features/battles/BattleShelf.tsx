import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { EllipsisVertical, Eye, Trash2, Trophy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@/components/ui/context-menu'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { pointsLabel } from '../../../core/battle'
import { BATTLE_ENDINGS, sideLost, sideWon, viewerStage } from '../../battleStage'
import { deploymentName, summarySides, type SummarySide } from '../../battleSummary'
import { deploymentsQuery } from '../../queries'
import { useDateFormatting } from '../../dates'
import { FactionMark } from '../../components/FactionMark'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import { RatingChange } from '../../components/RatingChange'
import type { OnboardingTarget } from '../../onboardingTargets'
import type { Battle } from './battle'
import { SectionHeading } from '../../components/SectionHeading'
import { tint } from '../battle/battleTints'
import { battleColours } from '../../../core/playerColours'
import { BattleColoursProvider, PlayerTint } from '../battle/battleColours'
import { ContextMenuItem, DropdownMenuItem } from '../../components/Menu'

/**
 * One heading's worth of battles, a short card each: how it stands, who sits on each side
 * with what army, and each side's score in its colour.
 *
 * Both sides read the same way whichever seat the viewer holds, so a shelf can be scanned
 * without working out who was who; the viewer's own seat is marked instead. A finished game
 * the viewer sat in leads with how it went for them, the fold the leaderboard and profile
 * count, so the card cannot call a game differently from either.
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
  onboarding,
  onDelete,
  label,
  branched = true,
}: {
  title?: string
  name?: string
  battles: readonly Battle[]
  viewerId?: string
  onboarding?: OnboardingTarget
  onDelete?: (battle: Battle) => void
  /** What the battle was played for, leading its footer, where a page holds battles of more than one kind. */
  label?: (battle: Battle) => string
  /** Whether the battles hang off a runner; a shelf of one or two reads better without it. */
  branched?: boolean
}) {
  const { date } = useDateFormatting()
  const { data: deployments } = useQuery({ ...deploymentsQuery(), enabled: battles.some((battle) => battle.deploymentId !== null) })
  if (!battles.length) return null
  return (
    <section data-onboarding={onboarding} data-battle-shelf={name ?? ''}>
      {title ? <SectionHeading title={title} count={battles.length} /> : null}
      {/* Each battle hangs off the runner: a live one by a doubled gate, one still being set up by a dashed one. */}
      <div className={`${branched ? 'runner [--gate-y:2.125rem]' : 'grid'} gap-3 ${title ? 'mt-3' : ''}`}>
        {battles.map((battle) => {
          const canDelete = Boolean(viewerId && onDelete && battle.playerIds[0] === viewerId)
          const seat = viewerId ? battle.playerIds.indexOf(viewerId) : -1
          // Folded into sides rather than read seat by seat: an ally of a 2v1 sits second.
          const [ours, theirs] = summarySides(battle)
          const stage = viewerStage(battle, viewerId)
          const battlefield = deploymentName(battle.deploymentId, deployments)
          const setting = [
            ...(label ? [label(battle)] : []),
            ...(battle.settings.limit ? [pointsLabel(battle.settings.limit)] : []),
            ...(battle.settings.manual ? ['Manual tracking'] : battle.mission ? [battle.mission.name] : []),
            ...(battlefield ? [battlefield] : []),
            ...(battle.result?.reason && battle.result.reason !== 'completed' ? [BATTLE_ENDINGS[battle.result.reason]] : []),
          ].join(' · ')
          const colours = battleColours(
            [ours, theirs].flatMap((side) => side?.seats.map(({ player }) => ({ ...player, side: side.index })) ?? []),
          )
          const scored = battle.status !== 'setup'
          const a = ours?.score ?? 0
          const b = theirs?.score ?? 0
          const lost = (side?: SummarySide) => side !== undefined && sideLost(battle, side.index)
          const won = (side?: SummarySide) => side !== undefined && sideWon(battle, side.index)
          const faded = 'opacity-50'
          return (
            <BattleColoursProvider key={battle.token} value={colours?.players ?? NO_COLOURS}>
              <ContextMenu>
                <ContextMenuTrigger
                  render={
                    <article
                      data-gate={battle.status === 'playing' ? 'current' : battle.status === 'setup' ? 'pending' : undefined}
                      className="group part @container relative min-w-0 transition-colors hover:border-runner-hi hover:bg-raised"
                      style={colours?.variables}
                    />
                  }
                >
                  <Link
                    to="/battles/$token"
                    params={{ token: battle.token }}
                    aria-label={`${seat === -1 ? 'Watch' : 'Open'} ${battle.players.join(' versus ')}`}
                    className="block min-w-0"
                  >
                    <span className="grid min-w-0 items-center gap-3 px-4 pt-3 pb-2 @2xl:grid-cols-[minmax(0,1fr)_8.5rem_minmax(0,1fr)] @2xl:gap-4">
                      <Side
                        side={ours}
                        won={won(ours)}
                        viewerId={viewerId}
                        className={cn('order-2 @2xl:order-none', lost(ours) && faded)}
                      />
                      <span className="order-1 flex items-center justify-between gap-3 @2xl:order-none @2xl:flex-col @2xl:justify-center @2xl:gap-1.5">
                        {/* The stage in line form, so a shelf sorts by eye before the word is read: setup dashed, live doubled, over solid. */}
                        <span data-battle-status={battle.status} className={`chip gap-1.5 ${stage.tint}`}>
                          <span
                            aria-hidden
                            className="line-segment w-3.5 [--line-colour:currentColor]"
                            data-line={battle.status === 'setup' ? 'todo' : battle.status === 'playing' ? 'now' : 'done'}
                          />
                          {stage.name}
                        </span>
                        {/* Stacked sides in a narrow card have nothing between them for "vs" to stand for. */}
                        <span className={`figure text-3xl leading-none font-bold whitespace-nowrap ${scored ? '' : '@max-2xl:hidden'}`}>
                          {scored ? (
                            <>
                              <span className={cn('text-side-a', lost(ours) && faded)}>{a}</span>
                              <span className="px-1.5 text-xl text-faint">–</span>
                              <span className={cn('text-side-b', lost(theirs) && faded)}>{b}</span>
                            </>
                          ) : (
                            <span className="text-xl text-faint">vs</span>
                          )}
                        </span>
                        {battle.status === 'playing' ? (
                          <span className="text-2xs text-dim capitalize">
                            Round {battle.round} · {battle.phase}
                          </span>
                        ) : null}
                      </span>
                      <Side
                        side={theirs}
                        won={won(theirs)}
                        viewerId={viewerId}
                        mirrored
                        className={cn(
                          'order-3 @max-2xl:border-t @max-2xl:border-edge @max-2xl:pt-3 @2xl:order-none',
                          lost(theirs) && faded,
                        )}
                      />
                    </span>
                    <span
                      className={`flex min-w-0 items-center justify-between gap-3 pb-2.5 pl-4 text-2xs text-faint ${canDelete ? 'pr-10' : 'pr-4'}`}
                    >
                      <span className="truncate">{setting}</span>
                      <span className="shrink-0">{date(battle.lastActivity)}</span>
                    </span>
                  </Link>
                  {canDelete ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="absolute right-1 bottom-0 size-7 opacity-60 group-hover:opacity-100"
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

const NO_COLOURS = new Map()

/** Everyone at one side of the table, each with their army; the far side mirrors so both read towards the score. */
function Side({
  side,
  won,
  viewerId,
  mirrored = false,
  className,
}: {
  side?: SummarySide
  won: boolean
  viewerId?: string
  mirrored?: boolean
  className: string
}) {
  const seats = side?.seats ?? []
  return (
    <span className={cn('min-w-0 space-y-2', className)}>
      {seats.length ? (
        seats.map(({ player, army, faction, detachments, ratingChange }) => (
          <span
            key={player.id || player.name}
            className={`flex min-w-0 items-center gap-2.5 ${mirrored ? '@2xl:flex-row-reverse @2xl:text-right' : ''}`}
          >
            <PlayerAvatar name={player.name} image={player.image} className="size-8 shrink-0 text-2xs" />
            <span className="min-w-0">
              <span className={`flex min-w-0 items-baseline gap-1.5 ${mirrored ? '@2xl:flex-row-reverse' : ''}`}>
                <PlayerTint
                  playerId={player.id}
                  className={cn('truncate font-sans text-[0.9375rem] leading-tight font-bold', side && tint(side.index).text)}
                >
                  {player.name}
                </PlayerTint>
                {player.id === viewerId ? <span className="eyebrow shrink-0 text-parchment">You</span> : null}
                {won ? (
                  <span className="eyebrow flex shrink-0 items-center gap-1 self-center text-achieved">
                    <Trophy className="size-3" aria-hidden /> Winner
                  </span>
                ) : null}
                {ratingChange === null ? null : <RatingChange change={ratingChange} />}
              </span>
              <span className={`mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-dim ${mirrored ? '@2xl:flex-row-reverse' : ''}`}>
                {faction ? <FactionMark faction={faction} size="sm" /> : null}
                <span className="truncate">
                  {faction?.displayName ?? army ?? 'List not attached'}
                  {detachments.length ? <span className="text-faint"> · {detachments.join(' · ')}</span> : null}
                </span>
              </span>
            </span>
          </span>
        ))
      ) : (
        <span className={`block ${mirrored ? '@2xl:text-right' : ''}`}>
          <span className="block text-sm font-bold text-faint uppercase">Open seat</span>
          <span className="block text-xs text-faint">Waiting for an opponent</span>
        </span>
      )}
    </span>
  )
}
