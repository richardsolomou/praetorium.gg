import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Check, Link2, RotateCw, UserPlus, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { PageContent, PageHeader } from '../../components/Page'
import { SearchField } from '../../components/SearchField'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import { SignInRequired } from '../../components/SignInRequired'
import { friendshipsQuery, meQuery, opponentsQuery, playerSearchKey, playerSearchQuery } from '../../queries'
import { useSettled } from '../../useSettled'
import { acceptFriend, rejectFriend, removeFriend, requestFriend } from '../../functions'
import { PLAYER_SEARCH_MAX_LENGTH, PLAYER_SEARCH_MIN_LENGTH } from '../../../core/playerSearch'
import { errorMessage } from '../../queryClient'
import type { OnboardingTarget } from '../onboarding/onboarding'
import { useNativeShare } from '../../nativeBridge'
import { InviteQr, SHARED_LABEL, useFriendInvite } from './friendInvite'
import { Problem } from '../../components/Problem'
import { ConfirmDialog } from '../../components/ConfirmDialog'

type Person = { id: string; name: string; image?: string | null }

export function FriendsPage() {
  const { data: me } = useQuery(meQuery())
  const { data = { friends: [], incoming: [], outgoing: [] } } = useQuery(friendshipsQuery())
  const [query, setQuery] = useState('')
  const [unfriending, setUnfriending] = useState<Person | null>(null)
  const settledQuery = useSettled(query.trim())
  const search = playerSearchQuery(settledQuery)
  const { data: matches = [], isFetching } = useQuery({ ...search, placeholderData: keepPreviousData })
  const queryClient = useQueryClient()
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: friendshipsQuery().queryKey }),
      queryClient.invalidateQueries({ queryKey: opponentsQuery().queryKey }),
      queryClient.invalidateQueries({ queryKey: playerSearchKey }),
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

  return (
    <main className="w-full">
      <PageHeader eyebrow="Your account" title="Friends" description="Add the people you play with." />
      <PageContent className="space-y-6">
        {request.error || accept.error || reject.error || remove.error ? (
          <p role="alert" className="border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {errorMessage(request.error ?? accept.error ?? reject.error ?? remove.error)}
          </p>
        ) : null}

        <section>
          <h2 className="rubric border-b border-edge pb-2">Find players</h2>
          <SearchField
            onboarding="friend-search"
            className="mt-2"
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

        <div className="grid gap-6 md:grid-cols-2">
          <People
            onboarding="friend-requests"
            title="Friend requests"
            empty="No requests are waiting for you."
            people={data.incoming}
            action="Accept"
            secondaryAction="Reject"
            pendingId={inFlight(accept) ?? inFlight(reject)}
            onAction={(person) => accept.mutate(person.id)}
            onSecondaryAction={(person) => reject.mutate(person.id)}
          />
          <People
            onboarding="friend-list"
            title="Friends"
            empty="No friends yet."
            people={data.friends}
            action="Remove"
            pendingId={inFlight(remove)}
            onAction={setUnfriending}
          />
        </div>

        {data.outgoing.length ? (
          <People
            title="Sent requests"
            empty=""
            people={data.outgoing}
            action="Cancel"
            pendingId={inFlight(remove)}
            onAction={(person) => remove.mutate(person.id)}
          />
        ) : null}
      </PageContent>
      <ConfirmDialog
        open={Boolean(unfriending)}
        title={`Remove ${unfriending?.name}?`}
        description="You stop seeing each other's friends-only battles, and rosters you lent each other go back to their owners."
        cancel="Keep friend"
        confirm="Remove friend"
        destructive
        onClose={() => setUnfriending(null)}
        onConfirm={() => {
          if (unfriending) remove.mutate(unfriending.id)
          setUnfriending(null)
        }}
      />
    </main>
  )
}

function InviteFriend() {
  const invite = useFriendInvite()
  const shareLabel = useNativeShare() ? 'Share invite' : 'Copy invite link'

  return (
    <section>
      <h2 className="rubric border-b border-edge pb-2">Invite a friend</h2>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-dim">Not on Praetorium yet? Send them a one-time invite link.</p>
        <div data-onboarding="friend-invite" className="flex flex-wrap gap-2">
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
              <Button variant="ghost" disabled={invite.busy} onClick={invite.cancel}>
                <X /> Cancel
              </Button>
            </>
          ) : (
            <Button disabled={invite.busy} onClick={() => void invite.share()}>
              <UserPlus /> {invite.creating ? 'Creating…' : 'Create invite link'}
            </Button>
          )}
        </div>
      </div>
      {invite.problem ? <Problem className="mt-3">{invite.problem}</Problem> : null}
    </section>
  )
}

function People({
  title,
  people,
  action,
  empty,
  onboarding,
  pendingId,
  onAction,
  secondaryAction,
  onSecondaryAction,
}: {
  title: string
  people: Person[]
  action: string
  empty: string
  onboarding?: OnboardingTarget
  pendingId: string | null
  onAction: (person: Person) => void
  secondaryAction?: string
  onSecondaryAction?: (person: Person) => void
}) {
  return (
    <section data-onboarding={onboarding}>
      <h2 className="rubric flex items-baseline justify-between border-b border-edge pb-2">
        <span>{title}</span>
        <span className="readout">{people.length}</span>
      </h2>
      <div className="mt-2 space-y-2">
        {people.length ? (
          people.map((person) => (
            <PersonRow
              key={person.id}
              person={person}
              action={action}
              pending={pendingId === person.id}
              onAction={() => onAction(person)}
              secondaryAction={secondaryAction}
              onSecondaryAction={onSecondaryAction ? () => onSecondaryAction(person) : undefined}
            />
          ))
        ) : (
          <p className="py-2 text-sm text-dim">{empty}</p>
        )}
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
