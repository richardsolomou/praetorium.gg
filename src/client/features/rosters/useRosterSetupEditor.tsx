import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import type { RosterPick } from '../../../core/roster'
import { currentCatalogueFamilyId } from '../../../core/retiredCatalogueIds'
import { saveRoster } from '../../functions'
import { requireReviewedRoster } from '../../offline/reviewedRoster'
import { invalidateSavedRosters } from '../../queries'
import { draftKey, NO_PREP, type RosterDraft } from './rosterDraft'
import { convertAsVariantOf } from './rosterLibrary'
import type { RosterSetupReview } from './rosterSetupReview'
import { RosterSetupDialog, type RosterSetup } from './RosterSetupDialog'
import { SETUP_STATE, useWorkspaceState } from './workspaceState'

type SetupDialogProps = Parameters<typeof RosterSetupDialog>[0]

/**
 * Editing the roster's setup, or converting it to the current rules, through a reviewed save.
 *
 * The open draft is kept with the workspace, so it is still open when the player comes back.
 */
export function useRosterSetupEditor({
  workspacePath,
  editable,
  guest,
  savedId,
  setup,
  listName,
  label,
  faction,
  factions,
  hasUnits,
  draft,
  saving,
  markSaved,
  adopt,
  onFactionChanged,
}: {
  workspacePath: string
  editable: boolean
  guest?: { onReviewedChange: (draft: RosterDraft, source: RosterDraft) => boolean }
  savedId: string
  setup: Omit<RosterSetup, 'name'>
  listName: string
  label: string
  faction: SetupDialogProps['initialFaction']
  factions: SetupDialogProps['factionOptions']
  hasUnits: boolean
  draft: RosterDraft
  saving: boolean
  markSaved: (key: string, updatedAt: number) => void
  /** Takes the reviewed roster into the builder in place of the one it replaced. */
  adopt: (saved: RosterSetup, picks: readonly RosterPick[], prep: NonNullable<RosterDraft['prep']>) => void
  onFactionChanged: () => void
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [setupDraft, setSetupDraft] = useWorkspaceState<RosterSetup>(workspacePath, SETUP_STATE)
  const [setupMode, setSetupMode] = useState<'edit' | 'convert'>('edit')
  const editingSetup = setupDraft !== null
  const { catalogueId } = setup

  const openSetup = () => {
    setSetupMode('edit')
    setSetupDraft({ ...setup, name: listName })
  }
  const setupSave = useMutation({
    scope: { id: 'roster-autosave' },
    mutationFn: async (review: RosterSetupReview) => {
      requireReviewedRoster(draft, review.source)
      if (guest) {
        if (!guest.onReviewedChange(review.candidate, review.source)) throw new Error('This browser could not keep the reviewed roster.')
        return { updatedAt: Date.now() }
      }
      return saveRoster({ data: review.candidate }, review.source, review.ownerId, review.serverSave)
    },
  })
  const applySetup = async (saved: RosterSetup, review?: RosterSetupReview, options?: { keepOriginal: boolean }) => {
    if (!review) throw new Error('Review the roster before saving changes.')
    if (options?.keepOriginal) {
      const { id } = await convertAsVariantOf(review)
      setSetupDraft(null)
      await invalidateSavedRosters(queryClient)
      await navigate({ to: '/rosters/$id', params: { id } })
      return
    }
    const { updatedAt } = await setupSave.mutateAsync(review)
    markSaved(draftKey(review.candidate), updatedAt)
    const changedFaction = currentCatalogueFamilyId(saved.catalogueId) !== currentCatalogueFamilyId(catalogueId)
    adopt(saved, review.candidate.picks, review.candidate.prep ?? NO_PREP)
    if (changedFaction) onFactionChanged()
    setSetupDraft(null)
    await invalidateSavedRosters(queryClient)
  }
  const setupDialog =
    editable && editingSetup ? (
      <RosterSetupDialog
        mode={setupMode}
        sourceCatalogueId={catalogueId}
        open={editingSetup}
        onOpenChange={(open) => !open && setSetupDraft(null)}
        factionOptions={factions}
        initialFaction={faction}
        value={setupDraft}
        onDraftChange={setSetupDraft}
        guest={Boolean(guest)}
        hasUnits={hasUnits}
        reviewSource={draft}
        pending={saving || setupSave.isPending}
        namePlaceholder={label}
        canKeepOriginal={Boolean(savedId && !guest)}
        onSave={applySetup}
      />
    ) : null

  return {
    openSetup,
    convertSetup: () => {
      openSetup()
      setSetupMode('convert')
    },
    setupDialog,
  }
}
