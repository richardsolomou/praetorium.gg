import { SectionHeading } from '../../components/SectionHeading'
import { GuideHelp } from '../onboarding/GuideHelp'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Check, EllipsisVertical, Link2, RotateCw, Swords, UserMinus, UserPlus, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { PageContent, PageHeader } from '../../components/Page'
import { SearchField } from '../../components/SearchField'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import { SignInRequired } from '../../components/SignInRequired'
import { friendshipsQuery, meQuery, opponentsQuery, playerProfileQuery, playerSearchKey, playerSearchQuery } from '../../queries'
import { useSettled } from '../../useSettled'
import { acceptFriend, rejectFriend, removeFriend, requestFriend } from '../../functions'
import { PLAYER_SEARCH_MAX_LENGTH, PLAYER_SEARCH_MIN_LENGTH } from '../../../core/playerSearch'
import type { OnboardingTarget } from '../onboarding/onboarding'
import { InviteQr, SHARED_LABEL, useFriendInvite, useInviteShareLabel } from './friendInvite'
import { Problem } from '../../components/Problem'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { CreateBattle } from '../battles/CreateBattle'
import type { Facet } from '../../../core/serviceRecord'
import { formatAgo } from '../../dates'
import { countLabel } from '../../text'

type Person = { id: string; name: string; image?: string | null }
type Confirming = { kind: 'remove' | 'reject' | 'cancel'; person: Person }

export function FriendsPage() {
  const { data: me } = useQuery(meQuery())
  const { data = { friends: [], incoming: [], outgoing: [] } } = useQuery(friendshipsQuery())
  const { data: profile } = useQuery({ ...playerProfileQuery(me?.id ?? ''), enabled: Boolean(me) })
  const [query, setQuery] = useState('')
  const [confirming, setConfirming] = useState<Confirming | null>(null)
  const [battling, setBattling] = useState<Person | null>(null)
  const settledQuery = useSettled(query.trim())
  const search = playerSearchQuery(settledQuery)
  const { data: matches = [], isFetching } = useQuery({ ...search, placeholderData: keepPreviousData })
  const queryClient = useQueryClient()
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: friendshipsQuery().queryKey }),
      queryClient.invalidateQueries({ queryKey: opponentsQuery().queryKey }),
      queryClient.invalidateQueries({ queryKey: playerSearchKey() }),
    ])
  }
  const request = useMutation({ mutationFn: (userId: string) => requestFriend({ data: { userId } }), onSuccess: refresh })
  const accept = useMutation({ mutationFn: (userId: string) => acceptFriend({ data: { userId } }), onSuccess: refresh })
  const reject = useMutation({ mutationFn: (userId: string) => rejectFriend({ data: { userId } }), onSuccess: refresh })
  const remove = useMutation({ mutationFn: (userId: string) => removeFriend({ data: { userId } }), onSuccess: refresh })
  // Only the pressed row waits: one mutation serves every row in its list.
  const inFlight = (mutation: { isPending: boolean; variables: string | undefined }) =>
    mutation.isPending ? (mutation.variables ?? null) : null
  if (!me) return <SignInRequired title="Your friends" explanation="Sign in to connect with the people you play against." />
  const typed = query.trim()
  const tooShort = typed.length < PLAYER_SEARCH_MIN_LENGTH
  // Results from the last name searched stay up while the next one is answered, and
  // `keepPreviousData` keeps them even once the query is disabled, so a name cut back
  // below the minimum has to drop them here.
  const found = search.enabled && !tooShort ? matches : []
  // Judged from what is typed rather than what has settled, so the invitation does
  // not stay up for the length of a burst of typing.
  const searching = !tooShort && (typed !== settledQuery || isFetching) && !found.length
  const played = new Map(profile?.facets.opponents.map((facet) => [facet.value, facet]))

  return (
    <main className="w-full">
      <PageHeader
        eyebrow="Your account"
        title="Friends"
        description="The people you play with."
        actions={<GuideHelp task="friend">Friend guide</GuideHelp>}
      />
      <PageContent className="space-y-8">
        {request.error || accept.error || reject.error || remove.error ? (
          <Problem
            error={request.error ?? accept.error ?? reject.error ?? remove.error}
            className="border border-destructive/50 bg-destructive/10 p-3"
          />
        ) : null}

        {data.incoming.length ? (
          <People
            onboarding="friend-requests"
            title="Friend requests"
            people={data.incoming}
            action="Accept"
            secondaryAction="Reject"
            pendingId={inFlight(accept) ?? inFlight(reject)}
            onAction={(person) => accept.mutate(person.id)}
            onSecondaryAction={(person) => setConfirming({ kind: 'reject', person })}
          />
        ) : null}

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-x-16">
          <aside className="min-w-0 space-y-6 lg:col-start-2 lg:row-start-1">
            <section>
              <h2 className="rubric border-b border-edge pb-2">Add a friend</h2>
              <SearchField
                onboarding="friend-search"
                className="mt-3"
                value={query}
                onChange={setQuery}
                placeholder="Search by account name"
                label="Search by account name"
                clearLabel="Empty the player search"
                maxLength={PLAYER_SEARCH_MAX_LENGTH}
              />
              <div className="mt-2 space-y-2">
                {found.map((person) => (
                  <PersonRow
                    key={person.id}
                    person={person}
                    action="Add friend"
                    pending={inFlight(request) === person.id}
                    onAction={() => request.mutate(person.id)}
                  />
                ))}
                {searching ? (
                  <>
                    <output className="sr-only">Searching</output>
                    <PersonRowSkeleton />
                    <PersonRowSkeleton />
                  </>
                ) : null}
                {typed && tooShort ? (
                  <p className="py-2 text-sm text-dim">Type at least {PLAYER_SEARCH_MIN_LENGTH} letters of a player’s name.</p>
                ) : null}
                {!tooShort && !searching && !found.length ? <p className="py-2 text-sm text-dim">No players match that name.</p> : null}
              </div>
            </section>
            <InviteFriend />
          </aside>

          <div className="min-w-0 space-y-8 lg:col-start-1 lg:row-start-1">
            <section data-onboarding="friend-list">
              <SectionHeading title="Friends" count={data.friends.length} />
              {data.friends.length ? (
                <div className="mt-3 grid gap-2">
                  {data.friends.map((friend) => (
                    <FriendCard
                      key={friend.id}
                      friend={friend}
                      viewerId={me.id}
                      played={played.get(friend.id)}
                      onBattle={() => setBattling(friend)}
                      onRemove={() => setConfirming({ kind: 'remove', person: friend })}
                    />
                  ))}
                </div>
              ) : (
                <p className="py-3 text-sm text-dim">
                  No friends yet. Find someone by name, or send an invite link to someone new to Praetorium.
                </p>
              )}
            </section>

            {data.outgoing.length ? (
              <People
                title="Sent requests"
                people={data.outgoing}
                action="Cancel"
                pendingId={inFlight(remove)}
                onAction={(person) => setConfirming({ kind: 'cancel', person })}
              />
            ) : null}
          </div>
        </div>
      </PageContent>
      <CreateBattle
        opponentId={battling?.id}
        open={Boolean(battling)}
        onOpenChange={(open) => {
          if (!open) setBattling(null)
        }}
      />
      {confirming ? (
        <ConfirmDialog
          {...confirmationCopy(confirming)}
          destructive
          onClose={() => setConfirming(null)}
          onConfirm={() => {
            const mutation = confirming.kind === 'reject' ? reject : remove
            mutation.mutate(confirming.person.id)
            setConfirming(null)
          }}
        />
      ) : null}
    </main>
  )
}

function confirmationCopy({ kind, person }: Confirming) {
  switch (kind) {
    case 'remove':
      return {
        title: `Remove ${person.name}?`,
        description: "You stop seeing each other's friends-only battles, and rosters you lent each other go back to their owners.",
        cancel: 'Keep friend',
        confirm: 'Remove friend',
      }
    case 'reject':
      return {
        title: `Reject ${person.name}?`,
        description: 'Their friend request goes away. They can send another.',
        cancel: 'Keep request',
        confirm: 'Reject',
      }
    case 'cancel':
      return {
        title: `Cancel your request to ${person.name}?`,
        description: 'It disappears from their friend requests. You can send another.',
        cancel: 'Keep request',
        confirm: 'Cancel request',
      }
  }
}

/** A friend, what you have played against them, and the two things a player does with one. */
function FriendCard({
  friend,
  viewerId,
  played,
  onBattle,
  onRemove,
}: {
  friend: Person
  viewerId: string
  played?: Facet
  onBattle: () => void
  onRemove: () => void
}) {
  return (
    <article data-person={friend.name} className="flex items-center gap-3 border border-edge bg-panel p-3">
      <Link to="/users/$userId" params={{ userId: friend.id }} className="shrink-0" tabIndex={-1} aria-hidden>
        <PlayerAvatar name={friend.name} image={friend.image} className="size-10 text-xs" />
      </Link>
      <div className="min-w-0 flex-1">
        <Link to="/users/$userId" params={{ userId: friend.id }} className="block truncate font-bold uppercase hover:text-info">
          {friend.name}
        </Link>
        {played ? (
          <Link
            to="/users/$userId"
            params={{ userId: viewerId }}
            search={{ opponentId: friend.id }}
            className="block truncate text-xs text-dim hover:text-bone"
          >
            {countLabel(played.battles, 'game')} played · {formatAgo(played.latest)}
          </Link>
        ) : (
          <p className="truncate text-xs text-faint">No games played yet</p>
        )}
      </div>
      <Button variant="outline" size="sm" className="shrink-0" aria-label={`New battle with ${friend.name}`} onClick={onBattle}>
        <Swords /> Battle
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" className="shrink-0" aria-label={`More for ${friend.name}`} />}>
          <EllipsisVertical />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem variant="destructive" onClick={onRemove}>
            <UserMinus /> Remove friend
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </article>
  )
}

function InviteFriend() {
  const invite = useFriendInvite()
  const shareLabel = useInviteShareLabel()
  const [cancelling, setCancelling] = useState(false)

  return (
    <section>
      <h3 className="eyebrow text-dim">Not on Praetorium yet?</h3>
      <p className="mt-1 text-sm text-dim">Send them a one-time invite link.</p>
      <div data-onboarding="friend-invite" className="mt-3 flex flex-wrap gap-2">
        {invite.url ? (
          <>
            <Button variant="outline" disabled={invite.busy} onClick={() => void invite.share()}>
              {invite.feedback ? <Check /> : <Link2 />}
              {invite.feedback ? SHARED_LABEL[invite.feedback] : shareLabel}
            </Button>
            <InviteQr url={invite.url} disabled={invite.busy} />
            <Button variant="ghost" disabled={invite.busy} onClick={() => void invite.shareNew()}>
              <RotateCw /> New link
            </Button>
            <Button variant="ghost" disabled={invite.busy} onClick={() => setCancelling(true)}>
              <X /> Cancel
            </Button>
          </>
        ) : (
          <Button disabled={invite.busy} onClick={() => void invite.share()}>
            <UserPlus /> {invite.creating ? 'Creating…' : 'Create invite link'}
          </Button>
        )}
      </div>
      {invite.problem ? <Problem className="mt-3">{invite.problem}</Problem> : null}
      <ConfirmDialog
        open={cancelling}
        title="Cancel your invite link?"
        description="A link you already sent stops working. You can make a new one."
        cancel="Keep link"
        confirm="Cancel link"
        destructive
        onClose={() => setCancelling(false)}
        onConfirm={() => {
          invite.cancel()
          setCancelling(false)
        }}
      />
    </section>
  )
}

function People({
  title,
  people,
  action,
  onboarding,
  pendingId,
  onAction,
  secondaryAction,
  onSecondaryAction,
}: {
  title: string
  people: Person[]
  action: string
  onboarding?: OnboardingTarget
  pendingId: string | null
  onAction: (person: Person) => void
  secondaryAction?: string
  onSecondaryAction?: (person: Person) => void
}) {
  return (
    <section data-onboarding={onboarding}>
      <SectionHeading title={title} count={people.length} />
      <div className="mt-3 grid gap-2">
        {people.map((person) => (
          <PersonRow
            key={person.id}
            person={person}
            action={action}
            pending={pendingId === person.id}
            onAction={() => onAction(person)}
            secondaryAction={secondaryAction}
            onSecondaryAction={onSecondaryAction ? () => onSecondaryAction(person) : undefined}
          />
        ))}
      </div>
    </section>
  )
}

function PersonRowSkeleton() {
  return (
    <div className="flex items-center justify-between gap-3 border border-edge bg-panel p-3">
      <div className="flex min-w-0 items-center gap-3">
        <Skeleton className="size-9 rounded-full" />
        <Skeleton className="h-4 w-32" />
      </div>
      <Skeleton className="h-8 w-24" />
    </div>
  )
}

function PersonRow({
  person,
  action,
  pending,
  onAction,
  secondaryAction,
  onSecondaryAction,
}: {
  person: Person
  action: string
  pending: boolean
  onAction: () => void
  secondaryAction?: string
  onSecondaryAction?: () => void
}) {
  return (
    <div data-person={person.name} className="flex items-center justify-between gap-3 border border-edge bg-panel p-3">
      <Link to="/users/$userId" params={{ userId: person.id }} className="flex min-w-0 items-center gap-3 hover:text-info">
        <PlayerAvatar name={person.name} image={person.image} className="size-9 text-xs" />
        <span className="truncate font-bold uppercase">{person.name}</span>
      </Link>
      <span className="flex shrink-0 gap-1">
        <Button variant="outline" size="sm" disabled={pending} onClick={onAction}>
          {action}
        </Button>
        {secondaryAction ? (
          <Button variant="ghost" size="sm" disabled={pending} onClick={onSecondaryAction}>
            {secondaryAction}
          </Button>
        ) : null}
      </span>
    </div>
  )
}
