import { advanceOnboarding } from '../onboarding/onboarding'
import { GuideHelp } from '../onboarding/GuideHelp'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { Check, Copy, FileUp, LoaderCircle, TriangleAlert } from 'lucide-react'
import { posthog } from 'posthog-js'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/Dialog'
import { findImportableRosters, importRoster, saveRoster } from '../../functions'
import { invalidateSavedRosters, playerDefaultsQuery } from '../../queries'
import { decodeImportLinkText, isRosterExchangeCode } from '../../../core/rosterExchange'
import { isNewRecruitLink, newRecruitShareId } from '../../../core/newRecruit'
import { isWarscribeLink } from '../../../core/warscribe'
import { structuredRosterFile, type StructuredRosterFile } from '../../../core/structuredRosterFile'
import { importRosterFormat, UNSUPPORTED_ARMY_TEXT } from '../../../shared/rosterFiles'
import { battleSizeLabel, ROSTER_NAME_MAX_LENGTH } from '../../../core/battle'
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
const LIST_HASH = 'd='
/** The sites whose import links are credited by name; any other sender is unnamed, since a link can claim to be from anyone. */
const LINK_SITES = new Map([['listhammer', 'Listhammer']])

type Submission = { file: string; link?: { name: string | null; site: string | null } }

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
export const explain = (unknown: readonly { name: string; reason: string }[]) =>
  unknown.map(({ name, reason }) => `Could not match ${name}: ${reason}.`).join('\n')

/** One reading of what the import could not do, so the two halves of it are read the same way. */
function Shortfall({ title, rows }: { title: string; rows: readonly { key: string; name: string; lines: string[] }[] }) {
  if (!rows.length) return null
  return (
    <div className="space-y-1.5">
      <p className="eyebrow text-discarded">{title}</p>
      <ul role="alert" className="min-w-0 space-y-1.5 rounded-lg border border-discarded/40 bg-discarded/5 p-2.5">
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

function ReviewRow({ label, name, children }: { label: string; name: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="min-w-0 text-sm text-dim">{label}</dt>
      <dd data-import-figure={name} className="figure shrink-0 text-sm whitespace-nowrap text-bone">
        {children}
      </dd>
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
  const [refusal, setRefusal] = useState<Error | null>(null)
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
    onMutate: ({ file }: Submission) => {
      setText(file)
      posthog.capture('roster_import_submitted', { input: inputOf(file) })
    },
    mutationFn: async ({ file, link }: Submission): Promise<MatchedImport> => {
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
      if (isWarscribeLink(file)) {
        posthog.capture('roster_import_failed', { reason: 'share_link', input: inputOf(file), format: 'warscribe' })
        throw new Error("Warscribe links can't be read. In Warscribe, open Share, copy the list as text, and paste that here.")
      }
      const structured = structuredRosterFile(file)
      if (structured) throw refuseRosterFile(structured, 'text')
      const imported = await importRoster({ data: { file } }).catch((error: unknown) => {
        posthog.capture('roster_import_failed', { reason: 'request', input: inputOf(file), format: formatOf(file) })
        if (!link) reportImportFailure({ reason: 'request', inputKind: inputOf(file), unknown: [], unplaced: [], input: file })
        throw error
      })
      if (!isMatchedImport(imported)) {
        posthog.capture('roster_import_failed', {
          reason: 'catalogue_unmatched',
          input: inputOf(file),
          format: imported.format ?? 'unrecognized',
        })
        if (!link)
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
    onSuccess: (imported, { file, link }) => {
      advanceOnboarding('roster-tools', 'tools-input', 'tools-review')
      if (imported.unknown.length || imported.unplaced.length) {
        posthog.capture('roster_import_review_required', {
          missing_count: imported.unknown.length,
          unplaced_count: imported.unplaced.length,
        })
        // A published list can predate a data update, which says nothing about the importer.
        if (!link)
          reportImportFailure({
            reason: 'review_required',
            inputKind: inputOf(file),
            unknown: imported.unknown,
            unplaced: imported.unplaced,
            olderData: 'olderData' in imported ? imported.olderData : null,
            input: file,
          })
      }
    },
  })

  const link = picked ? undefined : bring.variables?.link
  const review = picked ?? (bring.data && link?.name ? { ...bring.data, name: link.name } : bring.data) ?? null
  const fromCode = !picked && bring.variables !== undefined && isRosterExchangeCode(bring.variables.file)
  const matchedAll = Boolean(review) && !review?.unknown.length && !review?.unplaced.length
  const working = bring.isPending || keep.isPending || keepAll.isPending
  const failure = refusal ?? bring.error ?? keep.error ?? keepAll.error

  // A scanned QR code or another site's import link opens this page with the list in the fragment.
  const hash = useLocation({ select: (location) => location.hash })
  const { mutate: submit, reset: resetSubmit } = bring
  const consumed = useRef<string | null>(null)
  useEffect(() => {
    const scanned = hash.startsWith(CODE_HASH)
    if ((!scanned && !hash.startsWith(LIST_HASH)) || consumed.current === hash) return
    consumed.current = hash
    void navigate({ to: '.', hash: '', replace: true, resetScroll: false })
    const params = new URLSearchParams(hash)
    const site = LINK_SITES.get(params.get('src') ?? '') ?? null
    posthog.capture('roster_import_started', scanned ? { input: 'exchange-link' } : { input: 'list-link', from: site ?? 'other' })
    resetSubmit()
    setOpen(true)
    if (scanned) {
      submit({ file: hash.slice(CODE_HASH.length) })
      return
    }
    void decodeImportLinkText(params.get('d') ?? '').then((file) => {
      if (!file?.trim()) {
        setRefusal(new Error("That link didn't contain a list Praetorium can read. Copy the list as text and paste it here."))
        return
      }
      setRefusal(null)
      submit({ file, link: { name: params.get('listname')?.trim().slice(0, ROSTER_NAME_MAX_LENGTH) || null, site } })
    })
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
    setRefusal(null)
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
          // The whole dialog, so the guide keeps clear of the actions in its footer.
          data-onboarding={review ? 'import-review' : undefined}
          actions={
            <GuideHelp task="roster-tools" step={review ? 'tools-review' : 'tools-input'}>
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
              <div className="space-y-3">
                <div className="min-w-0 space-y-1">
                  <h3 className="rubric wrap-anywhere text-balance text-bone">{review.name}</h3>
                  {review.catalogueName || link?.site ? (
                    <p className="text-sm text-dim">
                      {[review.catalogueName?.split(' - ').at(-1), link?.site ? `Sent from ${link.site}` : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  ) : null}
                </div>
                <p className={`flex items-center gap-1.5 text-sm ${matchedAll ? 'text-achieved' : 'text-discarded'}`}>
                  {matchedAll ? (
                    <Check className="size-3.5 shrink-0" aria-hidden />
                  ) : (
                    <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
                  )}
                  <span>
                    {review.units.length} of {review.sourceUnitCount} matched {review.units.length === 1 ? 'entry' : 'entries'}
                  </span>
                </p>
                <dl className="divide-y divide-edge border-y border-edge">
                  <ReviewRow label="Reported army" name="reported">
                    {review.reportedPoints === null ? 'points not stated' : `${review.reportedPoints} points`}
                  </ReviewRow>
                  <ReviewRow label="Matched entries at selected rules" name="current">
                    {review.currentPoints === null ? 'pricing unavailable' : `${review.currentPoints} points`}
                  </ReviewRow>
                  {'limit' in review && review.limit ? (
                    <ReviewRow label="Battle size" name="size">
                      {battleSizeLabel(review.limit, review.pointsBudget)}
                    </ReviewRow>
                  ) : null}
                </dl>
                <p className="text-xs text-dim">Saving uses the selected rules' prices.</p>
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
                {'olderData' in review && review.olderData && (review.unknown.length || review.unplaced.length) ? (
                  <p data-import-older-data className="text-xs text-dim">
                    This list was exported from the official app's data v{review.olderData.exported}, and Praetorium reads v
                    {review.olderData.current}. Units and wargear the app has renamed or removed since then won't match; export it again
                    from the app to bring it up to date.
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
                {onImport ? (
                  <p className="text-xs text-dim">
                    No account needed. This device keeps the draft; sign in when you want to save it to your account.
                  </p>
                ) : null}
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
                      setRefusal(null)
                      setText(event.target.value)
                    }}
                    // Cancelling dragover for files makes the box a drop target, so a dropped roster file is refused rather than opened.
                    onDragOver={(event) => event.dataTransfer.types.includes('Files') && event.preventDefault()}
                    onDrop={(event) => {
                      const format = structuredRosterFile(event.dataTransfer.files[0]?.name ?? '')
                      if (!format) return
                      event.preventDefault()
                      bring.reset()
                      setRefusal(refuseRosterFile(format, 'file'))
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
                      setRefusal(null)
                      bring.mutate({ file: text })
                    }}
                  >
                    {working ? <LoaderCircle className="animate-spin" /> : <Copy />}
                    Import pasted roster
                  </Button>
                </div>
              )}
            </div>

            {failure ? <Problem error={failure} className="whitespace-pre-line" /> : null}
            {String(failure).includes(UNSUPPORTED_ARMY_TEXT) ? (
              <p className="text-xs text-dim">
                Paste the whole export from your list builder.{' '}
                <Link
                  to="/docs/$docId"
                  params={{ docId: 'import-a-list' }}
                  className="text-info underline-offset-4 hover:underline"
                  onClick={() => setOpen(false)}
                >
                  See which exports work
                </Link>
              </p>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" disabled={working} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            {review ? (
              <>
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
                <Button disabled={working} onClick={() => accept(review)}>
                  {keep.isPending ? <LoaderCircle className="animate-spin" /> : matchedAll ? <Copy /> : <TriangleAlert />}
                  {onImport ? 'Open imported draft' : matchedAll ? 'Import roster' : 'Import anyway'}
                </Button>
              </>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
