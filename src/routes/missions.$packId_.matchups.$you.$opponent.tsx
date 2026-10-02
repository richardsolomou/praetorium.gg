import { createFileRoute, notFound } from '@tanstack/react-router'
import { MissionMatchupPage } from '../client/features/reference/missions/MissionMatchupPage'
import { gameReferencesQuery, terrainMatchupIds, terrainReferencesQuery } from '../client/queries'
import { breadcrumbMeta, pageHead } from '../client/linkPreview'

export const Route = createFileRoute('/missions/$packId_/matchups/$you/$opponent')({
  loader: async ({ context, params }) => {
    const data = await context.queryClient.query({ ...gameReferencesQuery(), staleTime: 'static' })
    const pack = data?.packs.find((entry) => entry.id === params.packId)
    const yours = pack?.missions.find((mission) =>
      mission.matchups.some((pair) => pair[0]?.id === params.you && pair[1]?.id === params.opponent),
    )
    const theirs = pack?.missions.find((mission) =>
      mission.matchups.some((pair) => pair[0]?.id === params.opponent && pair[1]?.id === params.you),
    )
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
    const head = pageHead(match.context.origin, {
      title: `${loaderData.you} vs ${loaderData.opponent} — ${loaderData.pack}`,
      description: `${loaderData.you} plays ${loaderData.yours}; ${loaderData.opponent} plays ${loaderData.theirs}, with source scoring and actions.`,
      path,
      article: true,
    })
    return {
      meta: [
        ...head.meta,
        breadcrumbMeta(match.context.origin, [
          { name: loaderData.pack, path: `/missions/${params.packId}` },
          { name: `${loaderData.you} vs ${loaderData.opponent}`, path },
        ]),
      ],
      links: head.links,
    }
  },
  component: () => <MissionMatchupPage {...Route.useParams()} />,
})
