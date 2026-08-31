import { useMutation, useQueryClient } from '@tanstack/react-query'
import posthog from 'posthog-js'
import { useState } from 'react'
import { ROSTER_NAME_MAX_LENGTH } from '../../../core/battle'
import { deleteRoster, exportRoster, saveRoster, setRosterVisibility, sharedRoster } from '../../../server/functions'
import { invalidateSavedRosters, savedRosterSummariesQuery } from '../../queries'
import { errorMessage } from '../../queryClient'
import { shareLink } from '../../nativeBridge'
import type { RosterSetup } from '../RosterSetupDialog'

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
  const refresh = () => invalidateSavedRosters(queryClient)

  const [shareFeedback, setShareFeedback] = useState<{ id: string; result: 'copied' | 'shared' } | null>(null)
  const [shareProblem, setShareProblem] = useState<string | null>(null)
  const [exportText, setExportText] = useState<string | null>(null)
  const load = async (roster: SavedRoster) => {
    const complete = await sharedRoster({ data: { id: roster.id } })
    if (!complete) throw new Error('That roster could not be loaded.')
    return complete
  }

  const duplicate = useMutation({
    mutationFn: async (summary: SavedRoster) => {
      const roster = await load(summary)
      return saveRoster({
        data: {
          name: `Copy of ${roster.name}`.slice(0, ROSTER_NAME_MAX_LENGTH),
          catalogueId: roster.catalogueId,
          detachmentIds: roster.detachmentIds,
          disposition: roster.disposition,
          limit: roster.limit,
          picks: roster.picks,
          prep: roster.prep,
          visibility: roster.visibility,
          source: roster.source,
        },
      })
    },
    onSuccess: (_result, roster) => {
      posthog.capture('roster_duplicated', { unit_count: roster.unitCount })
      return refresh()
    },
  })

  const remove = useMutation({ mutationFn: (id: string) => deleteRoster({ data: { id } }), onSuccess: refresh })

  const access = useMutation({
    mutationFn: ({ id, visibility }: { id: string; visibility: 'private' | 'unlisted' }) =>
      setRosterVisibility({ data: { id, visibility } }),
    onSuccess: refresh,
  })

  const take = useMutation({
    mutationFn: async (summary: SavedRoster) => {
      const roster = await load(summary)
      return exportRoster({
        data: {
          catalogueId: roster.catalogueId,
          detachmentIds: roster.detachmentIds,
          disposition: roster.disposition,
          limit: roster.limit,
          name: roster.name,
          units: roster.picks,
        },
      })
    },
    onSuccess: ({ text }) => setExportText(text),
  })

  const update = useMutation({
    mutationFn: async ({ roster: summary, setup }: { roster: SavedRoster; setup: RosterSetup }) => {
      const roster = await load(summary)
      return saveRoster({
        data: {
          id: roster.id,
          ...setup,
          // A new faction is a new list: nothing picked from the old book still applies.
          picks: setup.catalogueId === roster.catalogueId ? roster.picks : [],
          prep: roster.prep,
          visibility: setup.visibility,
          source: roster.source,
        },
      })
    },
    onSuccess: refresh,
  })

  /**
   * Copies a link, making the list unlisted first when it is not already.
   *
   * A copy that fails after the list was opened up leaves it private again: the
   * player asked for a link, not for their list to be readable by anyone holding one.
   */
  const share = async (roster: SavedRoster) => {
    const promoted = roster.visibility === 'private'
    setShareProblem(null)
    try {
      if (promoted) await access.mutateAsync({ id: roster.id, visibility: 'unlisted' })
      const result = await shareLink(`${origin}/rosters/${roster.id}`, roster.name)
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
    remove,
    access,
    take,
    update,
    share,
    print: (id: string) => window.open(`/rosters/${id}?print=true`, '_blank'),
    shareFeedback,
    shareProblem,
    exportText,
    clearExport: () => setExportText(null),
  }
}

export type RosterActions = ReturnType<typeof useRosterActions>
