import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, Navigate, useNavigate } from '@tanstack/react-router'
import { Swords } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { buttonClass } from '../../components/buttonClass'
import { FullPageState } from '../../components/PageState'
import { Problem } from '../../components/Problem'
import { joinBattle } from '../../functions'
import { battleInvitationQuery, meQuery } from '../../queries'
import { battleInvitePath } from '../../../core/notifications'

/** Where a battle's link lands: an account takes an open place, choosing the side when both have one. */
export function JoinBattle({ invite }: { invite: string }) {
  const { data: invitation } = useQuery(battleInvitationQuery(invite))
  const { data: me } = useQuery(meQuery())
  const navigate = useNavigate()
  const join = useMutation({
    mutationFn: (side: 0 | 1) => joinBattle({ data: { invite, side } }),
    onSuccess: ({ token }) => navigate({ to: '/battles/$token', params: { token }, replace: true }),
  })
  const sides = invitation ? ([0, 1] as const).filter((side) => invitation.open[side] > 0) : []
  const [chosen, setChosen] = useState<0 | 1 | null>(null)
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
  const next = battleInvitePath(invite)
  if (!me)
    return (
      <FullPageState
        headingLevel={1}
        title={`Join ${host}’s battle`}
        explanation="Sign in to join. Your account keeps your army and the result of the battle."
        icon={Swords}
        action={
          <div className="grid w-full gap-2">
            <Link to="/sign-in" search={{ next, join: true }} className={buttonClass({ className: 'h-11 w-full text-base' })}>
              Create an account
            </Link>
            <Link to="/sign-in" search={{ next }} className={buttonClass({ variant: 'ghost', className: 'w-full' })}>
              I already have an account
            </Link>
          </div>
        }
      />
    )
  const side = sides.length === 1 ? sides[0]! : chosen
  return (
    <FullPageState
      headingLevel={1}
      title={`Join ${host}’s battle`}
      explanation={sides.length > 1 ? 'Choose who you play with, then join.' : 'Join to choose your army and play.'}
      icon={Swords}
      action={
        <div className="grid w-full gap-2">
          {sides.length > 1
            ? sides.map((candidate) => (
                <Button
                  key={candidate}
                  variant={chosen === candidate ? 'default' : 'outline'}
                  aria-pressed={chosen === candidate}
                  className="h-11 w-full"
                  onClick={() => setChosen(candidate)}
                >
                  {invitation.sides[candidate]!.length
                    ? `With ${invitation.sides[candidate]!.map((player) => player.name).join(' and ')}`
                    : `Against ${invitation.sides[candidate === 0 ? 1 : 0]!.map((player) => player.name).join(' and ')}`}
                </Button>
              ))
            : null}
          <Button
            className="h-11 w-full text-base"
            disabled={side === null || join.isPending}
            onClick={() => side !== null && join.mutate(side)}
          >
            {join.isPending ? 'Joining…' : 'Join battle'}
          </Button>
          {join.error ? <Problem error={join.error} className="mt-1" /> : null}
        </div>
      }
    />
  )
}
