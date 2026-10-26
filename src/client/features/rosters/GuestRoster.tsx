import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useRouter } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { posthog } from 'posthog-js'
import { listUnitCount } from '../../../core/attachedUnits'
import { Button } from '@/components/ui/button'
import { buttonClass } from '../../components/buttonClass'
import { saveRoster } from '../../functions'
import { PageState } from '../../components/PageState'
import { factionQuery, invalidateSavedRosters, playerDefaultsQuery, priceQuery } from '../../queries'
import { errorMessage } from '../../queryClient'
import { useClientValue, useHydrated } from '../../useClientValue'
import {
  claimInput,
  clearGuestDraft,
  editGuestDraft,
  GUEST_PATH,
  type GuestDraft,
  guestSaveRequested,
  keepReviewedDraft,
  markGuestDraft,
  peekGuestDraft,
  readGuestDraft,
  watchGuestDraft,
} from './guestDraft'
import { ListBuilder } from './ListBuilder'
import { RosterOutline } from './RosterPresentation'
import { saveFailureReason } from './saveFailure'
import { countLabel } from '../../text'
import { useGuestBattle } from '../battles/guestBattle'
import { normalisePicks } from './rosterPicks'
import { adoptVisitorReminders, claimVisitorReminders } from './visitorReminders'
import { rosterUseProblem } from '../../../core/rosterLegality'
import { NO_PREP } from './rosterDraft'

/**
 * A visitor's list, read once the page is in the browser, the only place it lives.
 *
 * The server cannot see browser storage, so it draws the page from the cookie hint;
 * the list arrives as soon as the page mounts. Another tab's edit or claim replaces
 * this tab's copy, and `revision` counts those so the builder can start again from
 * the list that is now kept.
 */
export function useGuestDraft(hinted: boolean) {
  const router = useRouter()
  const ready = useHydrated()
  const stored = useClientValue(peekGuestDraft, null)
  // Set once this page or another tab changes the draft; until then the stored one stands.
  const [changed, setChanged] = useState<{ guest: GuestDraft | null; revision: number }>()
  const guest = changed ? changed.guest : stored
  useEffect(() => {
    // A cookie from another tab, or a draft from before there was one, is set right for the next refresh.
    if (Boolean(readGuestDraft()) !== hinted) {
      markGuestDraft(!hinted)
      void router.invalidate()
    }
  }, [hinted, router])
  useEffect(() => watchGuestDraft((next) => setChanged((current) => ({ guest: next, revision: (current?.revision ?? 0) + 1 }))), [])
  const set = (next: GuestDraft | null) => {
    setChanged((current) => ({ guest: next, revision: current?.revision ?? 0 }))
    void router.invalidate()
  }
  return [{ ready, guest, revision: changed?.revision ?? 0 }, set] as const
}

/** Points, name and legality for the visitor's row on the rosters page, priced as the builder prices the list. */
export function useGuestRosterRow(guest: GuestDraft | null) {
  const draft = guest?.draft
  const price = useQuery({
    ...priceQuery(
      draft?.catalogueId ?? '',
      draft?.detachmentIds ?? [],
      draft?.disposition ?? null,
      draft?.limit ?? 0,
      normalisePicks(draft?.picks ?? []),
      draft?.waivedRules,
      draft?.borrowedDetachmentId,
      draft?.optionalRules,
    ),
    enabled: Boolean(draft),
  })
  const priced = price.data
  return {
    pending: Boolean(draft) && price.isPending,
    failed: price.isError,
    retry: () => void price.refetch(),
    points: priced?.points ?? null,
    label: priced?.label,
    problem: priced && draft ? (rosterUseProblem(priced, draft)?.kind ?? null) : null,
  }
}

/** The builder for the one list a visitor keeps on this device, at the address an account will save it under. */
export function GuestRoster({
  guest,
  requested,
  print,
  onDiscard,
}: {
  guest: GuestDraft
  requested?: Parameters<typeof ListBuilder>[0]['requested']
  print?: boolean
  onDiscard: () => void
}) {
  const navigate = useNavigate()
  const [unkept, setUnkept] = useState(false)
  const factionResult = useQuery(factionQuery(guest.draft.catalogueId))
  const faction = factionResult.data
  const legacyReminders = guest.draft.prep?.reminders
  useEffect(() => adoptVisitorReminders(legacyReminders), [legacyReminders])

  if (factionResult.isPending) return <BuilderFrame />
  // The draft names a faction the army data does not hold now, or none has loaded yet.
  if (!faction) {
    return (
      <PageState
        headingLevel={1}
        eyebrow="Roster builder"
        title="This army is not available"
        explanation="The army data does not have this list's faction right now. Try again shortly, or start a new list."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button disabled={factionResult.isFetching} onClick={() => void factionResult.refetch()}>
              Try again
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                clearGuestDraft()
                onDiscard()
              }}
            >
              Start a new list
            </Button>
          </div>
        }
      />
    )
  }
  return (
    <main className="flex h-full w-full min-w-0 max-w-full flex-col overflow-x-hidden">
      {unkept ? (
        <p role="alert" className="border-b border-discarded/40 bg-discarded/5 px-3 py-2 text-xs text-discarded">
          This browser is not keeping the list. Allow browser storage to save it; reloading will lose it.
        </p>
      ) : null}
      <GuestBattleLink className="border-b" />
      <ListBuilder
        key={guest.id}
        prep={guest.draft.prep ?? NO_PREP}
        initial={{
          ...guest.draft,
          id: '',
          picks: [...guest.draft.picks],
          waivedRules: guest.draft.waivedRules ?? [],
          visibility: 'private',
          source: guest.draft.source ?? 'editable',
        }}
        initialFaction={faction}
        requested={requested}
        print={print}
        guest={{
          onDraftChange: ({ id: _saved, ...draft }) => {
            const kept = editGuestDraft(guest, draft)
            setUnkept(!kept)
            return kept
          },
          onReviewedChange: (draft, source) => {
            const kept = keepReviewedDraft(guest, draft, source)
            setUnkept(!kept)
            return kept
          },
          onSave: () => {
            void navigate({ to: '/sign-in', search: { next: GUEST_PATH, join: true } })
          },
        }}
      />
    </main>
  )
}

const unitCount = (guest: GuestDraft) => listUnitCount(guest.draft.picks)

/**
 * Saving a visitor's list to the account they have just signed in to.
 *
 * Arriving from the save prompt saves it at once; a list found on the device later,
 * perhaps left by someone else, is saved only when the player says so. The list is
 * sent under the id it was built with, so a claim that reloads halfway, or runs in
 * two tabs, updates the one row rather than making another. The draft is kept until
 * the save has landed, and only then forgotten.
 */
export function ClaimGuestRoster({ guest, onDiscard }: { guest: GuestDraft; onDiscard: () => void }) {
  const navigate = useNavigate()
  const router = useRouter()
  const queryClient = useQueryClient()
  const started = useRef(false)
  const [confirming, setConfirming] = useState(() => !guestSaveRequested(guest))
  const returned = useRef(false)
  const claim = useMutation({
    onError: (error) => posthog.capture('guest_roster_save_failed', { reason: saveFailureReason(error) }),
    mutationFn: async (draft: GuestDraft) => {
      const defaults = await queryClient.query({ ...playerDefaultsQuery(), staleTime: 'static' })
      const saved = await saveRoster({ data: { ...claimInput(draft), visibility: defaults.rosterVisibility } })
      await claimVisitorReminders()
      return saved
    },
    onSuccess: async ({ id }, draft) => {
      posthog.capture('guest_roster_saved', { unit_count: unitCount(draft) })
      clearGuestDraft()
      await invalidateSavedRosters(queryClient)
      await navigate({ to: '/rosters/$id', params: { id }, replace: true })
      // A claim made from the draft's own address lands where it started, which reads the saved list once asked again.
      await router.invalidate()
    },
  })
  useEffect(() => {
    if (!returned.current) {
      returned.current = true
      posthog.capture('guest_roster_save_returned', { automatic: !confirming })
    }
    if (confirming || started.current) return
    started.current = true
    claim.mutate(guest)
  }, [claim, confirming, guest])

  const discard = (
    <Button
      variant="outline"
      onClick={() => {
        clearGuestDraft()
        onDiscard()
      }}
    >
      Discard it
    </Button>
  )
  if (confirming) {
    const units = unitCount(guest)
    return (
      <PageState
        headingLevel={1}
        eyebrow="Roster builder"
        title="Save the roster you started?"
        explanation={`${units ? `You built a roster with ${countLabel(units, 'unit')}` : 'You started a roster'} on this device before signing in. Save it to your rosters, or discard it.`}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => setConfirming(false)}>Save it</Button>
            {discard}
          </div>
        }
      />
    )
  }
  if (!claim.isError) return <BuilderFrame />
  return (
    <PageState
      headingLevel={1}
      eyebrow="Roster builder"
      title="Your roster is not saved yet"
      explanation={`It is still here to try again. ${errorMessage(claim.error)}`}
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <Button disabled={claim.isPending} onClick={() => claim.mutate(guest)}>
            Try again
          </Button>
          {discard}
        </div>
      }
    />
  )
}

/** The way back for a guest who left their battle to build the list they bring to it. */
export function GuestBattleLink({ className = 'border' }: { className?: string }) {
  const battle = useGuestBattle()
  if (!battle) return null
  return (
    <div className={`flex flex-wrap items-center gap-2 border-primary/40 bg-primary/5 px-3 py-2 text-xs ${className}`}>
      <p className="min-w-0 flex-1">This device keeps your list. Bring it to your battle when it is ready.</p>
      <Link to="/battles/$token" params={{ token: battle }} className={buttonClass({ size: 'sm' })}>
        Back to your battle
      </Link>
    </div>
  )
}

export function BuilderFrame() {
  return (
    <main className="flex h-full w-full min-w-0 max-w-full flex-col overflow-x-hidden">
      <RosterOutline />
    </main>
  )
}
