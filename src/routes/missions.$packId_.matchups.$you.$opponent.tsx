import { createFileRoute, notFound } from '@tanstack/react-router'
import { MissionMatchupPage } from '../client/features/reference/missions/MissionMatchupPage'
import { gameReferencesQuery, terrainMatchupIds, terrainReferencesQuery } from '../client/queries'
import { pageHead } from '../client/linkPreview'
import { matchupMission } from '../client/features/reference/missions/dispositionMatchups'

export const Route = createFileRoute('/missions/$packId_/matchups/$you/$opponent')({
  loader: async ({ context, params }) => {
    const data = await context.queryClient.query({ ...gameReferencesQuery(), staleTime: 'static' })
    const pack = data?.packs.find((entry) => entry.id === params.packId)
    const yours = pack && matchupMission(pack, params.you, params.opponent)
    const theirs = pack && matchupMission(pack, params.opponent, params.you)
    const you = data?.dispositions.find((entry) => entry.id === params.you)
    const opponent = data?.dispositions.find((entry) => entry.id === params.opponent)
    if (!pack || !yours || !theirs || !you || !opponent) throw notFound()
    const terrainQuery = terrainReferencesQuery(terrainMatchupIds([params.you, params.opponent]))
    // Server-rendered links include terrain; client transitions show the mission without waiting for it.
    if (typeof window === 'undefined') await context.queryClient.query({ ...terrainQuery, staleTime: 'static' })
    else void context.queryClient.query(terrainQuery).catch(() => undefined)
    return { pack: pack.name, you: you.name, opponent: opponent.name, yours: yours.name, theirs: theirs.name }
  },
  head: ({ loaderData, match, params }) => {
    if (!loaderData) return {}
    const path = `/missions/${params.packId}/matchups/${params.you}/${params.opponent}`
    return pageHead(match.context.origin, {
      title: `${loaderData.you} vs ${loaderData.opponent} — ${loaderData.pack}`,
      description: `${loaderData.you} plays ${loaderData.yours}; ${loaderData.opponent} plays ${loaderData.theirs}, with source scoring and actions.`,
      path,
      article: true,
      breadcrumbs: [
        { name: loaderData.pack, path: `/missions/${params.packId}` },
        { name: `${loaderData.you} vs ${loaderData.opponent}`, path },
      ],
    })
  },
  component: () => <MissionMatchupPage {...Route.useParams()} />,
})
