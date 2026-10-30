import { advanceOnboarding } from '../onboarding/onboarding'
import { GuideHelp } from '../onboarding/GuideHelp'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { Copy, FileUp, LoaderCircle, TriangleAlert } from 'lucide-react'
import { posthog } from 'posthog-js'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/Dialog'
import { findImportableRosters, importRoster, saveRoster } from '../../functions'
import { invalidateSavedRosters, playerDefaultsQuery } from '../../queries'
import { isRosterExchangeCode } from '../../../core/rosterExchange'
import { isNewRecruitLink, newRecruitShareId } from '../../../core/newRecruit'
import { structuredRosterFile, type StructuredRosterFile } from '../../../core/structuredRosterFile'
import { importRosterFormat } from '../../../shared/rosterFiles'
import { battleSizeLabel } from '../../../core/battle'
import { importFailureReport } from '../feedback/feedback'
import { sendFeedback } from '../feedback/sendFeedback'
import { Problem } from '../../components/Problem'
import { Choice } from '../../components/Choice'
import { toast } from 'sonner'
import { countLabel } from '../../text'
import { type RosterApp, RosterAppImport } from './RosterAppImport'

type Imported = Awaited<ReturnType<typeof importRoster>>
type Matched<T> = T extends { catalogueId: string | null; source: string | null }
  ? T & { catalogueId: string; source: NonNullable<T['source']> }
  : never
/** A list whose faction was recognised, which is the only thing an import cannot do without. */
export type MatchedImport = Matched<Imported>
export const isMatchedImport = (imported: Imported): imported is MatchedImport => Boolean(imported.catalogueId && imported.source)

/** The roster setup an import carries; text exports leave out rule waivers and allied detachments. */
export function importedSetup(imported: MatchedImport, defaultLimit: number) {
  const stated = 'limit' in imported && imported.limit ? imported.limit : null
  return {
    name: imported.name,
    catalogueId: imported.catalogueId,
    detachmentIds: imported.detachmentIds,
    disposition: 'disposition' in imported ? (imported.disposition ?? null) : null,
    limit: stated ?? defaultLimit,
    pointsBudget: stated !== null && 'pointsBudget' in imported ? imported.pointsBudget : null,
    waivedRules: 'waivedRules' in imported ? imported.waivedRules : [],
    optionalRules: 'optionalRules' in imported ? imported.optionalRules : [],
    borrowedDetachmentId: 'borrowedDetachmentId' in imported ? imported.borrowedDetachmentId : null,
  }
}

const CODE_HASH = 'code='

/** Files the failure as an automatic feedback response carrying the exact input, so it can be reproduced. */
function reportImportFailure(report: Parameters<typeof importFailureReport>[0]) {
  const { message, ...response } = importFailureReport(report)
  sendFeedback(response, { message })
}

/** Counts a structured roster file without its contents, so demand for reading one is measured before it is built. */
function refuseRosterFile(format: StructuredRosterFile, input: 'text' | 'file') {
  posthog.capture('roster_import_failed', { reason: 'structured_file', input, format })
  return new Error(
    `That looks like a .${format} roster file, which Praetorium cannot read yet. In the app that made it, export the list as text, then paste the text here.`,
  )
}

/** Each name the import refused, on its own line, so the player reads why rather than only what. */
const explain = (unknown: readonly { name: string; reason: string }[]) =>
  unknown.map(({ name, reason }) => `Could not match ${name}: ${reason}.`).join('\n')

/** One reading of what the import could not do, so the two halves of it are read the same way. */
function Shortfall({ title, rows }: { title: string; rows: readonly { key: string; name: string; lines: string[] }[] }) {
  if (!rows.length) return null
  return (
    <div className="space-y-1.5">
      <p className="eyebrow text-discarded">{title}</p>
      <ul role="alert" className="min-w-0 space-y-1.5 border border-discarded/40 bg-discarded/5 p-2.5">
        {rows.map((row) => (
          <li key={row.key} className="flex items-start gap-2 text-sm text-discarded">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span className="min-w-0">
              <span className="font-semibold">{row.name}</span>
              {row.lines.map((line) => (
                <span key={line} className="block text-xs text-dim">
                  {line}
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * `onImport` keeps the list somewhere other than the account, such as a visitor's device; `blocked` replaces importing
 * for a visitor who already keeps their one list there, including an import a scanned code opened.
 */
export function RosterImport({ onImport, blocked }: { onImport?: (imported: MatchedImport) => void; blocked?: () => void }) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'text' | RosterApp>('text')
  /** A list found in another app and opened for review, which pasted text never fills. */
  const [picked, setPicked] = useState<MatchedImport | null>(null)
  const [text, setText] = useState('')
  const [droppedFile, setDroppedFile] = useState<Error | null>(null)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const saveImported = async (imported: MatchedImport) => {
    const defaults = await queryClient.query({ ...playerDefaultsQuery(), staleTime: 'static' })
    const { id } = await saveRoster({
      data: {
        ...importedSetup(imported, defaults.battleSize),
        picks: imported.units,
        prep: null,
        visibility: defaults.rosterVisibility,
        source: imported.source,
      },
    })
    return id
  }
  const keep = useMutation({
    onError: () => posthog.capture('roster_import_save_failed', { reason: 'request' }),
    mutationFn: saveImported,
    onSuccess: async (id, imported) => {
      posthog.capture('roster_import_saved', { source: imported.source, pick_count: imported.units.length })
      if (imported.unknown.length || imported.unplaced.length)
        posthog.capture('roster_import_shortfall_accepted', {
          missing_count: imported.unknown.length,
          unplaced_count: imported.unplaced.length,
        })
      await invalidateSavedRosters(queryClient)
      setOpen(false)
      setText('')
      await navigate({ to: '/rosters/$id', params: { id } })
    },
  })
  /** Lists that matched completely, saved one after another so a failure leaves the ones before it saved. */
  const keepAll = useMutation({
    onError: () => posthog.capture('roster_import_save_failed', { reason: 'request', bulk: true }),
    mutationFn: async (imported: readonly MatchedImport[]) => {
      for (const list of imported) await saveImported(list)
      return imported
    },
    onSuccess: async (imported) => {
      posthog.capture('roster_import_saved', { source: imported[0]?.source, bulk: true, rosters: imported.length })
      await invalidateSavedRosters(queryClient)
      setOpen(false)
      toast(`Imported ${countLabel(imported.length, 'roster')}.`)
    },
  })

  const inputOf = (file: string) => (isRosterExchangeCode(file) ? 'exchange-code' : 'text')
  const formatOf = (file: string) => (isRosterExchangeCode(file) ? 'praetorium' : importRosterFormat(file))
  const bring = useMutation({
    onMutate: (file) => posthog.capture('roster_import_submitted', { input: inputOf(file) }),
    mutationFn: async (file: string): Promise<MatchedImport> => {
      if (isNewRecruitLink(file)) {
        const found = newRecruitShareId(file)
          ? await findImportableRosters({ data: { source: 'newrecruit', links: [file] } }).catch(() => null)
          : null
        const shared = found?.found ? await found.rosters[0]?.catch(() => undefined) : undefined
        if (shared?.kind === 'read' && isMatchedImport(shared.imported)) return shared.imported
        posthog.capture('roster_import_failed', { reason: 'share_link', input: inputOf(file), format: 'newrecruit' })
        throw new Error(
          'That New Recruit link could not be opened. Copy the share link from the list in New Recruit, or export the list as text and paste the text here.',
        )
      }
      const structured = structuredRosterFile(file)
      if (structured) throw refuseRosterFile(structured, 'text')
      const imported = await importRoster({ data: { file } }).catch((error: unknown) => {
        posthog.capture('roster_import_failed', { reason: 'request', input: inputOf(file), format: formatOf(file) })
        reportImportFailure({ reason: 'request', inputKind: inputOf(file), unknown: [], unplaced: [], input: file })
        throw error
      })
      if (!isMatchedImport(imported)) {
        posthog.capture('roster_import_failed', {
          reason: 'catalogue_unmatched',
          input: inputOf(file),
          format: imported.format ?? 'unrecognized',
        })
        reportImportFailure({
          reason: 'catalogue_unmatched',
          inputKind: inputOf(file),
          unknown: imported.unknown,
          unplaced: imported.unplaced,
          input: file,
        })
        throw new Error(explain(imported.unknown) || `Could not match ${imported.catalogueName || 'the faction'}`)
      }
      return imported
    },
    onSuccess: (imported, file) => {
      advanceOnboarding('roster-tools', 'tools-input', 'tools-review')
      if (imported.unknown.length || imported.unplaced.length) {
        posthog.capture('roster_import_review_required', {
          missing_count: imported.unknown.length,
          unplaced_count: imported.unplaced.length,
        })
        reportImportFailure({
          reason: 'review_required',
          inputKind: inputOf(file),
          unknown: imported.unknown,
          unplaced: imported.unplaced,
          input: file,
        })
      }
    },
  })

  const review = picked ?? bring.data ?? null
  const fromCode = !picked && bring.variables !== undefined && isRosterExchangeCode(bring.variables)
  const working = bring.isPending || keep.isPending || keepAll.isPending
  const failure = droppedFile ?? bring.error ?? keep.error ?? keepAll.error

  // A scanned QR code opens this page with the code in the fragment, which never reaches the server.
  const hash = useLocation({ select: (location) => location.hash })
  const { mutate: submit, reset: resetSubmit } = bring
  const consumed = useRef<string | null>(null)
  useEffect(() => {
    if (!hash.startsWith(CODE_HASH) || consumed.current === hash) return
    consumed.current = hash
    const code = hash.slice(CODE_HASH.length)
    void navigate({ to: '.', hash: '', replace: true, resetScroll: false })
    posthog.capture('roster_import_started', { input: 'exchange-link' })
    resetSubmit()
    setText(code)
    setOpen(true)
    submit(code)
  }, [hash, navigate, resetSubmit, submit])

  const accept = (imported: MatchedImport) => {
    if (blocked) {
      setOpen(false)
      return blocked()
    }
    if (!onImport) return keep.mutate(imported)
    onImport(imported)
    posthog.capture('guest_roster_imported', {
      source: imported.source,
      pick_count: imported.units.length,
      missing_count: imported.unknown.length,
      unplaced_count: imported.unplaced.length,
    })
    setOpen(false)
  }

  const show = () => {
    if (blocked) return blocked()
    advanceOnboarding('roster-tools', 'tools-import', 'tools-input')
    posthog.capture('roster_import_started', { input: 'text' })
    bring.reset()
    keep.reset()
    keepAll.reset()
    setPicked(null)
    setDroppedFile(null)
    setOpen(true)
  }

  return (
    <>
      <Button data-onboarding="roster-import" variant="outline" onClick={show}>
        <FileUp /> Import roster
      </Button>
      <Dialog open={open} onOpenChange={(next) => !working && setOpen(next)}>
        <DialogContent
          size="md"
          actions={
            <GuideHelp icon task="roster-tools" step={review ? 'tools-review' : 'tools-input'}>
              Import guide
            </GuideHelp>
          }
        >
          <DialogHeader>
            <DialogTitle className="text-2xl">Import roster</DialogTitle>
            <DialogDescription>
              {review
                ? 'Review the matched list and any missing choices before continuing.'
                : mode !== 'text'
                  ? 'Find your lists and import them together. A list with anything to check opens for review first.'
                  : 'Paste a supported army-text export or an exchange code. You will review the entries and points before importing.'}
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            {review ? (
              <div data-onboarding="import-review" className="space-y-3">
                <p className="text-sm">
                  <span className="font-semibold">{review.name}</span> · {review.units.length} of {review.sourceUnitCount} matched{' '}
                  {review.units.length === 1 ? 'entry' : 'entries'}
                </p>
                <p className="text-xs text-dim">
                  Reported army: {review.reportedPoints === null ? 'points not stated' : `${review.reportedPoints} points`}. Matched entries
                  at selected rules: {review.currentPoints === null ? 'pricing unavailable' : `${review.currentPoints} points`}. Saving uses
                  the selected rules' prices.
                </p>
                {'limit' in review && review.limit ? (
                  <p className="text-xs text-dim">Battle size: {battleSizeLabel(review.limit, review.pointsBudget)}.</p>
                ) : null}
                {fromCode ? (
                  <p className="text-xs text-dim">
                    The exchange code carries units, model counts, equipment, attachments, Warlord, enhancements, setup and rules version.
                    Importing makes your own copy; the sender's preparation and reminders are not included.
                  </p>
                ) : null}
                {review.unknown.length || review.unplaced.length ? (
                  <p className="text-xs text-dim">
                    Missing units will be left out. Unmatched equipment uses the datasheet defaults; check it in the builder.
                  </p>
                ) : null}
                <Shortfall
                  title="Will not be imported"
                  rows={review.unknown.map((entry, at) => ({ key: `${at}:${entry.name}`, name: entry.name, lines: [entry.reason] }))}
                />
                <Shortfall
                  title="Will arrive as their datasheets build them"
                  rows={review.unplaced.map((entry) => ({
                    key: entry.unit,
                    name: entry.unit,
                    lines: entry.choices.map((choice) => `Could not apply ${choice.name}: ${choice.reason}`),
                  }))}
                />
                <Button className="w-full" disabled={working} onClick={() => accept(review)}>
                  {keep.isPending ? (
                    <LoaderCircle className="animate-spin" />
                  ) : !review.unknown.length && !review.unplaced.length ? (
                    <Copy />
                  ) : (
                    <TriangleAlert />
                  )}
                  {onImport ? 'Open imported draft' : review.unknown.length || review.unplaced.length ? 'Import anyway' : 'Import roster'}
                </Button>
                {onImport ? (
                  <p className="text-xs text-dim">
                    No account needed. This device keeps the draft; sign in when you want to save it to your account.
                  </p>
                ) : null}
                <Button
                  variant="outline"
                  disabled={working}
                  onClick={() => {
                    advanceOnboarding('roster-tools', 'tools-review', 'tools-input')
                    bring.reset()
                    keep.reset()
                    setPicked(null)
                  }}
                >
                  {picked ? 'Back to the lists' : fromCode ? 'Edit code' : 'Edit pasted text'}
                </Button>
              </div>
            ) : null}
            {/* Kept mounted under a review, so the lists found are still there to go back to. */}
            <div hidden={Boolean(review)} className="space-y-3">
              <Choice
                label="Import from"
                value={mode}
                disabled={working}
                options={[
                  { value: 'text', name: 'Pasted text', detail: 'An export or exchange code' },
                  { value: 'battlebase', name: 'BattleBase', detail: 'A player’s public rosters' },
                  { value: 'newrecruit', name: 'New Recruit', detail: 'Share links' },
                ]}
                onChange={(next) => {
                  bring.reset()
                  setMode(next)
                }}
              />
              {mode !== 'text' ? (
                <RosterAppImport
                  key={mode}
                  app={mode}
                  working={working}
                  onReview={setPicked}
                  onImport={onImport || blocked ? undefined : (lists) => keepAll.mutate(lists)}
                />
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="roster-text" className="eyebrow">
                    Roster text or exchange code
                  </Label>
                  <Textarea
                    data-onboarding="import-input"
                    id="roster-text"
                    value={text}
                    onChange={(event) => {
                      setDroppedFile(null)
                      setText(event.target.value)
                    }}
                    // Cancelling dragover for files makes the box a drop target, so a dropped roster file is refused rather than opened.
                    onDragOver={(event) => event.dataTransfer.types.includes('Files') && event.preventDefault()}
                    onDrop={(event) => {
                      const format = structuredRosterFile(event.dataTransfer.files[0]?.name ?? '')
                      if (!format) return
                      event.preventDefault()
                      bring.reset()
                      setDroppedFile(refuseRosterFile(format, 'file'))
                    }}
                    placeholder="Paste Games Workshop roster text or an exchange code…"
                    className="h-52 min-h-52 field-sizing-fixed resize-none overflow-y-auto font-mono text-xs"
                    disabled={working}
                    maxLength={200_000}
                  />
                  <Button
                    className="w-full"
                    disabled={!text.trim() || working}
                    onClick={() => {
                      setDroppedFile(null)
                      bring.mutate(text)
                    }}
                  >
                    {working ? <LoaderCircle className="animate-spin" /> : <Copy />}
                    Import pasted roster
                  </Button>
                </div>
              )}
            </div>

            {failure ? <Problem error={failure} className="whitespace-pre-line" /> : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" disabled={working} onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
