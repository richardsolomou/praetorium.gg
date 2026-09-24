import { createFileRoute, notFound } from '@tanstack/react-router'
import { updateSummary } from '../core/catalogueHistory'
import { CatalogueUpdatePage } from '../client/features/changes/CatalogueUpdatePage'
import { pageMeta } from '../client/linkPreview'
import { catalogueUpdateQuery } from '../client/queries'

export const Route = createFileRoute('/changes/$update')({
  loader: async ({ context, params }) => {
    if (!/^[0-9a-f]{16}$/.test(params.update)) throw notFound()
    const update = await context.queryClient.query({ ...catalogueUpdateQuery(params.update), staleTime: 'static' })
    if (!update) throw notFound()
    return update
  },
  head: ({ match, loaderData }) => {
    if (!loaderData) return {}
    // A date read the same on every server, where a locale's format would not be.
    const day = new Date(loaderData.recordedAt).toISOString().slice(0, 10)
    const summary = updateSummary(loaderData)
    const reached = summary.factions
      .slice(0, 3)
      .map((faction) => `${faction.faction} ${faction.count}`)
      .join(', ')
    return {
      meta: pageMeta(match.context.origin, {
        title: `Data update of ${day}`,
        description: `${summary.total} ${summary.total === 1 ? 'change' : 'changes'} to Warhammer 40,000 army data${reached ? `: ${reached}` : ''}${summary.factions.length > 3 || summary.more ? ' and more' : ''}.`,
        path: `/changes/${loaderData.id}`,
      }),
    }
  },
  component: UpdateRoute,
})

function UpdateRoute() {
  return <CatalogueUpdatePage id={Route.useParams().update} />
}
