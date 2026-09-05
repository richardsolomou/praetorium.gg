import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Copy, FileUp, LoaderCircle, TriangleAlert } from 'lucide-react'
import posthog from 'posthog-js'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { DEFAULT_GAME_LIMIT } from '../../core/battle'
import { importRoster, saveRoster } from '../../server/functions'
import { errorMessage } from '../queryClient'
import { invalidateSavedRosters } from '../queries'

type Imported = Awaited<ReturnType<typeof importRoster>>
/** A list whose faction was recognised, which is the only thing an import cannot do without. */
type Matched = Imported & { catalogueId: string; source: NonNullable<Imported['source']> }

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

export function RosterImport() {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const keep = useMutation({
    mutationFn: async (imported: Matched) => {
      const { id } = await saveRoster({
        data: {
          name: imported.name,
          catalogueId: imported.catalogueId,
          detachmentIds: imported.detachmentIds,
          disposition: 'disposition' in imported ? (imported.disposition ?? null) : null,
          limit: 'limit' in imported && imported.limit ? imported.limit : DEFAULT_GAME_LIMIT,
          picks: imported.units,
          prep: null,
          visibility: 'private',
          source: imported.source,
        },
      })
      return id
    },
    onSuccess: async (id) => {
      await invalidateSavedRosters(queryClient)
      setOpen(false)
      setText('')
      await navigate({ to: '/rosters/$id', params: { id } })
    },
  })

  const bring = useMutation({
    mutationFn: async (file: string): Promise<Matched> => {
      const imported = await importRoster({ data: { file } })
      if (!imported.catalogueId || !imported.source) {
        posthog.capture('roster_import_failed', { reason: 'catalogue_unmatched', input: 'text' })
        throw new Error(explain(imported.unknown) || `Could not match ${imported.catalogueName || 'the faction'}`)
      }
      return { ...imported, catalogueId: imported.catalogueId, source: imported.source }
    },
    // What the datasheets cannot be given is the player's to settle: the list is held back
    // until they have read what could not be placed and said to import it anyway. A unit
    // that matched nothing is named here too rather than refusing the whole list, since
    // the rest of it is still the list they asked for.
    onSuccess: (imported) => {
      if (!imported.unknown.length && !imported.unplaced.length) keep.mutate(imported)
    },
  })

  const review = bring.data && (bring.data.unknown.length || bring.data.unplaced.length) ? bring.data : null
  const working = bring.isPending || keep.isPending
  const failure = bring.error ?? keep.error

  const show = () => {
    bring.reset()
    keep.reset()
    setOpen(true)
  }

  return (
    <>
      <Button variant="outline" onClick={show}>
        <FileUp /> Import roster
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-none border border-edge bg-panel text-bone ring-0 sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl uppercase">Import roster</DialogTitle>
            <DialogDescription className="text-dim">
              {review
                ? 'Not everything this list states could be placed. Import it anyway and it arrives as named below.'
                : 'Paste Games Workshop roster text from Praetorium, BattleBase, or New Recruit.'}
            </DialogDescription>
          </DialogHeader>

          {review ? (
            <div className="space-y-3">
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
              <Button className="w-full" disabled={working} onClick={() => keep.mutate(review)}>
                {keep.isPending ? <LoaderCircle className="animate-spin" /> : <TriangleAlert />}
                Import anyway
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
                className="h-52 min-h-52 field-sizing-fixed resize-none overflow-y-auto rounded-none border-edge bg-sunken font-mono text-xs"
                disabled={working}
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
          <DialogFooter className="rounded-none border-edge bg-sunken">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
