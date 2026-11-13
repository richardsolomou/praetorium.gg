import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, Navigate, useNavigate } from '@tanstack/react-router'
import { Check, Swords, UserRound } from 'lucide-react'
import { Fragment, useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { buttonClass } from '../../components/buttonClass'
import { FullPageState } from '../../components/PageState'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import { Problem } from '../../components/Problem'
import { joinBattle } from '../../functions'
import { battleInvitationQuery, meQuery } from '../../queries'
import { battleSizeTitle } from '../../../core/battle'
import { battleInvitePath } from '../../../core/notifications'
import { tint } from '../battle/battleTints'
import { CHOSEN } from '../battle/setup/chrome'

type Side = 0 | 1
const SIDES = [0, 1] as const

/**
 * Where a battle's link lands: who invited you and to what, then an account joins an open place, choosing the side
 * when both have one. A visitor signs in or up first and is joined on the side they chose as soon as they are back.
 */
export function JoinBattle({ invite, side: returning }: { invite: string; side?: Side }) {
  const { data: invitation } = useQuery(battleInvitationQuery(invite))
  const { data: me } = useQuery(meQuery())
  const navigate = useNavigate()
  const join = useMutation({
    mutationFn: (side: Side) => joinBattle({ data: { invite, side } }),
    onSuccess: ({ token }) => navigate({ to: '/battles/$token', params: { token }, replace: true }),
  })
  const sides = invitation ? SIDES.filter((side) => invitation.open[side] > 0) : []
  const [chosen, setChosen] = useState<Side | null>(null)
  const side = sides.length === 1 ? sides[0]! : (chosen ?? (returning !== undefined && sides.includes(returning) ? returning : null))
  // Back from signing in with a side already chosen, so the join the visitor asked for happens without asking again.
  const rejoin = Boolean(
    me && invitation && !invitation.token && !invitation.started && returning !== undefined && invitation.open[returning],
  )
  const { isIdle, mutate } = join
  useEffect(() => {
    if (rejoin && isIdle && returning !== undefined) mutate(returning)
  }, [rejoin, isIdle, mutate, returning])
  if (!invitation) return null
  if (invitation.token) return <Navigate to="/battles/$token" params={{ token: invitation.token }} replace />
  const host = invitation.hostName ?? 'A player'
  if (invitation.started || !sides.length)
    return (
      <FullPageState
        headingLevel={1}
        title="Everyone has joined"
        explanation={`${host}’s battle has no open places left. Ask them to add a place for you.`}
        icon={Swords}
      />
    )
  const size = invitation.limit === null ? null : battleSizeTitle(invitation.limit)
  const next = side === null ? battleInvitePath(invite) : `${battleInvitePath(invite)}?side=${side}`

  return (
    <main className="flex w-full flex-col">
      <div className="mx-auto w-full max-w-5xl px-3 pt-4 pb-10 sm:px-4 sm:pt-6">
        <header className="relative space-y-4 pb-2 sm:space-y-5">
          <div aria-hidden className="construction-grid -inset-x-3 -top-6 sm:-inset-x-4" />
          <div className="relative space-y-1.5">
            <h1 className="text-2xl text-balance sm:text-3xl">Join the battle</h1>
            <p className="max-w-prose text-sm text-dim sm:text-base">
              {host} invited you to {size && size !== 'Battle' ? `${/^[AEIOU]/.test(size) ? 'an' : 'a'} ${size} battle` : 'a battle'}
              {invitation.armyPoints ? `, ${invitation.armyPoints.toLocaleString('en')} points an army` : ''}.
              {sides.length > 1 ? ' Choose who you play with.' : ''}
            </p>
          </div>
          <div className="relative grid grid-cols-[minmax(0,1fr)_2rem_minmax(0,1fr)] items-stretch sm:grid-cols-[minmax(0,1fr)_3rem_minmax(0,1fr)]">
            {SIDES.map((index) => (
              <Fragment key={index}>
                {index ? (
                  <span aria-hidden className="grid place-items-center font-display text-sm font-bold text-faint sm:text-lg">
                    VS
                  </span>
                ) : null}
                <div
                  data-join-side={index}
                  className={cn(
                    'part flex min-w-0 flex-col gap-1.5 border-t-2 p-3 sm:p-4',
                    tint(index).edge,
                    index && 'items-end text-right',
                  )}
                >
                  {invitation.sides[index]!.map((player) => (
                    <Fragment key={player.name}>
                      <p className={cn('inline-flex min-w-0 items-center gap-1.5 text-sm font-bold uppercase', tint(index).text)}>
                        <PlayerAvatar name={player.name} image={player.image} className="size-6 text-xs" />
                        <span className="break-words">{player.name}</span>
                      </p>
                      <span
                        className={cn(
                          'max-w-full font-display text-base leading-tight font-bold break-words uppercase sm:text-2xl',
                          !player.army && 'text-dim',
                        )}
                      >
                        {player.army?.name ?? 'No army yet'}
                      </span>
                      {player.army?.points ? (
                        <span className="figure text-xs text-dim">{player.army.points.toLocaleString('en')} pts</span>
                      ) : null}
                    </Fragment>
                  ))}
                  {Array.from({ length: invitation.open[index] }, (_, at) => {
                    const yours = side === index && at === 0
                    // Only an account can take the place, so a visitor sees it as the one they will take once signed in.
                    const taken = yours && Boolean(me)
                    return (
                      <button
                        key={at}
                        type="button"
                        aria-pressed={yours}
                        disabled={sides.length === 1}
                        className={cn(
                          'flex min-h-11 w-full min-w-0 items-center gap-1.5 rounded-lg border px-2.5 py-2 text-sm font-bold uppercase transition-colors',
                          index && 'flex-row-reverse text-right',
                          yours
                            ? cn(CHOSEN, tint(index).text)
                            : 'border-dashed border-runner-hi text-dim enabled:hover:border-parchment/60',
                        )}
                        onClick={() => setChosen(index)}
                      >
                        {taken ? (
                          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-parchment text-parchment-ink">
                            <Check className="size-3.5" strokeWidth={3} aria-hidden />
                          </span>
                        ) : (
                          <span
                            aria-hidden
                            className="grid size-6 shrink-0 place-items-center rounded-full border border-dashed border-runner-hi"
                          >
                            <UserRound className="size-3.5" />
                          </span>
                        )}
                        <span className="min-w-0">{taken ? 'You' : yours ? 'Your place' : 'Open'}</span>
                      </button>
                    )
                  })}
                </div>
              </Fragment>
            ))}
          </div>
        </header>

        <section className="mt-4 max-w-xl space-y-3 rounded-2xl border-2 border-runner bg-panel p-3 shadow-lifted sm:mt-6 sm:p-4">
          {me ? (
            <>
              <p className="flex items-center gap-2 text-sm">
                <PlayerAvatar name={me.name} image={me.image ?? null} className="size-6 text-xs" />
                <span>
                  Joining as <span className="font-bold">{me.name}</span>
                </span>
              </p>
              <Button
                className="h-11 w-full text-base"
                disabled={side === null || join.isPending}
                onClick={() => side !== null && join.mutate(side)}
              >
                {join.isPending ? 'Joining…' : side === null ? 'Choose a side first' : 'Join the battle'}
              </Button>
              {join.error ? <Problem error={join.error} /> : null}
              <p className="text-xs text-pretty text-dim">The battle goes in your record, and you bring one of your saved rosters.</p>
            </>
          ) : (
            <>
              <p className="text-sm text-pretty">
                Battles are between two accounts, so the result goes in both records and on the leaderboard.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Link
                  to="/sign-in"
                  search={{ next, join: true }}
                  aria-disabled={side === null || undefined}
                  className={cn(buttonClass({ className: 'h-11 text-base' }), side === null && 'pointer-events-none opacity-50')}
                >
                  {side === null ? 'Choose a side first' : 'Sign up to join'}
                </Link>
                <Link
                  to="/sign-in"
                  search={{ next }}
                  aria-disabled={side === null || undefined}
                  className={cn(
                    buttonClass({ variant: 'outline', className: 'h-11 text-base' }),
                    side === null && 'pointer-events-none opacity-50',
                  )}
                >
                  Sign in to join
                </Link>
              </div>
              <p className="text-xs text-pretty text-dim">
                You join as soon as you’re signed in. A list you built on this device without an account comes with you.
              </p>
            </>
          )}
        </section>

        <p className="mt-6 max-w-xl text-sm text-pretty text-dim">
          Then you land on the same setup page as {host}: choose your army, and either of you can set the mission and everything after it.
        </p>
      </div>
    </main>
  )
}
