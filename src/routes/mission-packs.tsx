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
    <main className="flex w-full">
      <PageState
        className="flex-1 border-x-0 border-t-0"
        loading={!data}
        eyebrow="Mission packs"
        title={data ? 'No mission packs available' : 'Loading mission data'}
        explanation={data ? 'No mission packs are available right now.' : 'Missions, deployments and terrain will be available shortly.'}
      />
    </main>
  )
}
