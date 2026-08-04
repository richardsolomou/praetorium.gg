import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, notFound } from '@tanstack/react-router'
import { Invitation } from '../client/components/Invitation'
import { Muster } from '../client/components/Muster'
import { Tracker } from '../client/components/Tracker'
import { battleQuery } from '../client/queries'
import { useCommand } from '../client/useCommand'
import { useLiveBattle } from '../client/useLiveBattle'

export const Route = createFileRoute('/b/$token')({
  loader: async ({ context, params }) => {
    // Only a loader may throw this: from a render it lands in the error boundary.
    if (!(await context.queryClient.ensureQueryData(battleQuery(params.token)))) throw notFound()
  },
  component: BattlePage,
})

function BattlePage() {
  const { token } = Route.useParams()
  const { data: screen } = useSuspenseQuery(battleQuery(token))
  const seated = screen?.kind === 'battle'
  const present = useLiveBattle(token, seated)
  const { send, problem, pending } = useCommand(token, seated ? screen.view.seq : 0)

  if (!screen) return null
  if (screen.kind === 'invitation') return <Invitation token={token} free={screen.free} />
  if (screen.view.status === 'setup') return <Muster view={screen.view} send={send} pending={pending} problem={problem} />
  return <Tracker view={screen.view} present={present} send={send} pending={pending} problem={problem} />
}
