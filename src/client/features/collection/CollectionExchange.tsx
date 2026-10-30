import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Download, FileUp } from 'lucide-react'
import { posthog } from 'posthog-js'
import { useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { byId } from '../../../core/collections'
import { countsAsList, type CollectionEntry, type CollectionImportRow } from '../../../core/collection'
import {
  collectionCsv,
  importChange,
  MAX_COLLECTION_CSV_BYTES,
  readCollectionCsv,
  type CollectionCsvRow,
  type ImportedRow,
} from '../../../core/collectionCsv'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/Dialog'
import { importCollection } from '../../functions'
import {
  collectionCountsAsKey,
  collectionCountsKey,
  collectionKey,
  collectionProfileKey,
  collectionProgressKey,
  collectionWishesKey,
} from '../../queries/queryKeys'
import { Problem } from '../../components/Problem'
import { useExportText } from '../../useCopyText'
import { countLabel } from '../../text'

type Sheet = { id: string; name: string; faction: string }

/** A collection file's export and its reviewed import; importing adds what is missing and changes saved counts only when asked. */
export function CollectionExchange({ sheets, current }: { sheets: readonly Sheet[]; current: ReadonlyMap<string, CollectionEntry> }) {
  const [reading, setReading] = useState<{ rows: ImportedRow[] } | { error: string } | null>(null)
  const { exportText, native, copied, problem } = useExportText()
  const named = byId(sheets)
  const csv = () =>
    collectionCsv(
      [...current].map(([entryId, counts]): CollectionCsvRow => {
        const sheet = named.get(entryId)
        return { entryId, name: sheet?.name ?? entryId, faction: sheet?.faction ?? '', ...counts }
      }),
    )
  const exportFile = async () => {
    posthog.capture('collection_exported', { datasheets: current.size })
    await exportText(csv(), { name: 'praetorium-collection.csv', type: 'text/csv;charset=utf-8', operation: 'collection_export_copy' })
  }
  const input = useRef<HTMLInputElement>(null)
  return (
    <>
      <Button variant="outline" size="sm" disabled={!current.size} onClick={() => void exportFile()}>
        <Download /> {native ? (copied ? 'Copied CSV' : 'Copy CSV') : 'Export CSV'}
      </Button>
      <Button variant="outline" size="sm" onClick={() => input.current?.click()}>
        <FileUp /> Import CSV
      </Button>
      {problem ? <Problem className="basis-full">{problem}</Problem> : null}
      <input
        ref={input}
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={async (event) => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          if (!file) return
          setReading(
            file.size > MAX_COLLECTION_CSV_BYTES
              ? { error: 'This file is larger than a collection can be.' }
              : readCollectionCsv(await file.text(), sheets),
          )
        }}
      />
      <ImportReview reading={reading} current={current} onClose={() => setReading(null)} />
    </>
  )
}

const STATUS_LABEL = { new: 'New', same: 'Unchanged', conflict: 'Differs' } as const

function ImportReview({
  reading,
  current,
  onClose,
}: {
  reading: { rows: ImportedRow[] } | { error: string } | null
  current: ReadonlyMap<string, CollectionEntry>
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [choices, setChoices] = useState<Record<number, string>>({})
  const [replace, setReplace] = useState(false)
  const replaceId = useId()
  const save = useMutation({
    mutationFn: (rows: CollectionImportRow[]) => importCollection({ data: { rows, replace } }),
    onSuccess: () => {
      for (const queryKey of [
        collectionKey(),
        collectionCountsKey(),
        collectionProgressKey(),
        collectionCountsAsKey(),
        collectionWishesKey(),
        collectionProfileKey(),
      ])
        void queryClient.invalidateQueries({ queryKey })
    },
  })
  const close = () => {
    setChoices({})
    setReplace(false)
    save.reset()
    onClose()
  }
  const rows = reading && 'rows' in reading ? reading.rows : []
  const resolved = rows.flatMap((row): (CollectionImportRow & { line: number; name: string })[] => {
    if (row.status === 'recognised') return [{ ...row }]
    if (row.status !== 'ambiguous' || !choices[row.line]) return []
    return [
      {
        line: row.line,
        name: row.name,
        entryId: choices[row.line]!,
        models: row.models,
        built: row.built,
        painted: row.painted,
        wanted: row.wanted,
        ...(row.countsAs ? { countsAs: countsAsList(choices[row.line]!, row.countsAs) } : {}),
      },
    ]
  })
  // A row resolved to a datasheet an earlier row already names is left out, as the file's own duplicates are.
  const unique = resolved.filter((row, index) => resolved.findIndex((other) => other.entryId === row.entryId) === index)
  const changes = unique.map((row) => ({ row, change: importChange(row, current.get(row.entryId)) }))
  const conflicts = changes.filter(({ change }) => change === 'conflict').length
  // Rows that differ go too: without `replace` the server keeps their saved counts and still adds what they lack.
  const applying = changes.filter(({ change }) => change !== 'same')
  const skipped = rows.filter((row) => row.status === 'unmatched' || row.status === 'duplicate' || row.status === 'invalid')
  const ambiguous = rows.filter((row) => row.status === 'ambiguous')
  const changeOf = new Map(changes.map(({ row, change }) => [row.line, change]))
  return (
    <Dialog open={reading !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Import collection</DialogTitle>
          <DialogDescription>
            Nothing is saved until you import. Rows add datasheets and wishes you lack; a zero leaves a saved count as it is, and nothing is
            removed.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {reading && 'error' in reading ? (
            <Problem>{reading.error}</Problem>
          ) : (
            <>
              <p className="text-sm text-dim" data-import-summary>
                {rows.length - ambiguous.length - skipped.length} recognised · {ambiguous.length} to choose · {skipped.length} skipped
              </p>
              <ul className="divide-y divide-edge border border-edge">
                {rows.map((row) => (
                  <li key={row.line} data-import-row={row.name} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                    <span className="readout w-10 shrink-0 text-xs text-faint">#{row.line}</span>
                    <span className="min-w-0 flex-1 font-semibold break-words text-bone uppercase">{row.name}</span>
                    {row.status === 'recognised' || row.status === 'ambiguous' ? (
                      <span className="readout text-xs text-dim">
                        {row.models} owned · {row.built} built · {row.painted} painted · {row.wanted} wanted
                        {row.countsAs?.length ? ` · counts as ${countLabel(row.countsAs.length, 'other datasheet')}` : ''}
                      </span>
                    ) : null}
                    {row.status === 'ambiguous' ? (
                      <select
                        aria-label={`Which ${row.name} row ${row.line} means`}
                        className="h-8 w-full border border-edge-strong bg-sunken px-2 text-sm sm:w-auto"
                        value={choices[row.line] ?? ''}
                        onChange={(event) => setChoices((previous) => ({ ...previous, [row.line]: event.target.value }))}
                      >
                        <option value="">Skip this row</option>
                        {row.candidates.map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            {candidate.name} ({candidate.faction})
                          </option>
                        ))}
                      </select>
                    ) : row.status === 'recognised' ? (
                      <Badge tone={changeOf.get(row.line) === 'conflict' ? 'warn' : 'plain'}>
                        {STATUS_LABEL[changeOf.get(row.line) ?? 'same']}
                      </Badge>
                    ) : (
                      <span className="w-full text-xs text-destructive">{row.reason}</span>
                    )}
                  </li>
                ))}
              </ul>
              {conflicts ? (
                <label htmlFor={replaceId} className="flex items-start gap-3 border border-edge bg-sunken p-3 text-sm">
                  <input
                    id={replaceId}
                    type="checkbox"
                    className="mt-0.5 size-5 shrink-0 accent-parchment"
                    checked={replace}
                    onChange={(event) => setReplace(event.target.checked)}
                  />
                  <span>
                    Replace my saved counts for {conflicts} {conflicts === 1 ? 'datasheet that differs' : 'datasheets that differ'}
                    <span className="block text-xs text-dim">Otherwise those datasheets keep the counts you saved.</span>
                  </span>
                </label>
              ) : null}
              {save.error ? (
                <Problem error={save.error} />
              ) : save.data ? (
                <output className="block text-sm text-bone">
                  Imported: {save.data.added} added, {save.data.replaced} replaced, {save.data.kept} kept as saved.
                </output>
              ) : null}
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            {save.data ? 'Done' : 'Cancel'}
          </Button>
          {save.data ? null : (
            <Button
              disabled={!applying.length || save.isPending}
              onClick={() =>
                save.mutate(
                  applying.map(({ row }) => ({
                    entryId: row.entryId,
                    models: row.models,
                    built: row.built,
                    painted: row.painted,
                    wanted: row.wanted,
                    countsAs: row.countsAs,
                  })),
                )
              }
            >
              {save.isPending ? 'Importing…' : 'Import'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Badge({ tone, children }: { tone: 'plain' | 'warn'; children: string }) {
  return (
    <span className={`border px-1.5 py-0.5 text-xs ${tone === 'warn' ? 'border-discarded text-discarded' : 'border-edge text-dim'}`}>
      {children}
    </span>
  )
}
