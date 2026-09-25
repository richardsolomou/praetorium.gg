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
import { activeFriendInviteQuery, friendshipsQuery, meQuery, opponentsQuery, playerSearchKey, playerSearchQuery } from '../../queries'
import { useSettled } from '../../useSettled'
import { acceptFriend, cancelFriendInvite, createFriendInvite, rejectFriend, removeFriend, requestFriend } from '../../../server/functions'
import { PLAYER_SEARCH_MAX_LENGTH, PLAYER_SEARCH_MIN_LENGTH } from '../../../core/playerSearch'
import { errorMessage } from '../../queryClient'
import { shareLink } from '../../nativeBridge'
import { useOrigin } from '../../useOrigin'
import type { OnboardingTarget } from '../onboarding/onboarding'

type Person = { id: string; name: string; image?: string | null }

export function FriendsPage() {
  const { data: me } = useQuery(meQuery())
  const { data = { friends: [], incoming: [], outgoing: [] } } = useQuery(friendshipsQuery())
  const [query, setQuery] = useState('')
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
      <PageHeader
        eyebrow="Your account"
        title="Friends"
        description="Connect with the people you know, then invite confirmed friends to private battles."
      />
      <PageContent className="space-y-6">
        {request.error || accept.error || reject.error || remove.error ? (
          <p role="alert" className="border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {errorMessage(request.error ?? accept.error ?? reject.error ?? remove.error)}
          </p>
        ) : null}

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
            empty="Add a player below before you create a shared battle."
            people={data.friends}
            action="Remove"
            destructive
            pendingId={inFlight(remove)}
            onAction={(person) => remove.mutate(person.id)}
          />
        </div>

        <section>
          <div className="flex items-baseline justify-between border-b border-edge pb-2">
            <p className="rubric">Find players</p>
            <UserPlus className="size-4 text-parchment" aria-hidden />
          </div>
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
            {tooShort ? (
              <p className="border border-edge bg-panel p-4 text-sm text-dim">
                {typed ? `Type at least ${PLAYER_SEARCH_MIN_LENGTH} letters of a player’s name.` : 'Type a player’s name to find them.'}
              </p>
            ) : null}
            {!tooShort && !searching && !found.length ? (
              <p className="border border-edge bg-panel p-4 text-sm text-dim">No player matches that name.</p>
            ) : null}
          </div>
        </section>

        <People
          title="Sent requests"
          empty="You have no pending requests."
          people={data.outgoing}
          action="Cancel"
          destructive
          pendingId={inFlight(remove)}
          onAction={(person) => remove.mutate(person.id)}
        />
      </PageContent>
    </main>
  )
}

function InviteFriend() {
  const { data: invite } = useQuery(activeFriendInviteQuery())
  const queryClient = useQueryClient()
  const origin = useOrigin()
  const [feedback, setFeedback] = useState<'copied' | 'shared' | null>(null)
  const [shareProblem, setShareProblem] = useState<string | null>(null)
  const refresh = () => queryClient.invalidateQueries({ queryKey: activeFriendInviteQuery().queryKey })
  const create = useMutation({ mutationFn: () => createFriendInvite(), onSuccess: refresh })
  const cancel = useMutation({ mutationFn: () => cancelFriendInvite(), onSuccess: refresh })
  const share = async (token: string) => {
    setShareProblem(null)
    try {
      setFeedback(await shareLink(`${origin}/invite/${token}`, 'Join me on Praetorium'))
    } catch (error) {
      setShareProblem(errorMessage(error))
    }
  }
  const createAndShare = async () => {
    setFeedback(null)
    try {
      const created = await create.mutateAsync()
      await share(created.token)
    } catch {
      // The mutation renders its own error.
    }
  }
  const problem = create.error ?? cancel.error
  const busy = create.isPending || cancel.isPending

  return (
    <section className="border border-edge bg-panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="max-w-2xl">
          <p className="rubric">Invite a friend</p>
          <p className="mt-1 text-sm text-dim">
            Share a one-time link with someone who is not here yet. They can make an account, then accept your invite to become friends.
          </p>
        </div>
        <div data-onboarding="friend-invite" className="flex flex-wrap gap-2">
          {invite ? (
            <>
              <Button variant="outline" disabled={!origin || busy} onClick={() => void share(invite.token)}>
                {feedback ? <Check /> : <Link2 />}
                {feedback === 'shared' ? 'Invite shared' : feedback === 'copied' ? 'Link copied' : 'Share invite'}
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => void createAndShare()}>
                <RotateCw /> New link
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setFeedback(null)
                  cancel.mutate()
                }}
              >
                <X /> Cancel
              </Button>
            </>
          ) : (
            <Button disabled={!origin || busy} onClick={() => void createAndShare()}>
              <UserPlus /> {create.isPending ? 'Creating…' : 'Create invite link'}
            </Button>
          )}
        </div>
      </div>
      {problem || shareProblem ? <p className="mt-3 text-sm text-destructive">{problem ? errorMessage(problem) : shareProblem}</p> : null}
    </section>
  )
}

function People({
  title,
  people,
  action,
  empty,
  destructive = false,
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
  destructive?: boolean
  onboarding?: OnboardingTarget
  pendingId: string | null
  onAction: (person: Person) => void
  secondaryAction?: string
  onSecondaryAction?: (person: Person) => void
}) {
  return (
    <section data-onboarding={onboarding}>
      <p className="rubric flex items-baseline justify-between border-b border-edge pb-2">
        <span>{title}</span>
        <span className="readout">{people.length}</span>
      </p>
      <div className="mt-2 space-y-2">
        {people.length ? (
          people.map((person) => (
            <PersonRow
              key={person.id}
              person={person}
              action={action}
              destructive={destructive}
              pending={pendingId === person.id}
              onAction={() => onAction(person)}
              secondaryAction={secondaryAction}
              onSecondaryAction={onSecondaryAction ? () => onSecondaryAction(person) : undefined}
            />
          ))
        ) : (
          <p className="border border-edge bg-panel p-4 text-sm text-dim">{empty}</p>
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
  destructive = false,
  pending,
  onAction,
  secondaryAction,
  onSecondaryAction,
}: {
  person: Person
  action: string
  destructive?: boolean
  pending: boolean
  onAction: () => void
  secondaryAction?: string
  onSecondaryAction?: () => void
}) {
  return (
    <div
      data-person={person.name}
      className="flex items-center justify-between gap-3 border border-edge bg-panel p-3 hover:border-edge-strong"
    >
      <Link to="/users/$userId" params={{ userId: person.id }} className="flex min-w-0 items-center gap-3 hover:text-info">
        <PlayerAvatar name={person.name} image={person.image} className="size-9 text-xs" />
        <span className="truncate font-bold uppercase">{person.name}</span>
      </Link>
      <span className="flex shrink-0 gap-1">
        <Button variant={destructive ? 'destructive' : 'outline'} size="sm" disabled={pending} onClick={onAction}>
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
