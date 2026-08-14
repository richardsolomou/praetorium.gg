import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { SignInRequired } from '../client/components/SignInRequired'
import { meQuery } from '../client/queries'

export const Route = createFileRoute('/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(meQuery()),
  component: Home,
})

function Home() {
  const { data: me } = useQuery(meQuery())

  if (!me) {
    return (
      <SignInRequired
        title="Track a battle together"
        explanation="Open a battle, send the link to your opponent, and you both watch the same round, phase and score. Sign in to start one — your lists and your battles stay with the account."
      />
    )
  }

  return (
    <main className="mx-auto w-full max-w-md px-4 py-12">
      <h1 className="text-2xl">Track a battle together</h1>
      <p className="mt-3 text-sm text-dim">
        Open a battle, send the link to your opponent, and you both watch the same round, phase and score. Whoever the rules say owns a move
        is the only one who can make it.
      </p>
      <Button render={<Link to="/battles" />} className="mt-8 h-11 w-full text-base">
        Open my battles
      </Button>
    </main>
  )
}
