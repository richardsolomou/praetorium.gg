import { useReferenceFaction } from './useReferenceFaction'
import { useParams } from '@tanstack/react-router'
import { FactionBreadcrumb } from './FactionBreadcrumb'
import { DetachmentReference } from './DetachmentReference'
import { StartRoster } from '../../rosters/ReferenceRosterActions'

export function FactionDetachment() {
  const params = useParams({ strict: false })
  const faction = useReferenceFaction()
  if (!faction) return null
  const detachment = faction.detachments.find((candidate) => candidate.slug === params.detachmentId)
  const detachmentId = detachment?.id

  return (
    <main className="w-full">
      <DetachmentReference
        catalogueId={faction.id}
        slug={params.detachmentId ?? ''}
        detachmentId={detachmentId}
        faction={faction}
        action={detachmentId ? <StartRoster faction={faction} detachmentId={detachmentId} /> : null}
        afterHero={<FactionBreadcrumb faction={faction} />}
        closing={
          detachment ? (
            <section className="part flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <h2 className="text-lg">Build a list with {detachment.name}</h2>
                <p className="text-sm text-dim">Your faction and detachment are already filled in.</p>
              </div>
              <StartRoster faction={faction} detachmentId={detachment.id} closing />
            </section>
          ) : null
        }
      />
    </main>
  )
}
