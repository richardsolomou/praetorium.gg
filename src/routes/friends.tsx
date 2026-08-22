import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { UserPlus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { SearchField } from '../client/components/SearchField'
import { PlayerAvatar } from '../client/components/PlayerAvatar'
import { SignInRequired } from '../client/components/SignInRequired'
import { friendshipsQuery, meQuery, opponentsQuery } from '../client/queries'
import { acceptFriend, removeFriend, requestFriend } from '../server/functions'
import { errorMessage } from '../client/queryClient'

export const Route = createFileRoute('/friends')({
  loader: ({ context }) =>
    Promise.all([context.queryClient.ensureQueryData(meQuery()), context.queryClient.ensureQueryData(friendshipsQuery())]),
  component: Friends,
})

type Person = { id: string; name: string }

function Friends() {
  const { data: me } = useQuery(meQuery())
  const { data = { friends: [], incoming: [], outgoing: [], people: [] } } = useQuery(friendshipsQuery())
  const [query, setQuery] = useState('')
  const queryClient = useQueryClient()
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: friendshipsQuery().queryKey }),
      queryClient.invalidateQueries({ queryKey: opponentsQuery().queryKey }),
    ])
  }
  const request = useMutation({ mutationFn: (userId: string) => requestFriend({ data: { userId } }), onSuccess: refresh })
  const accept = useMutation({ mutationFn: (userId: string) => acceptFriend({ data: { userId } }), onSuccess: refresh })
  const remove = useMutation({ mutationFn: (userId: string) => removeFriend({ data: { userId } }), onSuccess: refresh })
  if (!me) return <SignInRequired title="Your friends" explanation="Sign in to connect with the people you play against." />
  const people = data.people.filter((person) => person.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))

  return (
    <main className="mx-auto w-full max-w-6xl sm:px-4 sm:py-6">
      <section className="relative overflow-hidden border-y border-edge bg-panel p-5 sm:border sm:p-7">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,transparent_35%,color-mix(in_srgb,var(--color-parchment)_8%,transparent),transparent_75%)]" />
        <div className="relative">
          <p className="eyebrow text-parchment">Your account</p>
          <h1 className="mt-1 text-3xl">Friends</h1>
          <p className="mt-2 max-w-2xl text-sm text-dim">
            Connect with the people you know, then invite confirmed friends to private battles.
          </p>
        </div>
      </section>

      {request.error || accept.error || remove.error ? (
        <p className="mx-3 mt-4 border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive sm:mx-0">
          {errorMessage(request.error ?? accept.error ?? remove.error)}
        </p>
      ) : null}

      <div className="mx-3 mt-4 grid gap-6 sm:mx-0 md:grid-cols-2 md:gap-8">
        <People
          title="Friend requests"
          empty="No requests are waiting for you."
          people={data.incoming}
          action="Accept"
          onAction={(person) => accept.mutate(person.id)}
        />
        <People
          title="Friends"
          empty="Add a player below before you create a shared battle."
          people={data.friends}
          action="Remove"
          destructive
          onAction={(person) => remove.mutate(person.id)}
        />
      </div>

      <section className="mx-3 mt-7 sm:mx-0">
        <div className="flex items-baseline justify-between border-b border-edge pb-2">
          <p className="rubric">Find players</p>
          <UserPlus className="size-4 text-parchment" aria-hidden />
        </div>
        <SearchField
          className="mt-3"
          inputClassName="rounded-none border-edge bg-sunken"
          value={query}
          onChange={setQuery}
          placeholder="Search by account name"
          label="Search by account name"
          clearLabel="Empty the player filter"
        />
        <div className="mt-2 space-y-2">
          {people.map((person) => (
            <PersonRow key={person.id} person={person} action="Add friend" onAction={() => request.mutate(person.id)} />
          ))}
          {query && !people.length ? <p className="text-sm text-dim">No matching players.</p> : null}
          {!query && !people.length ? (
            <p className="border border-edge bg-sunken p-4 text-sm text-dim">No other players are available.</p>
          ) : null}
        </div>
      </section>

      <div className="mx-3 mt-7 sm:mx-0">
        <People
          title="Sent requests"
          empty="You have no pending requests."
          people={data.outgoing}
          action="Cancel"
          destructive
          onAction={(person) => remove.mutate(person.id)}
        />
      </div>
    </main>
  )
}

function People({
  title,
  people,
  action,
  empty,
  destructive = false,
  onAction,
}: {
  title: string
  people: Person[]
  action: string
  empty: string
  destructive?: boolean
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
            <PersonRow key={person.id} person={person} action={action} destructive={destructive} onAction={() => onAction(person)} />
          ))
        ) : (
          <p className="border border-edge bg-sunken p-4 text-sm text-dim">{empty}</p>
        )}
      </div>
    </section>
  )
}

function PersonRow({
  person,
  action,
  destructive = false,
  onAction,
}: {
  person: Person
  action: string
  destructive?: boolean
  onAction: () => void
}) {
  return (
    <div
      data-person={person.name}
      className="flex items-center justify-between gap-3 border border-edge bg-panel p-3 hover:border-edge-strong"
    >
      <Link to="/users/$userId" params={{ userId: person.id }} className="flex min-w-0 items-center gap-3 hover:text-info">
        <PlayerAvatar name={person.name} className="size-9 text-xs" />
        <span className="truncate font-bold uppercase">{person.name}</span>
      </Link>
      <Button variant={destructive ? 'destructive' : 'outline'} size="sm" onClick={onAction}>
        {action}
      </Button>
    </div>
  )
}
