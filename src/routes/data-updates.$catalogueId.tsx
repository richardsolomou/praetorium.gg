import { createFileRoute, notFound } from '@tanstack/react-router'
import { CatalogueChangesPage } from '../client/features/changes/CatalogueChangesPage'
import { pageHead } from '../client/linkPreview'
import { catalogueChangeLogQuery, factionQuery, historySearch } from '../client/queries'

export const Route = createFileRoute('/data-updates/$catalogueId')({
  validateSearch: historySearch,
  loaderDeps: ({ search }) => ({ before: search.before }),
  loader: async ({ context, deps, params }) => {
    const faction = await context.queryClient.query({ ...factionQuery(params.catalogueId), staleTime: 'static' })
    if (!faction) throw notFound()
    await context.queryClient.query({ ...catalogueChangeLogQuery(deps.before, faction.slug), staleTime: 'static' })
    return { name: faction.displayName, slug: faction.slug }
  },
  head: ({ loaderData, match }) =>
    loaderData
      ? pageHead(match.context.origin, {
          title: `${loaderData.name} points and datasheet changes`,
          description: `Every ${loaderData.name} points, datasheet and detachment change in the Warhammer 40,000 army data, newest first.`,
          path: match.search.before ? undefined : `/data-updates/${loaderData.slug}`,
        })
      : {},
  component: FactionChangesRoute,
})

function FactionChangesRoute() {
  const { name, slug } = Route.useLoaderData()
  return <CatalogueChangesPage before={Route.useSearch().before} faction={{ name, slug }} />
}
