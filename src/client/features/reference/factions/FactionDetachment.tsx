import { useReferenceFaction } from './useReferenceFaction'
import { useParams } from '@tanstack/react-router'
import { FactionBreadcrumb } from './FactionBreadcrumb'
import { DetachmentReference } from './DetachmentReference'
import { StartRoster } from '../../rosters/ReferenceRosterActions'
import { NextStep } from '../NextStep'
import { ContinueGuestDraft } from '../../rosters/ContinueGuestDraft'

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
        afterHero={
          <>
            <FactionBreadcrumb faction={faction} />
            <ContinueGuestDraft surface="detachment" />
          </>
        }
        closing={
          detachment ? (
            <NextStep
              title={`Build a list with ${detachment.name}`}
              description="Your faction and detachment are already filled in."
              action={<StartRoster faction={faction} detachmentId={detachment.id} closing />}
            />
          ) : null
        }
      />
    </main>
  )
}
