import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Copy, FileUp, LoaderCircle, TriangleAlert } from 'lucide-react'
import { posthog } from 'posthog-js'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { importRoster, saveRoster } from '../../functions'
import { errorMessage } from '../../queryClient'
import { invalidateSavedRosters, playerDefaultsQuery } from '../../queries'

type Imported = Awaited<ReturnType<typeof importRoster>>
/** A list whose faction was recognised, which is the only thing an import cannot do without. */
export type MatchedImport = Imported & { catalogueId: string; source: NonNullable<Imported['source']> }

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

export function RosterImport({ onImport }: { onImport?: (imported: MatchedImport) => void }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const keep = useMutation({
    onError: () => posthog.capture('roster_import_save_failed', { reason: 'request' }),
    mutationFn: async (imported: MatchedImport) => {
      const defaults = await queryClient.query({ ...playerDefaultsQuery(), staleTime: 'static' })
      const { id } = await saveRoster({
        data: {
          name: imported.name,
          catalogueId: imported.catalogueId,
          detachmentIds: imported.detachmentIds,
          disposition: 'disposition' in imported ? (imported.disposition ?? null) : null,
          limit: 'limit' in imported && imported.limit ? imported.limit : defaults.battleSize,
          picks: imported.units,
          prep: null,
          visibility: defaults.rosterVisibility,
          source: imported.source,
        },
      })
      return id
    },
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

  const bring = useMutation({
    onMutate: () => posthog.capture('roster_import_submitted', { input: 'text' }),
    mutationFn: async (file: string): Promise<MatchedImport> => {
      const imported = await importRoster({ data: { file } }).catch((error: unknown) => {
        posthog.capture('roster_import_failed', { reason: 'request', input: 'text' })
        throw error
      })
      if (!imported.catalogueId || !imported.source) {
        posthog.capture('roster_import_failed', { reason: 'catalogue_unmatched', input: 'text' })
        throw new Error(explain(imported.unknown) || `Could not match ${imported.catalogueName || 'the faction'}`)
      }
      return { ...imported, catalogueId: imported.catalogueId, source: imported.source }
    },
    onSuccess: (imported) => {
      if (!onImport && !imported.unknown.length && !imported.unplaced.length) keep.mutate(imported)
      else
        posthog.capture('roster_import_review_required', {
          missing_count: imported.unknown.length,
          unplaced_count: imported.unplaced.length,
        })
    },
  })

  const review = bring.data && (onImport || bring.data.unknown.length || bring.data.unplaced.length) ? bring.data : null
  const working = bring.isPending || keep.isPending
  const failure = bring.error ?? keep.error

  const accept = (imported: MatchedImport) => {
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
    posthog.capture('roster_import_started', { input: 'text' })
    bring.reset()
    keep.reset()
    setOpen(true)
  }

  return (
    <>
      <Button data-onboarding="roster-import" variant="outline" onClick={show}>
        <FileUp /> Import roster
      </Button>
      <Dialog open={open} onOpenChange={(next) => !working && setOpen(next)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl">Import roster</DialogTitle>
            <DialogDescription>
              {review
                ? 'Review the matched list and any missing choices before continuing.'
                : 'Paste Games Workshop roster text from Praetorium, BattleBase, or New Recruit.'}
            </DialogDescription>
          </DialogHeader>

          {review ? (
            <div className="space-y-3">
              <p className="text-sm">
                <span className="font-semibold">{review.name}</span> · {review.units.length} matched{' '}
                {review.units.length === 1 ? 'entry' : 'entries'}
              </p>
              {review.unknown.length || review.unplaced.length ? (
                <p className="text-xs text-dim">
                  Missing units will be left out. Unmatched equipment uses the datasheet defaults; check it in the builder.
                </p>
              ) : null}
              <Shortfall
                title="Will not be imported"
                rows={review.unknown.map((entry) => ({ key: entry.name, name: entry.name, lines: [entry.reason] }))}
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
                ) : onImport && !review.unknown.length && !review.unplaced.length ? (
                  <Copy />
                ) : (
                  <TriangleAlert />
                )}
                {onImport ? 'Open imported draft' : 'Import anyway'}
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
                  bring.reset()
                  keep.reset()
                }}
              >
                Edit pasted text
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="roster-text" className="eyebrow">
                Roster text
              </Label>
              <Textarea
                id="roster-text"
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Paste Games Workshop roster text…"
                className="h-52 min-h-52 field-sizing-fixed resize-none overflow-y-auto font-mono text-xs"
                disabled={working}
                maxLength={200_000}
              />
              <Button className="w-full" disabled={!text.trim() || working} onClick={() => bring.mutate(text)}>
                {working ? <LoaderCircle className="animate-spin" /> : <Copy />}
                Import pasted roster
              </Button>
            </div>
          )}

          {failure ? (
            <p role="alert" className="whitespace-pre-line text-sm text-destructive">
              {errorMessage(failure)}
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="ghost" disabled={working} onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
