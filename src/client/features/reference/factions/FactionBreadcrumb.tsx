import { Link } from '@tanstack/react-router'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { FactionReferenceLink } from '../../../components/FactionReferenceLink'

/** The way back up from a faction's reference page, through its datasheets when the page is one of them. */
export function FactionBreadcrumb({
  faction,
  datasheets = false,
}: {
  faction: { slug: string; displayName: string }
  datasheets?: boolean
}) {
  return (
    <Breadcrumb>
      <BreadcrumbList className="eyebrow gap-1 text-info">
        <BreadcrumbItem>
          <BreadcrumbLink render={<Link to="/factions" />}>Factions</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator className="text-dim" />
        <BreadcrumbItem>
          <BreadcrumbLink render={<FactionReferenceLink to="/factions/$catalogueId" params={{ catalogueId: faction.slug }} />}>
            {faction.displayName}
          </BreadcrumbLink>
        </BreadcrumbItem>
        {datasheets ? (
          <>
            <BreadcrumbSeparator className="text-dim" />
            <BreadcrumbItem>
              <BreadcrumbLink
                render={<FactionReferenceLink to="/factions/$catalogueId/datasheets" params={{ catalogueId: faction.slug }} />}
              >
                Datasheets
              </BreadcrumbLink>
            </BreadcrumbItem>
          </>
        ) : null}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
