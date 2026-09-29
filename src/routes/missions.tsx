import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Outlet, redirect, useLocation, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { gameReferencesQuery } from '../client/queries'
import { PageState } from '../client/components/PageState'

export const Route = createFileRoute('/missions')({
  loader: async ({ context, location }) => {
    const data = await context.queryClient.query({ ...gameReferencesQuery(), staleTime: 'static' })
    const pack = data?.packs[0]
    if (location.pathname === '/missions' && pack) {
      throw redirect({ to: '/missions/$packId', params: { packId: pack.id }, replace: true })
    }
  },
  component: Missions,
})

function Missions() {
  const path = useLocation({ select: (location) => location.pathname })
  const navigate = useNavigate()
  const { data } = useQuery(gameReferencesQuery())
  const pack = data?.packs[0]

  useEffect(() => {
    if (path === '/missions' && pack) {
      void navigate({ to: '/missions/$packId', params: { packId: pack.id }, replace: true })
    }
  }, [navigate, pack, path])

  if (path !== '/missions') return <Outlet />
  return (
    <main className="flex w-full">
      <PageState
        className="flex-1 border-x-0 border-t-0"
        loading={!data}
        eyebrow="Missions"
        title={data ? 'No missions available' : 'Loading mission data'}
        explanation={data ? 'No missions are available right now.' : 'Missions, deployments and terrain will be available shortly.'}
      />
    </main>
  )
}
