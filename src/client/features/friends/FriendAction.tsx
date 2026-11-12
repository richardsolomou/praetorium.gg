import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { posthog } from 'posthog-js'
import { Button } from '@/components/ui/button'
import { Problem } from '../../components/Problem'
import { acceptFriend, requestFriend } from '../../functions'
import { friendshipsQuery, opponentsQuery } from '../../queries'

/**
 * The one step towards being friends with someone the player just played: ask, answer their request, or see it is
 * already asked. Nothing once they are friends, or while the connections are still loading.
 */
export function FriendAction({ person, event }: { person: { id: string; name: string }; event: string }) {
  const queryClient = useQueryClient()
  const { data } = useQuery(friendshipsQuery())
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: friendshipsQuery().queryKey }),
      queryClient.invalidateQueries({ queryKey: opponentsQuery().queryKey }),
    ])
  const connect = useMutation({
    mutationFn: (incoming: boolean) => (incoming ? acceptFriend : requestFriend)({ data: { userId: person.id } }),
    onSuccess: (_, incoming) => posthog.capture(event, { accepted: incoming }),
    // Both players see this at once, so a refused request usually means theirs arrived first and is now to accept.
    onSettled: refresh,
  })
  const has = (people: readonly { id: string }[]) => people.some((other) => other.id === person.id)
  if (!data || has(data.friends)) return null
  const incoming = has(data.incoming)
  return (
    <>
      {has(data.outgoing) ? (
        <Button size="sm" variant="outline" disabled>
          Friend request sent
        </Button>
      ) : (
        <Button size="sm" disabled={connect.isPending} onClick={() => connect.mutate(incoming)}>
          {incoming ? `Accept ${person.name}’s friend request` : `Add ${person.name} as a friend`}
        </Button>
      )}
      {connect.error && connect.variables === incoming ? <Problem error={connect.error} className="basis-full" /> : null}
    </>
  )
}
