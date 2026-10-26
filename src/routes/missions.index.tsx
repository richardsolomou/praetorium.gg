import { useQuery } from '@tanstack/react-query'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { gameReferencesQuery } from '../client/queries'
import { FullPageState } from '../client/components/PageState'

export const Route = createFileRoute('/missions/')({
  loader: async ({ context }) => {
    const data = await context.queryClient.query({ ...gameReferencesQuery(), staleTime: 'static' })
    const pack = data?.packs[0]
    if (pack) throw redirect({ to: '/missions/$packId', params: { packId: pack.id }, replace: true })
  },
  component: Missions,
})

function Missions() {
  const navigate = useNavigate()
  const { data } = useQuery(gameReferencesQuery())
  const pack = data?.packs[0]

  useEffect(() => {
    if (pack) void navigate({ to: '/missions/$packId', params: { packId: pack.id }, replace: true })
  }, [navigate, pack])

  return (
    <FullPageState
      loading={!data}
      eyebrow="Missions"
      title={data ? 'No missions available' : 'Loading mission data'}
      explanation={data ? 'No missions are available right now.' : 'Missions, deployments and terrain will be available shortly.'}
    />
  )
}
