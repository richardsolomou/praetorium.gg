import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { factionFor } from '../factions'
import { factionsQuery } from '../queries'
import { DetachmentReference } from './DetachmentReference'

export function FactionDetachment() {
  const params = useParams({ strict: false })
  const { data } = useQuery(factionsQuery())
  const faction = factionFor(data, params.catalogueId ?? '')
  if (!faction) return null

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8">
      <Breadcrumb>
        <BreadcrumbList className="eyebrow gap-1 text-info">
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

      <DetachmentReference catalogueId={faction.id} slug={params.detachmentId ?? ''} faction={faction} />
    </main>
  )
}
