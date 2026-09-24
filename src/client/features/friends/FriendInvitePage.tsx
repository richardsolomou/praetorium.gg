import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { UserPlus } from 'lucide-react'
import { buttonVariants, Button } from '@/components/ui/button'
import { PageContent, PageHeader } from '../../components/Page'
import { PageState } from '../../components/PageState'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import { friendInviteQuery, friendshipsQuery, meQuery, opponentsQuery } from '../../queries'
import { errorMessage } from '../../queryClient'
import { acceptFriendInvite } from '../../../server/functions'

export function FriendInvitePage({ token }: { token: string }) {
  const { data: invite } = useQuery(friendInviteQuery(token))
  const { data: me } = useQuery(meQuery())
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const accept = useMutation({
    mutationFn: () => acceptFriendInvite({ data: { token } }),
    onSuccess: async () => {
      queryClient.setQueryData(friendInviteQuery(token).queryKey, null)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: friendshipsQuery().queryKey }),
        queryClient.invalidateQueries({ queryKey: opponentsQuery().queryKey }),
      ])
      await navigate({ to: '/friends', replace: true })
    },
  })
  if (!invite) return null
  const next = `/invite/${token}`

  return (
    <main className="w-full">
      <PageHeader
        eyebrow="Friend invite"
        title={`${invite.inviter.name} invited you`}
        description="Join them on Praetorium to build army lists, track battles and play together."
        media={<PlayerAvatar name={invite.inviter.name} image={invite.inviter.image} className="size-14 text-lg" />}
      />
      <PageContent>
        {me?.id === invite.inviter.id ? (
          <PageState
            headingLevel={2}
            eyebrow="Your invite"
            title="Send this link to a friend"
            explanation="When they accept it, you will be connected as friends and can start battles together."
            icon={UserPlus}
          />
        ) : me ? (
          <PageState
            headingLevel={2}
            eyebrow="From a friend"
            title={`Become friends with ${invite.inviter.name}`}
            explanation="Accepting this one-time invite connects your accounts so either of you can start a battle together."
            icon={UserPlus}
            action={
              <div className="w-full">
                <Button className="h-11 w-full text-base" disabled={accept.isPending} onClick={() => accept.mutate()}>
                  {accept.isPending ? 'Accepting…' : 'Accept invite'}
                </Button>
                {accept.error ? <p className="mt-3 text-sm text-destructive">{errorMessage(accept.error)}</p> : null}
              </div>
            }
          />
        ) : (
          <PageState
            headingLevel={2}
            eyebrow="Join Praetorium"
            title="Create an account to accept"
            explanation="Your account keeps your armies and battles together. You choose whether to accept the friendship after signing in."
            icon={UserPlus}
            action={
              <div className="grid w-full gap-2">
                <Link to="/sign-in" search={{ next, join: true }} className={buttonVariants({ className: 'h-11 w-full text-base' })}>
                  Create an account
                </Link>
                <Link to="/sign-in" search={{ next }} className={buttonVariants({ variant: 'ghost', className: 'w-full' })}>
                  I already have an account
                </Link>
              </div>
            }
          />
        )}
      </PageContent>
    </main>
  )
}
