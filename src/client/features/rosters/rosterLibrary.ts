import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { posthog } from 'posthog-js'
import { useState } from 'react'
import type { RosterTextExport } from './RosterExportDialog'
import type { RosterExchangeCode } from './RosterExchangeDialog'
import { encodeRosterExchange } from '../../../core/rosterExchange'
import type { RosterVisibility } from '../../../core/savedRoster'
import {
  copyRoster,
  deleteRoster,
  exportRoster,
  saveRoster,
  setRosterArchived,
  setRosterLocked,
  setRosterVisibility,
  sharedRoster,
} from '../../functions'
import { invalidateSavedRosters, savedRosterSummariesQuery } from '../../queries'
import { errorMessage } from '../../queryClient'
import { shareLink } from '../../nativeBridge'
import type { RosterSetupReview } from './rosterSetupReview'

/** One saved list, as the library reads it back. */
export type SavedRoster = Awaited<ReturnType<NonNullable<ReturnType<typeof savedRosterSummariesQuery>['queryFn']>>>[number]

/**
 * Everything a saved list can have done to it from the library.
 *
 * Gathered here because the same six actions are offered twice on every row — from
 * the overflow button and from the right-click menu — and because sharing has a
 * rollback that has no business in a component.
 */
export function useRosterActions(origin: string) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const refresh = () => invalidateSavedRosters(queryClient)

  const [shareFeedback, setShareFeedback] = useState<{ id: string; result: 'copied' | 'shared' } | null>(null)
  const [shareProblem, setShareProblem] = useState<string | null>(null)
  const [exportText, setExportText] = useState<RosterTextExport | null>(null)
  const [exchangeCode, setExchangeCode] = useState<RosterExchangeCode | null>(null)
  const load = async (roster: SavedRoster) => {
    const complete = await sharedRoster({ data: { id: roster.id } })
    if (!complete) throw new Error('That roster could not be loaded.')
    return complete
  }

  // A variant exists to be changed, so it opens; a duplicate stays in the library.
  const copying = (variant: boolean) => ({
    mutationFn: (roster: SavedRoster) => copyRoster({ data: { id: roster.id, variant } }),
    onSuccess: async ({ id }: { id: string }, roster: SavedRoster) => {
      posthog.capture('roster_duplicated', { unit_count: roster.unitCount, variant })
      await refresh()
      if (variant) await navigate({ to: '/rosters/$id', params: { id } })
    },
  })
  const duplicate = useMutation(copying(false))
  const variant = useMutation(copying(true))

  const remove = useMutation({ mutationFn: (id: string) => deleteRoster({ data: { id } }), onSuccess: refresh })

  const access = useMutation({
    mutationFn: ({ id, visibility }: { id: string; visibility: RosterVisibility }) => setRosterVisibility({ data: { id, visibility } }),
    onSuccess: refresh,
  })

  const lock = useMutation({
    mutationFn: ({ id, locked }: { id: string; locked: boolean }) => setRosterLocked({ data: { id, locked } }),
    onSuccess: refresh,
  })

  const archive = useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) => setRosterArchived({ data: { id, archived } }),
    onSuccess: refresh,
  })

  // Another tool has nowhere to put a list with no name, so an export and a share
  // sheet are handed what the library calls it.
  const take = useMutation({
    mutationFn: async ({ roster: summary, title }: { roster: SavedRoster; title: string }) => {
      const roster = await load(summary)
      return exportRoster({
        data: {
          catalogueId: roster.catalogueId,
          detachmentIds: roster.detachmentIds,
          disposition: roster.disposition,
          limit: roster.limit,
          name: roster.name || title,
          units: roster.picks,
          waivedRules: roster.waivedRules,
        },
      })
    },
    onSuccess: (exported) => setExportText(exported),
  })

  const exchange = useMutation({
    mutationFn: async ({ roster: summary, title, points }: { roster: SavedRoster; title: string; points: number | null }) => {
      const roster = await load(summary)
      const name = roster.name || title
      return { name, code: await encodeRosterExchange({ ...roster, name, points }) }
    },
    onSuccess: (code) => setExchangeCode(code),
  })

  const update = useMutation({
    mutationFn: async (review: RosterSetupReview) =>
      saveRoster({ data: review.candidate }, review.source, review.ownerId, review.serverSave),
    onSuccess: refresh,
  })

  const convertAsVariant = useMutation({
    mutationFn: (review: RosterSetupReview) => convertAsVariantOf(review),
    onSuccess: refresh,
  })

  /**
   * Copies a link, making the list unlisted first when it is not already.
   *
   * A copy that fails after the list was opened up leaves it private again: the
   * player asked for a link, not for their list to be readable by anyone holding one.
   */
  const share = async (roster: SavedRoster, title: string) => {
    const promoted = roster.visibility === 'private'
    setShareProblem(null)
    try {
      if (promoted) await access.mutateAsync({ id: roster.id, visibility: 'unlisted' })
      const result = await shareLink(`${origin}/rosters/${roster.id}`, roster.name || title)
      posthog.capture('roster_shared', { visibility_changed: promoted })
      setShareFeedback({ id: roster.id, result })
    } catch (error) {
      posthog.captureException(error, { operation: 'roster_share' })
      let problem = errorMessage(error)
      if (promoted) {
        try {
          await access.mutateAsync({ id: roster.id, visibility: 'private' })
        } catch (rollbackError) {
          posthog.captureException(rollbackError, { operation: 'roster_share_rollback' })
          problem = `${problem}. The roster could not be made private again: ${errorMessage(rollbackError)}`
        }
      }
      setShareProblem(problem)
    }
  }

  return {
    duplicate,
    variant,
    remove,
    access,
    lock,
    archive,
    take,
    exchange,
    update,
    convertAsVariant,
    share,
    print: (id: string) => window.open(`/rosters/${id}?print=true`, '_blank'),
    shareFeedback,
    shareProblem,
    exportText,
    clearExport: () => setExportText(null),
    exchangeCode,
    clearExchange: () => setExchangeCode(null),
  }
}

export type RosterActions = ReturnType<typeof useRosterActions>

/** A reviewed conversion saved beside its original, which keeps its rules version. */
export async function convertAsVariantOf(review: RosterSetupReview) {
  if (!review.source.id) throw new Error('Save this roster before keeping a converted copy.')
  const copied = await copyRoster({ data: { id: review.source.id, variant: true, setup: review.candidate } })
  posthog.capture('roster_duplicated', { unit_count: review.candidate.picks.length, variant: true, converted: true })
  return copied
}
