import { useMutation, useQuery } from '@tanstack/react-query'
import { Navigate, useNavigate } from '@tanstack/react-router'
import { Swords } from 'lucide-react'
import { posthog } from 'posthog-js'
import { Button } from '@/components/ui/button'
import { FullPageState } from '../../components/PageState'
import { Problem } from '../../components/Problem'
import { joinGuest } from '../../functions'
import { guestInvitationQuery } from '../../queries'
import { rememberGuestBattle } from './guestBattle'

/** Where a guest's link lands: one choice, to play the seat on this device. */
export function JoinAsGuest({ invite }: { invite: string }) {
  const { data: invitation } = useQuery(guestInvitationQuery(invite))
  const navigate = useNavigate()
  const join = useMutation({
    mutationFn: () => joinGuest({ data: { invite } }),
    onSuccess: async ({ token }) => {
      rememberGuestBattle(token)
      posthog.capture('guest_battle_joined')
      await navigate({ to: '/battles/$token', params: { token }, replace: true })
    },
  })
  if (!invitation) return null
  if (invitation.here) return <Navigate to="/battles/$token" params={{ token: invitation.token }} replace />
  const host = invitation.hostName ?? 'Your opponent'
  if (invitation.joined)
    return (
      <FullPageState
        headingLevel={1}
        eyebrow="Guest seat"
        title={`${invitation.guestName} already joined`}
        explanation={`Another device is playing this seat. If that was you on a different device, ask ${host} to take the seat back and share a new link.`}
        icon={Swords}
      />
    )
  return (
    <FullPageState
      headingLevel={1}
      eyebrow="Guest seat"
      title={`Play as ${invitation.guestName}`}
      explanation={`${host} invited you to their battle. Join on this device to choose your army and play your side. You don’t need an account, and this device keeps your seat for 30 days.`}
      icon={Swords}
      action={
        <div className="w-full">
          <Button className="h-11 w-full text-base" disabled={join.isPending} onClick={() => join.mutate()}>
            {join.isPending ? 'Joining…' : 'Join on this device'}
          </Button>
          {join.error ? <Problem error={join.error} className="mt-3" /> : null}
        </div>
      }
    />
  )
}
