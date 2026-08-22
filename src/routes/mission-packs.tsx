import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Outlet, redirect, useLocation, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { gameReferencesQuery } from '../client/queries'
import { PageState } from '../client/components/PageState'

export const Route = createFileRoute('/mission-packs')({
  loader: async ({ context, location }) => {
    const data = await context.queryClient.ensureQueryData(gameReferencesQuery())
    const pack = data?.packs[0]
    if (location.pathname === '/mission-packs' && pack) {
      throw redirect({ to: '/mission-packs/$packId', params: { packId: pack.id }, replace: true })
    }
  },
  component: MissionPacks,
})

function MissionPacks() {
  const path = useLocation({ select: (location) => location.pathname })
  const navigate = useNavigate()
  const { data } = useQuery(gameReferencesQuery())
  const pack = data?.packs[0]

  useEffect(() => {
    if (path === '/mission-packs' && pack) {
      void navigate({ to: '/mission-packs/$packId', params: { packId: pack.id }, replace: true })
    }
  }, [navigate, pack, path])

  if (path !== '/mission-packs') return <Outlet />
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <PageState
        loading={!data}
        eyebrow="Mission packs"
        title={data ? 'No mission packs available' : 'Loading mission data'}
        explanation={
          data
            ? 'The current verified rules snapshot does not contain a mission pack.'
            : 'Missions, deployments, and terrain will appear when the rules snapshot is ready.'
        }
      />
    </main>
  )
}
