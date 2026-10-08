import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ChevronRight, Plus } from 'lucide-react'
import { posthog } from 'posthog-js'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { DEFAULT_PLAYER_DEFAULTS } from '../../../core/playerDefaults'
import { datasheetOfferedByQuery, factionIndexQuery, meQuery, playerDefaultsQuery, savedRosterSummariesQuery } from '../../queries'
import { EMPTY_SETUP, type GuestDraft, readGuestDraft } from './guestDraft'
import { type RosterReference, useNewRoster } from './newRoster'
import { RosterSetupDialog, type RosterSetupFaction } from './RosterSetupDialog'
import { rosterTitle } from './RosterSummary'
import { sortRosters } from './rosterSort'

const NO_DETACHMENTS: string[] = []

/** The roster setup with a reference page's faction, and maybe its detachment, already chosen. */
function StartRosterDialog({
  open,
  onOpenChange,
  faction,
  detachmentIds = NO_DETACHMENTS,
  add,
  reference,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  faction: RosterSetupFaction
  detachmentIds?: string[]
  add?: string
  reference: RosterReference
}) {
  const create = useNewRoster(reference)
  const { data: factionIndex } = useQuery({ ...factionIndexQuery(), enabled: open })
  const { data: defaults = DEFAULT_PLAYER_DEFAULTS } = useQuery({ ...playerDefaultsQuery(), enabled: open && !create.guest })
  const value = {
    ...EMPTY_SETUP,
    catalogueId: faction.id,
    detachmentIds,
    ...(create.guest ? {} : { visibility: defaults.rosterVisibility, limit: defaults.battleSize }),
  }
  return (
    <RosterSetupDialog
      // The dialog reads its value once, so defaults that arrive later start it again.
      key={`${value.visibility}-${value.limit}`}
      mode="create"
      guest={create.guest}
      open={open}
      onOpenChange={onOpenChange}
      factionOptions={factionIndex?.factions ?? [faction]}
      initialFaction={faction}
      value={value}
      hasUnits={false}
      pending={create.pending}
      onSave={(setup) => create.start(setup, add)}
    />
  )
}

/** A detachment page's way into the builder: a new roster with this detachment already chosen. */
export function StartRoster({ faction, detachmentId }: { faction: RosterSetupFaction; detachmentId: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          posthog.capture('roster_creation_started', { reference: 'detachment' })
          setOpen(true)
        }}
      >
        <Plus /> Start a roster
      </Button>
      <StartRosterDialog open={open} onOpenChange={setOpen} faction={faction} detachmentIds={[detachmentId]} reference="detachment" />
    </>
  )
}

/**
 * A datasheet page's way into the builder: a roster that can take the unit, or a new one.
 *
 * Which rosters can take it is the picker's answer for each roster's book, so a
 * Space Marines datasheet offers a Blood Angels list too. The builder then adds the
 * unit under that roster's own limits, and says so when it cannot.
 */
export function AddToRoster({ faction, entryId, name }: { faction: RosterSetupFaction; entryId: string; name: string }) {
  const [step, setStep] = useState<'closed' | 'choose' | 'create'>('closed')
  const [guestDraft, setGuestDraft] = useState<GuestDraft | null>(null)
  const { data: me } = useQuery(meQuery())
  const choosing = step === 'choose'
  const saved = useQuery({ ...savedRosterSummariesQuery(), enabled: choosing && Boolean(me) })
  const { data: factionIndex } = useQuery({ ...factionIndexQuery(), enabled: choosing })
  const candidates = me ? (saved.data ?? []) : []
  const books = [
    ...new Set([...candidates.map((roster) => roster.catalogueId), ...(guestDraft ? [guestDraft.draft.catalogueId] : [])]),
  ].toSorted()
  const offered = useQuery({ ...datasheetOfferedByQuery(entryId, books), enabled: choosing })
  const offeredBooks = new Set(offered.data ?? [])
  const rosters = sortRosters(
    candidates.filter((roster) => offeredBooks.has(roster.catalogueId)),
    'updated-desc',
  )
  const draftTakesIt = Boolean(guestDraft && offeredBooks.has(guestDraft.draft.catalogueId))
  const loading = (Boolean(me) && saved.isPending) || (books.length > 0 && offered.isPending)
  const failed = saved.isError || offered.isError
  const canStart = faction.detachments.length > 0
  const factionName = (catalogueId: string) => factionIndex?.factions.find((entry) => entry.id === catalogueId)

  const open = () => {
    posthog.capture('roster_add_started', { reference: 'datasheet' })
    const draft = me ? null : readGuestDraft()
    setGuestDraft(draft)
    // A visitor with nothing built yet has only one place to go.
    setStep(!me && !draft && canStart ? 'create' : 'choose')
  }
  const startNew = () => {
    posthog.capture('roster_creation_started', { reference: 'datasheet' })
    setStep('create')
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={open}>
        <Plus /> Add to roster
      </Button>
      <Dialog open={choosing} onOpenChange={(next) => !next && setStep('closed')}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="pr-8">Add {name} to a roster</DialogTitle>
            <DialogDescription>
              {canStart
                ? `Choose a roster that can take it, or start a new ${faction.displayName} roster.`
                : 'Choose a roster that can take it.'}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-72 space-y-1 overflow-y-auto" aria-busy={loading}>
            {failed ? (
              <p role="alert" className="text-xs text-destructive">
                Your rosters could not be loaded.{' '}
                <Button
                  variant="link"
                  size="xs"
                  className="h-auto p-0"
                  onClick={() => void Promise.all([saved.refetch(), offered.refetch()])}
                >
                  Try again
                </Button>
              </p>
            ) : loading ? (
              <>
                <Skeleton className="h-11 w-full" />
                <Skeleton className="h-11 w-full" />
              </>
            ) : (
              <>
                {draftTakesIt && guestDraft ? (
                  <RosterChoice
                    to="/rosters"
                    entryId={entryId}
                    title={guestDraft.draft.name || 'Your unsaved roster'}
                    detail={`${factionName(guestDraft.draft.catalogueId)?.displayName ?? ''} · ${guestDraft.draft.limit} pts · not saved yet`}
                  />
                ) : null}
                {rosters.map((roster) => {
                  const book = factionName(roster.catalogueId)
                  return (
                    <RosterChoice
                      key={roster.id}
                      to="/rosters/$id"
                      id={roster.id}
                      entryId={entryId}
                      title={rosterTitle(roster, book)}
                      detail={`${book?.displayName ?? ''} · ${roster.limit} pts`}
                    />
                  )
                })}
                {!rosters.length && !draftTakesIt ? (
                  <p className="text-sm text-dim">
                    {me ? 'None of your rosters can take this unit yet.' : 'Your unsaved roster cannot take this unit.'}
                  </p>
                ) : null}
              </>
            )}
          </div>
          {canStart ? (
            <DialogFooter>
              {!me && guestDraft ? <p className="mr-auto self-center text-xs text-faint">A new roster replaces your unsaved one.</p> : null}
              <Button onClick={startNew}>
                <Plus /> New {faction.displayName} roster
              </Button>
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>
      <StartRosterDialog
        open={step === 'create'}
        onOpenChange={(next) => !next && setStep('closed')}
        faction={faction}
        add={entryId}
        reference="datasheet"
      />
    </>
  )
}

function RosterChoice({
  to,
  id,
  entryId,
  title,
  detail,
}: { entryId: string; title: string; detail: string } & ({ to: '/rosters'; id?: never } | { to: '/rosters/$id'; id: string })) {
  const className = 'flex items-center gap-3 border border-edge bg-panel px-3 py-2 text-left hover:border-primary/60 hover:bg-raised'
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{title}</span>
        <span className="block truncate text-xs text-dim">{detail}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-faint" aria-hidden />
    </>
  )
  return to === '/rosters' ? (
    <Link to="/rosters" search={{ add: entryId }} className={className}>
      {body}
    </Link>
  ) : (
    <Link to="/rosters/$id" params={{ id }} search={{ add: entryId }} className={className}>
      {body}
    </Link>
  )
}
