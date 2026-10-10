import { useReferenceFaction } from './useReferenceFaction'
import { FactionReferenceLink } from '../../../components/FactionReferenceLink'
import { Link, useParams } from '@tanstack/react-router'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { DetachmentReference } from './DetachmentReference'
import { StartRoster } from '../../rosters/ReferenceRosterActions'

export function FactionDetachment() {
  const params = useParams({ strict: false })
  const faction = useReferenceFaction()
  if (!faction) return null
  const detachmentId = faction.detachments.find((detachment) => detachment.slug === params.detachmentId)?.id

  return (
    <main className="w-full">
      <DetachmentReference
        catalogueId={faction.id}
        slug={params.detachmentId ?? ''}
        detachmentId={detachmentId}
        faction={faction}
        action={detachmentId ? <StartRoster faction={faction} detachmentId={detachmentId} /> : null}
        afterHero={
          <Breadcrumb>
            <BreadcrumbList className="eyebrow gap-1 text-info">
              <BreadcrumbItem>
                <BreadcrumbLink render={<Link to="/factions" />}>Factions</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="text-dim" />
              <BreadcrumbItem>
                <BreadcrumbLink
                  render={
                    <FactionReferenceLink
                      data-onboarding="detachment-breadcrumb"
                      to="/factions/$catalogueId"
                      params={{ catalogueId: faction.slug }}
                    />
                  }
                >
                  {faction.displayName}
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="text-dim" />
              <BreadcrumbItem>
                <BreadcrumbPage className="text-dim">Detachments</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        }
      />
    </main>
  )
}
