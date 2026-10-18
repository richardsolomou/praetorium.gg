import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { posthog } from 'posthog-js'
import { Button } from '@/components/ui/button'
import { buttonClass } from '../../components/buttonClass'
import { Problem } from '../../components/Problem'
import type { BattleView } from '../../../core/battleView'
import { claimGuest, requestFriend } from '../../functions'
import { battleQuery, battlesQuery, friendshipsQuery, meQuery, reportKey } from '../../queries'
import { useClientValue } from '../../useClientValue'
import { peekGuestDraft } from '../rosters/guestDraft'
import { forgetGuestBattle } from '../battles/guestBattle'

/**
 * What signing up gives a guest, offered once their game is over rather than while they play it, and the claim that
 * moves this battle onto the account they sign in with.
 */
export function GuestKeepGame({ view, claimed, onClaimed }: { view: BattleView; claimed: boolean; onClaimed: () => void }) {
  const queryClient = useQueryClient()
  const { data: me } = useQuery(meQuery())
  const host = view.players.find((player) => player.id === view.creatorId)
  const draft = useClientValue(peekGuestDraft, null)
  const next = `/battles/${view.token}`
  const claim = useMutation({
    mutationFn: () => claimGuest({ data: { token: view.token } }),
    onSuccess: async () => {
      forgetGuestBattle()
      posthog.capture('guest_battle_claimed')
      onClaimed()
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: battleQuery(view.token).queryKey }),
        queryClient.invalidateQueries({ queryKey: battlesQuery().queryKey }),
        queryClient.invalidateQueries({ queryKey: reportKey(view.token) }),
      ])
    },
  })
  const befriend = useMutation({
    mutationFn: (userId: string) => requestFriend({ data: { userId } }),
    onSuccess: () => {
      posthog.capture('guest_battle_friend_requested')
      return queryClient.invalidateQueries({ queryKey: friendshipsQuery().queryKey })
    },
  })

  if (claimed && me)
    return (
      <Panel title="This battle is in your record" data-guest="claimed">
        <p className="text-sm text-dim">It counts toward your record and, when it is public, the leaderboard.</p>
        <div className="flex flex-wrap gap-2">
          {host ? (
            <Button size="sm" disabled={befriend.isPending || befriend.isSuccess} onClick={() => befriend.mutate(host.id)}>
              {befriend.isSuccess ? 'Friend request sent' : `Add ${host.name} as a friend`}
            </Button>
          ) : null}
          <Link to="/users/$userId" params={{ userId: me.id }} className={buttonClass({ variant: 'outline', size: 'sm' })}>
            See your record
          </Link>
          {draft ? (
            <Link to="/rosters" className={buttonClass({ variant: 'outline', size: 'sm' })}>
              Save your roster
            </Link>
          ) : null}
        </div>
        {befriend.error ? <Problem error={befriend.error} /> : null}
      </Panel>
    )
  if (me)
    return (
      <Panel title="Add this battle to your record" data-guest="claim">
        <p className="text-sm text-dim">
          It moves from your guest seat to {me.name}: it counts in your record and, when it is public, on the leaderboard. Your battle
          visibility setting applies to it, and this device stops holding the guest seat.
        </p>
        <Button size="sm" className="self-start" disabled={claim.isPending} onClick={() => claim.mutate()}>
          {claim.isPending ? 'Adding…' : 'Add to my record'}
        </Button>
        {claim.error ? <Problem error={claim.error} /> : null}
      </Panel>
    )
  return (
    <Panel title="Keep this battle" data-guest="keep">
      <p className="text-sm text-dim">Create a free account and this game moves into it. You also get:</p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-dim">
        <li>Your own record and stats, game after game</li>
        <li>A place on the leaderboard and in league standings</li>
        <li>Your army saved with your rosters</li>
        {host ? <li>{host.name} as a friend, to start the next battle together</li> : null}
        <li>Your games and lists on any device</li>
      </ul>
      <div className="flex flex-wrap gap-2">
        <Link to="/sign-in" search={{ next, join: true }} className={buttonClass({ size: 'sm' })}>
          Create an account
        </Link>
        <Link to="/sign-in" search={{ next }} className={buttonClass({ variant: 'ghost', size: 'sm' })}>
          I already have an account
        </Link>
      </div>
    </Panel>
  )
}

function Panel({ title, children, ...data }: { title: string; children: React.ReactNode } & Record<`data-${string}`, string>) {
  return (
    <section aria-label={title} className="flex flex-col gap-3 border border-edge bg-sunken p-4" {...data}>
      <h2 className="rubric">{title}</h2>
      {children}
    </section>
  )
}
