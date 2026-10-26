import { useReferenceFaction } from './useReferenceFaction'
import { useParams } from '@tanstack/react-router'
import { FactionBreadcrumb } from './FactionBreadcrumb'
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
        afterHero={<FactionBreadcrumb faction={faction} />}
      />
    </main>
  )
}
