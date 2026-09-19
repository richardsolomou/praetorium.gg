import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { UserPlus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { PageContent, PageHeader } from '../client/components/Page'
import { SearchField } from '../client/components/SearchField'
import { PlayerAvatar } from '../client/components/PlayerAvatar'
import { SignInRequired } from '../client/components/SignInRequired'
import { friendshipsQuery, meQuery, opponentsQuery, playerSearchKey, playerSearchQuery } from '../client/queries'
import { useSettled } from '../client/useSettled'
import { acceptFriend, removeFriend, requestFriend } from '../server/functions'
import { errorMessage } from '../client/queryClient'

export const Route = createFileRoute('/friends')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.query({ ...meQuery(), staleTime: 'static' }),
      context.queryClient.query({ ...friendshipsQuery(), staleTime: 'static' }),
    ]),
  component: Friends,
})

type Person = { id: string; name: string; image?: string | null }

function Friends() {
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
  const remove = useMutation({ mutationFn: (userId: string) => removeFriend({ data: { userId } }), onSuccess: refresh })
  // Only the pressed row waits: one mutation serves every row in its list.
  const inFlight = (mutation: { isPending: boolean; variables: string | undefined }) =>
    mutation.isPending ? (mutation.variables ?? null) : null
  if (!me) return <SignInRequired title="Your friends" explanation="Sign in to connect with the people you play against." />
  // Results from the last name searched stay up while the next one is answered.
  const found = search.enabled ? matches : []
  const searching = search.enabled && isFetching && !found.length

  return (
    <main className="w-full">
      <PageHeader
        eyebrow="Your account"
        title="Friends"
        description="Connect with the people you know, then invite confirmed friends to private battles."
      />
      <PageContent className="space-y-6">
        {request.error || accept.error || remove.error ? (
          <p role="alert" className="border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {errorMessage(request.error ?? accept.error ?? remove.error)}
          </p>
        ) : null}

        <div className="grid gap-6 md:grid-cols-2">
          <People
            title="Friend requests"
            empty="No requests are waiting for you."
            people={data.incoming}
            action="Accept"
            pendingId={inFlight(accept)}
            onAction={(person) => accept.mutate(person.id)}
          />
          <People
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
            className="mt-2"
            value={query}
            onChange={setQuery}
            placeholder="Search by account name"
            label="Search by account name"
            clearLabel="Empty the player search"
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
            {!search.enabled ? (
              <p className="border border-edge bg-panel p-4 text-sm text-dim">Type a player’s name to find them.</p>
            ) : null}
            {search.enabled && !searching && !found.length ? (
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

function People({
  title,
  people,
  action,
  empty,
  destructive = false,
  pendingId,
  onAction,
}: {
  title: string
  people: Person[]
  action: string
  empty: string
  destructive?: boolean
  pendingId: string | null
  onAction: (person: Person) => void
}) {
  return (
    <section>
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
}: {
  person: Person
  action: string
  destructive?: boolean
  pending: boolean
  onAction: () => void
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
      <Button variant={destructive ? 'destructive' : 'outline'} size="sm" disabled={pending} onClick={onAction}>
        {action}
      </Button>
    </div>
  )
}
