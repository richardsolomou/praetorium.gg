import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { ScrollText } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button, buttonVariants } from '@/components/ui/button'
import { saveRoster } from '../../../server/functions'
import { PageState } from '../../components/PageState'
import { factionIndexQuery, factionQuery, invalidateSavedRosters, meQuery } from '../../queries'
import { errorMessage } from '../../queryClient'
import {
  claimInput,
  clearGuestDraft,
  EMPTY_SETUP,
  GUEST_PATH,
  type GuestDraft,
  newGuestDraft,
  readGuestDraft,
  writeGuestDraft,
} from './guestDraft'
import { ListBuilder } from './ListBuilder'
import { RosterBody, RosterShell } from './RosterPresentation'
import { RosterSetupDialog } from './RosterSetupDialog'

const NO_PREP = { stratagems: [], secondaries: [], reminders: [], remindersEnabled: true }

/**
 * A list built before its builder has an account, and the moment it gets one.
 *
 * The draft lives in this tab's session storage, which the server cannot read, so
 * the first frame is the builder's shape either way and the page decides after it
 * mounts: a visitor builds, and a player who has just signed in has the list they
 * built saved to their account.
 */
export function NewRosterPage() {
  const { data: me } = useQuery(meQuery())
  const [stored, setStored] = useState<GuestDraft | null | undefined>(undefined)
  useEffect(() => setStored(readGuestDraft()), [])
  if (stored === undefined) return <BuilderFrame />
  if (me) return <ClaimGuestRoster guest={stored} />
  return <GuestRoster guest={stored} onStart={setStored} />
}

function GuestRoster({ guest, onStart }: { guest: GuestDraft | null; onStart: (guest: GuestDraft) => void }) {
  const navigate = useNavigate()
  const [choosing, setChoosing] = useState(!guest)
  const [unkept, setUnkept] = useState(false)
  const { data: factionIndex } = useQuery(factionIndexQuery())
  const { data: faction } = useQuery({ ...factionQuery(guest?.draft.catalogueId ?? ''), enabled: Boolean(guest) })

  if (!guest) {
    return (
      <>
        {choosing ? null : (
          <PageState
            headingLevel={1}
            eyebrow="Roster builder"
            title="Try the builder"
            explanation="Build a list with points and legality checked as you go. Sign up when you want to keep it."
            icon={ScrollText}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={() => setChoosing(true)}>Start a roster</Button>
                <Link to="/sign-in" search={{ next: undefined }} className={buttonVariants({ variant: 'outline' })}>
                  Sign in
                </Link>
              </div>
            }
          />
        )}
        <RosterSetupDialog
          mode="create"
          guest
          open={choosing}
          onOpenChange={setChoosing}
          factionOptions={factionIndex?.factions ?? []}
          value={EMPTY_SETUP}
          hasUnits={false}
          onSave={(setup) => {
            const started = newGuestDraft(setup)
            setUnkept(!writeGuestDraft(started))
            setChoosing(false)
            onStart(started)
          }}
        />
      </>
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
function ClaimGuestRoster({ guest }: { guest: GuestDraft | null }) {
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
    if (!guest) {
      void navigate({ to: '/rosters', replace: true })
      return
    }
    if (started.current) return
    started.current = true
    claim.mutate(guest)
  }, [claim, guest, navigate])

  if (!guest || !claim.isError) return <BuilderFrame />
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
              void navigate({ to: '/rosters', replace: true })
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
function BuilderFrame() {
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
