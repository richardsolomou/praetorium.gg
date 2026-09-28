import { createFileRoute, notFound } from '@tanstack/react-router'
import { unitCostsSummary } from '../client/datasheet'
import { FactionDatasheet } from '../client/features/reference/factions/FactionDatasheet'
import { breadcrumbMeta, canonicalLink } from '../client/linkPreview'
import { datasheetSlugQuery, factionQuery } from '../client/queries'

export const Route = createFileRoute('/factions/$catalogueId/datasheets/$entryId')({
  loader: async ({ context, params }) => {
    const faction = await context.queryClient.query({ ...factionQuery(params.catalogueId), staleTime: 'static' })
    if (!faction) throw notFound()
    const sheet = await context.queryClient.query({ ...datasheetSlugQuery(faction.id, params.entryId), staleTime: 'static' })
    if (!sheet) throw notFound()
    return { faction, sheet }
  },
  head: ({ loaderData, match }) => {
    if (!loaderData) return {}
    const { faction, sheet } = loaderData
    const origin = match.context.origin
    const factionPath = `/factions/${faction.slug}`
    const path = `${factionPath}/datasheets/${sheet.slug}`
    const costs = unitCostsSummary(sheet.costs)
    const description = costs
      ? `${sheet.name}, ${faction.displayName}: ${costs}. Profiles, weapons, abilities, wargear and composition.`
      : `${sheet.name} profiles, weapons, abilities, wargear, composition and points for ${faction.displayName}.`
    return {
      meta: [
        { title: `${sheet.name} datasheet — ${faction.displayName} — Praetorium` },
        { name: 'description', content: description },
        { property: 'og:title', content: `${sheet.name} datasheet` },
        { property: 'og:description', content: description },
        { property: 'og:type', content: 'article' },
        breadcrumbMeta(origin, [
          { name: 'Factions', path: '/factions' },
          { name: faction.displayName, path: factionPath },
          { name: sheet.name, path },
        ]),
      ],
      links: [canonicalLink(origin, path)],
    }
  },
  component: FactionDatasheet,
})
