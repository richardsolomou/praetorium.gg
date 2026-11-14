import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { posthog } from 'posthog-js'
import { type Dispatch, type SetStateAction, useEffect, useState } from 'react'
import { attachedUnitCount } from '../../../core/attachedUnits'
import { ROSTER_NAME_MAX_LENGTH } from '../../../core/battle'
import type { RosterSource, RosterVisibility } from '../../../core/savedRoster'
import { encodeRosterExchange } from '../../../core/rosterExchange'
import {
  copyRoster,
  deleteRoster,
  exportRoster,
  saveRoster,
  setRosterArchived,
  setRosterLocked,
  setRosterVisibility,
  splitRosterVariant,
} from '../../functions'
import { shareLink } from '../../nativeBridge'
import { invalidateSavedRosters, playerDefaultsQuery } from '../../queries'
import type { RosterExchangeCode } from './RosterExchangeDialog'
import type { RosterTextExport } from './RosterExportDialog'
import type { RosterSetup } from './RosterSetupDialog'
import { guestDraftOf, writeGuestDraft } from './guestDraft'
import { exportInput, type RosterDraft } from './rosterDraft'
import type { KeyedPick } from './rosterPicks'

type Setup = Omit<RosterSetup, 'name'>

/** What the roster's menus do to the list as a whole: copy, lock, archive, delete, share, and export it. */
export function useRosterActions({
  savedId,
  battle,
  signedIn,
  setup,
  setSetup,
  listName,
  shownName,
  points,
  picks,
  annotated,
  storedPrep,
  source,
  workspacePath,
  editable,
  applied,
  saveDraft,
}: {
  savedId: string
  battle?: string
  signedIn: boolean
  setup: Setup
  setSetup: Dispatch<SetStateAction<Setup>>
  listName: string
  shownName: string
  points: number | null
  picks: readonly KeyedPick[]
  annotated: RosterDraft['picks']
  storedPrep: RosterDraft['prep']
  source: RosterSource
  workspacePath: string
  editable: boolean
  applied: () => boolean
  saveDraft: () => Promise<unknown>
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [exportText, setExportText] = useState<RosterTextExport | null>(null)
  const [exchangeCode, setExchangeCode] = useState<RosterExchangeCode | null>(null)

  const take = useMutation({
    mutationFn: () =>
      exportRoster({
        data: exportInput({ ...setup, picks: annotated }, shownName || 'Roster'),
      }),
    onSuccess: (exported) => setExportText(exported),
  })

  const exchange = useMutation({
    mutationFn: async () => {
      const exchangeName = shownName || 'Roster'
      const code = await encodeRosterExchange({ ...setup, name: exchangeName, points, picks: annotated })
      return { name: exchangeName, code }
    },
    onSuccess: (code) => setExchangeCode(code),
  })

  // A saved list is copied on the server, which records where the copy came from; a fielded army is copied as shown,
  // and a visitor's copy becomes the one list their device keeps.
  const duplicateRoster = useMutation({
    scope: { id: 'roster-autosave' },
    mutationFn: async () => {
      if (savedId && !battle && signedIn) return copyRoster({ data: { id: savedId, variant: false } })
      const copy = {
        ...setup,
        name: listName ? `Copy of ${listName}`.slice(0, ROSTER_NAME_MAX_LENGTH) : '',
        picks: annotated,
        prep: storedPrep,
        source,
      }
      if (signedIn)
        return saveRoster({
          data: { ...copy, visibility: (await queryClient.query({ ...playerDefaultsQuery(), staleTime: 'static' })).rosterVisibility },
        })
      const kept = guestDraftOf({ ...copy, visibility: 'private' })
      if (!writeGuestDraft(kept)) throw new Error('This browser is not keeping lists.')
      return { id: kept.id }
    },
    onSuccess: async ({ id }) => {
      posthog.capture('roster_duplicated', { unit_count: attachedUnitCount(picks), shared: true })
      await invalidateSavedRosters(queryClient)
      await navigate({ to: '/rosters/$id', params: { id } })
    },
  })

  // Queued behind the autosave, so the variant copies the row the page last sent.
  // The list leaves its variant group but stays open here, so only the group menu changes.
  const splitVariant = useMutation({
    scope: { id: 'roster-autosave' },
    mutationFn: (id: string) => splitRosterVariant({ data: { id } }),
    onSuccess: () => invalidateSavedRosters(queryClient),
  })
  const createVariant = useMutation({
    scope: { id: 'roster-autosave' },
    mutationFn: (id: string) => copyRoster({ data: { id, variant: true } }),
    onSuccess: async ({ id }) => {
      posthog.capture('roster_duplicated', { unit_count: attachedUnitCount(picks), variant: true })
      await invalidateSavedRosters(queryClient)
      await navigate({ to: '/rosters/$id', params: { id } })
    },
  })
  // Queued behind the autosave, so a lock never lands between an edit and its save.
  const lockRoster = useMutation({
    scope: { id: 'roster-autosave' },
    mutationFn: (next: boolean) => setRosterLocked({ data: { id: savedId, locked: next } }),
    onSuccess: () => invalidateSavedRosters(queryClient),
  })
  const archiveRoster = useMutation({
    scope: { id: 'roster-autosave' },
    mutationFn: (next: boolean) => setRosterArchived({ data: { id: savedId, archived: next } }),
    onSuccess: () => invalidateSavedRosters(queryClient),
  })
  // Leaves before refreshing, so this page never asks again for the list it just deleted.
  const removeRoster = useMutation({
    scope: { id: 'roster-autosave' },
    mutationFn: () => deleteRoster({ data: { id: savedId } }),
    onSuccess: async () => {
      await navigate({ to: '/rosters' })
      await invalidateSavedRosters(queryClient)
    },
  })

  const share = useMutation({
    // Unsaved edits land first, while the list is still private, so a save of the older setup cannot undo the promotion.
    mutationFn: async (promote: boolean) => {
      if (editable && !applied()) await saveDraft()
      if (promote) await access.mutateAsync('unlisted')
      return shareLink(`${window.location.origin}${workspacePath}`, shownName || 'Roster')
    },
    onSuccess: (_, promote) => posthog.capture('roster_shared', { visibility_changed: promote }),
    onError: (error) => posthog.captureException(error, { operation: 'roster_share' }),
  })
  const { reset: resetShare } = share
  useEffect(() => {
    if (!share.isSuccess) return
    const timer = setTimeout(resetShare, 4000)
    return () => clearTimeout(timer)
  }, [resetShare, share.isSuccess])
  // Set on the server, then on this page's setup, so the next autosave writes the same visibility rather than the old one.
  const access = useMutation({
    mutationFn: async (next: RosterVisibility) => {
      await setRosterVisibility({ data: { id: savedId, visibility: next } })
      return next
    },
    onSuccess: async (next) => {
      setSetup((current) => ({ ...current, visibility: next }))
      await invalidateSavedRosters(queryClient)
    },
  })

  return {
    take,
    exchange,
    duplicateRoster,
    splitVariant,
    createVariant,
    lockRoster,
    archiveRoster,
    removeRoster,
    share,
    access,
    exportText,
    closeExport: () => setExportText(null),
    exchangeCode,
    closeExchange: () => setExchangeCode(null),
  }
}

export type RosterActions = ReturnType<typeof useRosterActions>
