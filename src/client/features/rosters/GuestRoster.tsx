import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useRouter } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { Button, buttonVariants } from '@/components/ui/button'
import { saveRoster } from '../../../server/functions'
import { PageContent, PageHeader } from '../../components/Page'
import { PageState } from '../../components/PageState'
import { factionIndexQuery, factionQuery, invalidateSavedRosters } from '../../queries'
import { errorMessage } from '../../queryClient'
import {
  claimInput,
  clearGuestDraft,
  EMPTY_SETUP,
  GUEST_PATH,
  type GuestDraft,
  markGuestDraft,
  newGuestDraft,
  readGuestDraft,
  writeGuestDraft,
} from './guestDraft'
import { ListBuilder } from './ListBuilder'
import { RosterBody, RosterShell } from './RosterPresentation'
import { RosterSetupDialog } from './RosterSetupDialog'

const NO_PREP = { stratagems: [], secondaries: [], reminders: [], remindersEnabled: true }

/**
 * A visitor's list, read once the page is in the browser, the only place it lives.
 *
 * The server cannot see session storage, so it draws the page as if there were no
 * draft, which is what almost every visit is; a visitor coming back to one moves on
 * to it as soon as the page mounts.
 */
export function useGuestDraft(hinted: boolean) {
  const router = useRouter()
  const [state, setState] = useState<{ ready: boolean; guest: GuestDraft | null }>({ ready: false, guest: null })
  useEffect(() => {
    const guest = readGuestDraft()
    setState({ ready: true, guest })
    // A cookie from another tab, or a draft from before there was one, is set right for the next refresh.
    if (Boolean(guest) !== hinted) {
      markGuestDraft(Boolean(guest))
      void router.invalidate()
    }
  }, [hinted, router])
  const set = (guest: GuestDraft | null) => {
    setState({ ready: true, guest })
    void router.invalidate()
  }
  return [state, set] as const
}

export function GuestRoster({ guest, onStart }: { guest: GuestDraft | null; onStart: (guest: GuestDraft) => void }) {
  const navigate = useNavigate()
  const [unkept, setUnkept] = useState(false)
  const { data: factionIndex } = useQuery(factionIndexQuery())
  const { data: faction } = useQuery({ ...factionQuery(guest?.draft.catalogueId ?? ''), enabled: Boolean(guest) })

  // Nothing is built yet, so the setup is the page rather than a dialog over an empty one.
  if (!guest) {
    return (
      <main className="w-full">
        <PageHeader
          eyebrow="Roster builder"
          title="Build a roster"
          description="Pick an army and start adding units. Sign up when you want to keep the list."
          actions={
            <Link to="/sign-in" search={{ next: GUEST_PATH }} className={buttonVariants({ variant: 'outline' })}>
              Sign in
            </Link>
          }
        />
        <PageContent className="pt-6">
          <RosterSetupDialog
            mode="create"
            guest
            inline
            open
            onOpenChange={() => {}}
            factionOptions={factionIndex?.factions ?? []}
            value={EMPTY_SETUP}
            hasUnits={false}
            onSave={(setup) => {
              const started = newGuestDraft(setup)
              setUnkept(!writeGuestDraft(started))
              onStart(started)
            }}
          />
        </PageContent>
      </main>
    )
  }
  if (!faction) return <BuilderFrame />
  return (
    <main className="flex h-full w-full min-w-0 max-w-full flex-col overflow-x-hidden">
      {unkept ? (
        <p role="alert" className="border-b border-discarded/40 bg-discarded/5 px-3 py-2 text-xs text-discarded">
          This browser is not keeping the list, so it will be lost if the page reloads.
        </p>
      ) : null}
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
        guest={{
          onDraftChange: ({ id: _saved, ...draft }) => setUnkept(!writeGuestDraft({ ...guest, draft })),
          onSave: () => void navigate({ to: '/sign-in', search: { next: GUEST_PATH, join: true } }),
        }}
      />
    </main>
  )
}

/**
 * Saving a visitor's list to the account they have just signed in to.
 *
 * The list is sent under the id it was built with, so a claim that reloads halfway,
 * or runs in two tabs, updates the one row rather than making another. The draft is
 * kept until the save has landed, and only then forgotten.
 */
export function ClaimGuestRoster({ guest, onDiscard }: { guest: GuestDraft; onDiscard: () => void }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const started = useRef(false)
  const claim = useMutation({
    mutationFn: (draft: GuestDraft) => saveRoster({ data: claimInput(draft) }),
    onSuccess: async ({ id }) => {
      clearGuestDraft()
      await invalidateSavedRosters(queryClient)
      await navigate({ to: '/rosters/$id', params: { id }, replace: true })
    },
  })
  useEffect(() => {
    if (started.current) return
    started.current = true
    claim.mutate(guest)
  }, [claim, guest, navigate])

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
          <Button
            variant="outline"
            onClick={() => {
              clearGuestDraft()
              onDiscard()
            }}
          >
            Discard it
          </Button>
        </div>
      }
    />
  )
}

/** The builder's outline, for the frames before this page knows which of its halves it is. */
export function BuilderFrame() {
  return (
    <main className="flex h-full w-full min-w-0 max-w-full flex-col overflow-x-hidden" aria-busy>
      <RosterShell>
        <div className="h-24 border-b border-edge bg-panel" />
        <RosterBody threeColumn>
          <div className="hidden border-r border-edge min-[1300px]:block" />
          <div className="flex-1" />
          <div className="hidden border-l border-edge min-[1300px]:block" />
        </RosterBody>
        <div className="h-14 border-t border-edge bg-panel" />
      </RosterShell>
    </main>
  )
}
