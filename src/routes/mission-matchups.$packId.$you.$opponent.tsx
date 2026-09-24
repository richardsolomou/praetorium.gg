import { createFileRoute, notFound } from '@tanstack/react-router'
import { MissionMatchupPage } from '../client/features/reference/missions/MissionMatchupPage'
import { gameReferencesQuery, terrainMatchupIds, terrainReferencesQuery } from '../client/queries'

export const Route = createFileRoute('/mission-matchups/$packId/$you/$opponent')({
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
  head: ({ loaderData, params }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.you} vs ${loaderData.opponent} — ${loaderData.pack} — Praetorium` },
          {
            name: 'description',
            content: `${loaderData.you} plays ${loaderData.yours}; ${loaderData.opponent} plays ${loaderData.theirs}, with source scoring and actions.`,
          },
          { property: 'og:title', content: `${loaderData.you} vs ${loaderData.opponent}` },
          {
            property: 'og:description',
            content: `${loaderData.you} plays ${loaderData.yours}; ${loaderData.opponent} plays ${loaderData.theirs}, with source scoring and actions.`,
          },
          { property: 'og:type', content: 'article' },
        ]
      : [],
    links: loaderData ? [{ rel: 'canonical', href: `/mission-matchups/${params.packId}/${params.you}/${params.opponent}` }] : [],
  }),
  component: () => <MissionMatchupPage {...Route.useParams()} />,
})
