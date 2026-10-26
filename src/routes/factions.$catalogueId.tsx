import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { z } from 'zod'
import { loadReferenceFaction } from '../client/queries'
import { factionReferenceHref, factionReferenceRoute } from '../core/factionReferenceRoute'

export const Route = createFileRoute('/factions/$catalogueId')({
  validateSearch: z.object({
    rules: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9-]+$/)
      .optional()
      .catch(undefined),
  }),
  loaderDeps: ({ search }) => ({ rules: search.rules }),
  loader: async ({ context, location, params, deps }) => {
    const versioned = location.pathname.startsWith(`/factions/${params.catalogueId}/rules/`)
    const faction = await loadReferenceFaction(context.queryClient, params.catalogueId, versioned ? undefined : deps.rules)
    if (!faction) throw notFound()
    const route = factionReferenceRoute(faction)
    if (!versioned && (params.catalogueId !== route.catalogueId || deps.rules || route.rulesVersion))
      throw redirect({
        href: factionReferenceHref(faction, location.pathname.slice(`/factions/${params.catalogueId}`.length)),
        replace: true,
      })
    return { faction }
  },
})
