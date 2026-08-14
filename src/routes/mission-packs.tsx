import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { useEffect } from 'react'
import { gameReferencesQuery } from '../client/queries'

export const Route = createFileRoute('/mission-packs')({
  loader: ({ context }) => context.queryClient.ensureQueryData(gameReferencesQuery()),
  component: MissionPacks,
})

function MissionPacks() {
  const path = useRouterState({ select: (state) => state.location.pathname })
  const navigate = useNavigate()
  const { data } = useQuery(gameReferencesQuery())
  const pack = data?.packs[0]

  useEffect(() => {
    if (path === '/mission-packs' && pack) void navigate({ to: '/mission-packs/$packId', params: { packId: pack.id }, replace: true })
  }, [navigate, pack, path])

  return path === '/mission-packs' ? (
    <main className="mx-auto max-w-4xl px-4 py-8 text-sm text-dim">Rules data is still syncing.</main>
  ) : (
    <Outlet />
  )
}
