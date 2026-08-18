import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { gameReferencesQuery } from '../client/queries'

export const Route = createFileRoute('/mission-packs')({
  loader: async ({ context, location }) => {
    const data = await context.queryClient.ensureQueryData(gameReferencesQuery())
    const pack = data?.packs[0]
    if (location.pathname === '/mission-packs' && pack) {
      throw redirect({ to: '/mission-packs/$packId', params: { packId: pack.id }, replace: true })
    }
  },
  component: Outlet,
})
