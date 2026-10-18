import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ChevronRight, Plus } from 'lucide-react'
import { posthog } from 'posthog-js'
import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/Dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { DEFAULT_PLAYER_DEFAULTS } from '../../../core/playerDefaults'
import { pointsBudgetOf } from '../../../core/battle'
import { datasheetOfferedByQuery, factionIndexQuery, meQuery, playerDefaultsQuery, savedRosterSummariesQuery } from '../../queries'
import { EMPTY_SETUP, type GuestDraft, readGuestDraft } from './guestDraft'
import { type RosterReference, useNewRoster } from './newRoster'
import { useAccountPrompt } from './AccountPrompt'
import { RosterSetupDialog, type RosterSetupFaction } from './RosterSetupDialog'
import { rosterTitle } from './RosterSummary'
import { sortRosters } from '../../../core/rosterSort'
import { rulesVersionLabel } from '../../../core/catalogueEdition'
import { Problem } from '../../components/Problem'

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
      saveError={create.saveError}
      onSave={(setup) => create.start(setup, add)}
    />
  )
}

/** A detachment page's way into the builder: a new roster with this detachment already chosen. */
export function StartRoster({ faction, detachmentId }: { faction: RosterSetupFaction; detachmentId: string }) {
  const [open, setOpen] = useState(false)
  const { data: me } = useQuery(meQuery())
  const account = useAccountPrompt()
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          if (!me && readGuestDraft()) return account.ask('another-roster')
          posthog.capture('roster_creation_started', { reference: 'detachment' })
          setOpen(true)
        }}
      >
        <Plus /> Start a roster
      </Button>
      <StartRosterDialog open={open} onOpenChange={setOpen} faction={faction} detachmentIds={[detachmentId]} reference="detachment" />
      {account.prompt}
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
export function AddToRoster({
  faction,
  entryId,
  name,
  renderTrigger,
}: {
  faction: RosterSetupFaction
  entryId: string
  name: string
  /** Draws whatever opens the flow; the dialogs stay here so the trigger may live in a menu that closes. */
  renderTrigger: (open: () => void) => ReactNode
}) {
  const [step, setStep] = useState<'closed' | 'choose' | 'create'>('closed')
  const [guestDraft, setGuestDraft] = useState<GuestDraft | null>(null)
  const { data: me } = useQuery(meQuery())
  const choosing = step === 'choose'
  const saved = useQuery({ ...savedRosterSummariesQuery(), enabled: choosing && Boolean(me) })
  const { data: factionIndex } = useQuery({ ...factionIndexQuery(), enabled: choosing })
  const candidates = me ? (saved.data ?? []).filter((roster) => !roster.locked) : []
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
  const rulesVersion = (catalogueId: string) => {
    const book = factionName(catalogueId)
    return book ? rulesVersionLabel(book) : 'Loading rules version…'
  }

  const open = () => {
    posthog.capture('roster_add_started', { reference: 'datasheet' })
    const draft = me ? null : readGuestDraft()
    setGuestDraft(draft)
    // A visitor with nothing built yet has only one place to go.
    setStep(!me && !draft && canStart ? 'create' : 'choose')
  }
  const account = useAccountPrompt()
  const startNew = () => {
    if (!me && guestDraft) {
      setStep('closed')
      return account.ask('another-roster')
    }
    posthog.capture('roster_creation_started', { reference: 'datasheet' })
    setStep('create')
  }

  return (
    <>
      {renderTrigger(open)}
      <Dialog open={choosing} onOpenChange={(next) => !next && setStep('closed')}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add {name} to a roster</DialogTitle>
            <DialogDescription>
              {canStart
                ? `Choose a roster that can take it, or start a new ${faction.displayName} roster.`
                : 'Choose a roster that can take it.'}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="gap-1" aria-busy={loading}>
            {failed ? (
              <Problem className="text-xs">
                Your rosters could not be loaded.{' '}
                <Button
                  variant="link"
                  size="xs"
                  className="h-auto p-0"
                  onClick={() => void Promise.all([saved.refetch(), offered.refetch()])}
                >
                  Try again
                </Button>
              </Problem>
            ) : loading ? (
              <>
                <Skeleton className="h-11 w-full" />
                <Skeleton className="h-11 w-full" />
              </>
            ) : (
              <>
                {draftTakesIt && guestDraft ? (
                  <RosterChoice
                    id={guestDraft.id}
                    entryId={entryId}
                    title={guestDraft.draft.name || 'Your unsaved roster'}
                    detail={`${factionName(guestDraft.draft.catalogueId)?.displayName ?? ''} · ${rulesVersion(guestDraft.draft.catalogueId)} · ${pointsBudgetOf(guestDraft.draft)} pts · not saved yet`}
                  />
                ) : null}
                {rosters.map((roster) => {
                  const book = factionName(roster.catalogueId)
                  return (
                    <RosterChoice
                      key={roster.id}
                      id={roster.id}
                      entryId={entryId}
                      title={rosterTitle(roster, book)}
                      detail={`${book?.displayName ?? ''} · ${rulesVersion(roster.catalogueId)} · ${pointsBudgetOf(roster)} pts`}
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
          </DialogBody>
          {canStart ? (
            <DialogFooter>
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
      {account.prompt}
    </>
  )
}

function RosterChoice({ id, entryId, title, detail }: { id: string; entryId: string; title: string; detail: string }) {
  return (
    <Link
      to="/rosters/$id"
      params={{ id }}
      search={{ add: entryId }}
      className="flex items-center gap-3 border border-edge bg-panel px-3 py-2 text-left hover:border-primary/60 hover:bg-raised"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{title}</span>
        <span className="block text-xs text-dim">{detail}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-faint" aria-hidden />
    </Link>
  )
}
