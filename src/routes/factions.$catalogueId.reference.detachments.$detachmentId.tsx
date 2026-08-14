import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, notFound, useParams } from '@tanstack/react-router'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { DetachmentReference } from '../client/components/DetachmentReference'
import { factionFor } from '../client/factions'
import { detachmentDetailQuery, factionsQuery } from '../client/queries'

export const Route = createFileRoute('/factions/$catalogueId/reference/detachments/$detachmentId')({
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(factionsQuery())
    const faction = factionFor(data, params.catalogueId)
    if (!faction || !(await context.queryClient.ensureQueryData(detachmentDetailQuery(faction.id, params.detachmentId)))) {
      throw notFound()
    }
  },
  component: DetachmentPage,
})

export function DetachmentPage() {
  const params = useParams({ strict: false })
  const { data } = useQuery(factionsQuery())
  const faction = factionFor(data, params.catalogueId ?? '')
  if (!faction) return null

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <Breadcrumb>
        <BreadcrumbList className="eyebrow gap-1 text-azure">
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link to="/factions" />}>Factions</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator className="text-dim" />
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link to="/factions/$catalogueId" params={{ catalogueId: faction.slug }} />}>
              {faction.displayName}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator className="text-dim" />
          <BreadcrumbItem>
            <BreadcrumbPage className="text-dim">Detachments</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <DetachmentReference catalogueId={faction.id} slug={params.detachmentId ?? ''} />
    </main>
  )
}
