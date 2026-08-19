import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SignInRequired } from '../client/components/SignInRequired'
import { friendshipsQuery, meQuery, opponentsQuery } from '../client/queries'
import { acceptFriend, removeFriend, requestFriend } from '../server/functions'

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
    <main className="mx-auto w-full max-w-2xl space-y-8 px-4 py-8">
      <header className="border-b border-edge pb-4">
        <p className="eyebrow">Your account</p>
        <h1 className="text-2xl">Friends</h1>
        <p className="mt-2 text-sm text-dim">Only confirmed friends can be added to your battles.</p>
      </header>

      <People title="Friend requests" people={data.incoming} action="Accept" onAction={(person) => accept.mutate(person.id)} />
      <People title="Friends" people={data.friends} action="Remove" onAction={(person) => remove.mutate(person.id)} />

      <section>
        <p className="rubric border-b border-edge pb-2">Find players</p>
        <Input
          className="mt-3 rounded-none border-edge bg-sunken"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by account name"
        />
        <div className="mt-2 space-y-2">
          {people.map((person) => (
            <PersonRow key={person.id} person={person} action="Add friend" onAction={() => request.mutate(person.id)} />
          ))}
          {query && !people.length ? <p className="text-sm text-dim">No matching players.</p> : null}
        </div>
      </section>

      <People title="Sent requests" people={data.outgoing} action="Cancel" onAction={(person) => remove.mutate(person.id)} />
    </main>
  )
}

function People({
  title,
  people,
  action,
  onAction,
}: {
  title: string
  people: Person[]
  action: string
  onAction: (person: Person) => void
}) {
  if (!people.length) return null
  return (
    <section>
      <p className="rubric border-b border-edge pb-2">{title}</p>
      <div className="mt-2 space-y-2">
        {people.map((person) => (
          <PersonRow key={person.id} person={person} action={action} onAction={() => onAction(person)} />
        ))}
      </div>
    </section>
  )
}

function PersonRow({ person, action, onAction }: { person: Person; action: string; onAction: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 border border-edge bg-panel p-3">
      <span className="font-bold uppercase">{person.name}</span>
      <Button variant="outline" size="sm" onClick={onAction}>
        {action}
      </Button>
    </div>
  )
}
