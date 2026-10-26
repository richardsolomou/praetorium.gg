import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { posthog } from 'posthog-js'
import { playedArmyDraft, saveRoster, sharedRoster } from '../../functions'
import { ROSTER_NAME_MAX_LENGTH } from '../../../core/battle'
import { NO_PREP, savedDraft } from './rosterDraft'
import { invalidateSavedRosters, meQuery } from '../../queries'
import { useState } from 'react'
import { EMPTY_SETUP, guestDraftOf, newGuestDraft, writeGuestDraft } from './guestDraft'
import { importedSetup, type MatchedImport } from './RosterImport'
import type { RosterSetup } from './RosterSetupDialog'
import type { MissionReference } from './rosterStart'

/** The reference page a roster was started from, as telemetry names it. */
export type RosterReference = 'datasheet' | 'detachment' | 'faction' | MissionReference

/**
 * Starting a roster from a setup and opening it in the builder, with `add` asked of it there.
 *
 * A player's list is saved first; a visitor's is kept on this device, as the builder keeps
 * it. Should the browser refuse to keep it, the setup stays open and says so, since a
 * builder with nowhere to keep the list would lose it on the next reload.
 */
export function useNewRoster(reference?: RosterReference) {
  const { data: me } = useQuery(meQuery())
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const from = reference ? { reference } : {}
  const create = useMutation({
    onMutate: () => posthog.capture('roster_creation_submitted', from),
    onError: () => posthog.capture('roster_creation_failed', { reason: 'request', ...from }),
    mutationFn: ({ setup }: { setup: RosterSetup; add?: string }) =>
      saveRoster({ data: { ...setup, picks: [], prep: null, source: 'editable' } }),
    onSuccess: async ({ id }, { add }) => {
      await invalidateSavedRosters(queryClient)
      await navigate({ to: '/rosters/$id', params: { id }, search: add ? { add } : {} })
    },
  })
  const [refused, setRefused] = useState(false)
  const start = (setup: RosterSetup, add?: string) => {
    if (me) return create.mutate({ setup, add })
    const guest = newGuestDraft(setup)
    if (!writeGuestDraft(guest)) return setRefused(true)
    posthog.capture('guest_roster_started', { limit: setup.limit, detachment_count: setup.detachmentIds.length, ...from })
    void navigate({ to: '/rosters/$id', params: { id: guest.id }, search: add ? { add } : {} })
  }
  /** A visitor's imported list, kept on this device as their one roster and opened in the builder. */
  const keepImported = (imported: MatchedImport) => {
    const guest = guestDraftOf({
      ...EMPTY_SETUP,
      ...importedSetup(imported, EMPTY_SETUP.limit),
      picks: imported.units,
      prep: null,
      source: imported.source,
    })
    if (!writeGuestDraft(guest)) return setRefused(true)
    void navigate({ to: '/rosters/$id', params: { id: guest.id } })
  }
  return {
    start,
    keepImported,
    pending: create.isPending,
    saveError: refused ? 'This browser is not keeping lists. Allow browser storage to build one without an account.' : undefined,
    guest: !me,
  }
}

/** A visitor's copy of a list they can read, kept on this device as their one roster. */
export async function copyRosterToDevice(id: string) {
  const roster = await sharedRoster({ data: { id } })
  if (!roster) throw new Error('That roster could not be loaded.')
  const { id: _source, ...draft } = savedDraft(roster, roster.prep ?? NO_PREP)
  const kept = guestDraftOf({ ...draft, name: draft.name ? `Copy of ${draft.name}`.slice(0, ROSTER_NAME_MAX_LENGTH) : '' })
  if (!writeGuestDraft(kept)) throw new Error('This browser is not keeping lists.')
  return { id: kept.id }
}

/** A visitor's copy of an army from a finished battle they may watch, kept on this device as their one roster. */
export async function copyPlayedArmyToDevice(army: { token: string; playerId: string }) {
  const { id: _none, ...draft } = await playedArmyDraft({ data: army })
  const kept = guestDraftOf({ ...draft, source: 'editable' })
  if (!writeGuestDraft(kept)) throw new Error('This browser is not keeping lists.')
  return { id: kept.id }
}
