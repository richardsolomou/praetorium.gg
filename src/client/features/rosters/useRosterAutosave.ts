import { useMutation, useQueryClient } from '@tanstack/react-query'
import { posthog } from 'posthog-js'
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import type { RosterPick } from '../../../core/roster'
import { saveRoster } from '../../functions'
import { invalidateSavedRosters } from '../../queries'
import { localEngine } from '../../offline/localRuntime'
import { useSettled } from '../../useSettled'
import { draftKey, type RosterDraft, rosterDraftOf, savedDraft } from './rosterDraft'
import type { RosterSetup } from './RosterSetupDialog'
import { saveFailureReason } from './saveFailure'

type OpenedRoster = Parameters<typeof savedDraft>[0] & { picks: RosterPick[]; updatedAt?: number }
type SavedPrep = Parameters<typeof savedDraft>[1]

/**
 * The builder's draft and the autosave that keeps the saved row in step with it.
 *
 * `reload` takes the copy the page was opened with into the builder again, once a
 * newer saved copy arrives and nothing on this page is waiting to be saved.
 */
export function useRosterAutosave({
  initial,
  prep,
  name,
  setup,
  savedPrep,
  annotated,
  editable,
  guest,
  remindersPending,
  reload,
}: {
  initial: OpenedRoster
  prep: SavedPrep
  name: string
  setup: Omit<RosterSetup, 'name'>
  savedPrep: SavedPrep
  annotated: RosterDraft['picks']
  editable: boolean
  guest?: { onDraftChange: (draft: RosterDraft) => boolean }
  remindersPending: boolean
  reload: () => void
}) {
  const savedId = initial.id
  const queryClient = useQueryClient()
  const listName = name.trim()
  const storedPrep = useMemo(
    () => ({ stratagems: savedPrep.stratagems, secondaries: savedPrep.secondaries, remindersEnabled: true }),
    [savedPrep],
  )
  const draft = rosterDraftOf({ ...setup, name }, { id: savedId || undefined, picks: annotated, prep: storedPrep, source: initial.source })
  const currentDraftKey = draftKey(draft)
  // The last draft sent, starting from the row the list was opened from. A list nobody
  // has saved yet has no row, so its first draft is always sent.
  const [openedAs] = useState(() => (savedId ? draftKey(savedDraft(initial, prep)) : null))
  const lastSaved = useRef(openedAs)
  const lastApplied = useRef(openedAs)
  // A refetch can settle this save while the page still holds the copy from before it,
  // so a copy is only adopted if the server wrote it at or after the newest save.
  const savedAt = useRef(initial.updatedAt ?? 0)
  const save = useMutation({
    scope: { id: 'roster-autosave' },
    mutationFn: async () => {
      const { updatedAt } = await saveRoster({ data: draft })
      return { key: currentDraftKey, updatedAt }
    },
    onSuccess: async ({ key, updatedAt }) => {
      lastApplied.current = key
      savedAt.current = Math.max(savedAt.current, updatedAt)
      // A queued save reaches the server later; its acknowledgement refreshes saved rosters then.
      if (!localEngine()) await invalidateSavedRosters(queryClient)
    },
    // What the row holds is unknown after a failure, so the next draft is sent whatever it is.
    onError: (error) => {
      lastSaved.current = null
      posthog.capture('roster_save_failed', { reason: saveFailureReason(error) })
    },
  })

  // Held steppers and typed names change many times a second; the settled values
  // trigger one save per pause while the mutation still reads the newest draft.
  const settledPicks = useSettled(annotated)
  const settledListName = useSettled(listName)
  const adoptSaved = useEffectEvent(reload)
  useEffect(() => {
    if (!savedId) return
    const incoming = draftKey(savedDraft(initial, prep))
    if (incoming === lastApplied.current || (initial.updatedAt ?? 0) < savedAt.current) return
    if (save.isPending || currentDraftKey !== lastSaved.current || settledListName !== listName || settledPicks !== annotated) return

    lastApplied.current = incoming
    lastSaved.current = incoming
    adoptSaved()
  }, [annotated, currentDraftKey, initial, listName, prep, save.isPending, savedId, settledListName, settledPicks])
  const saveDraft = () => {
    if (!editable || !setup.catalogueId) return
    if (currentDraftKey === lastSaved.current) return
    lastSaved.current = currentDraftKey
    if (guest) guest.onDraftChange(draft)
    else save.mutate()
  }
  // Leaving inside a settle pause would otherwise drop the last edit, and a seal right after would read the list without it.
  const saveDraftOnLeave = useRef(saveDraft)
  saveDraftOnLeave.current = saveDraft
  useEffect(() => () => saveDraftOnLeave.current(), [])
  useEffect(() => {
    saveDraft()
    // The mutation reads the complete rendered draft. A later render queues behind
    // this one, so the final request always contains the newest state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editable, settledListName, settledPicks, setup, storedPrep])

  /** Whether the server holds the draft this page shows. */
  const applied = useCallback(() => currentDraftKey === lastApplied.current, [currentDraftKey])
  /** Records a save made outside the autosave, so the autosave does not send the same row again. */
  const markSaved = useCallback((key: string, updatedAt: number) => {
    lastSaved.current = key
    lastApplied.current = key
    savedAt.current = Math.max(savedAt.current, updatedAt)
  }, [])
  // Between an edit settling and its save starting, nothing is pending yet, so an
  // unconfirmed draft counts as saving too; otherwise the page reads saved for a render.
  const saving =
    !guest &&
    (save.isPending ||
      remindersPending ||
      settledPicks !== annotated ||
      settledListName !== listName ||
      (editable && currentDraftKey !== lastApplied.current))

  return { draft, storedPrep, save, saving, applied, markSaved }
}
