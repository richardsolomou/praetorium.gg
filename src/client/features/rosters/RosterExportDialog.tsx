import { useState } from 'react'
import { Check, Copy, Download } from 'lucide-react'
import { posthog } from 'posthog-js'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/Dialog'
import { Choice } from '../../components/Choice'
import { nativeBridgeVersion } from '../../nativeBridge'
import type { exportRoster } from '../../functions'
import { Problem } from '../../components/Problem'
import { useCopyText } from '../../useCopyText'
import { downloadFile } from '../../downloadFile'

export type RosterTextExport = Awaited<ReturnType<typeof exportRoster>>

const PRAETORIUM_DETAIL =
  'Includes model counts, equipment, enhancements, Warlord, attachments, setup and rules-version identity for import here.'

const layouts = {
  readable: { name: 'Readable', field: 'text', detail: PRAETORIUM_DETAIL },
  compact: { name: 'Compact', field: 'compactText', detail: PRAETORIUM_DETAIL },
  listforge: {
    name: 'ListForge',
    field: 'listForgeText',
    detail:
      "ListForge's detailed layout. Includes equipment, enhancements, Warlord, attachments and setup. Battle size, model counts and rules-version identity are omitted.",
  },
  warmind: {
    name: 'Warmind',
    field: 'warmindText',
    detail: "Warmind's layout. Includes model counts, equipment, enhancements, Warlord, attachments, setup and rules-version identity.",
  },
  wtc: {
    name: 'WTC-style',
    field: 'wtcText',
    detail:
      'A WTC-style header over the official app layout. Includes equipment, enhancements, Warlord, attachments and setup. Model counts and rules-version identity are omitted.',
  },
} as const satisfies Record<string, { name: string; field: keyof RosterTextExport; detail: string }>

type Layout = keyof typeof layouts

export function RosterExportDialog({ exported, onClose }: { exported: RosterTextExport | null; onClose: () => void }) {
  const [format, setFormat] = useState<Layout>('readable')
  const { copy: copyText, copied, problem, reset } = useCopyText()
  const text = exported?.[layouts[format].field]
  const copy = async () => {
    if (!text) return
    if (await copyText(text, { failure: 'Copy failed. Select the text to copy it.', operation: 'roster_export_copy' }))
      posthog.capture('roster_export_copied', { format })
  }
  const download = () => {
    if (!text || !exported) return
    downloadFile(
      `${exported.name.replaceAll(/[^\p{L}\p{N} ._-]/gu, '_').slice(0, 100) || 'roster'}-${format}.txt`,
      text,
      'text/plain;charset=utf-8',
    )
    posthog.capture('roster_export_downloaded', { format })
  }

  return (
    <Dialog
      open={exported !== null}
      onOpenChange={(open) => {
        if (!open) {
          reset()
          setFormat('readable')
          onClose()
        }
      }}
    >
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Export roster</DialogTitle>
          <DialogDescription>Choose a text layout to copy or save.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Choice
            label="Text layout"
            value={format}
            columns={3}
            options={(Object.keys(layouts) as Layout[]).map((value) => ({ value, name: layouts[value].name }))}
            onChange={(next) => {
              reset()
              setFormat(next)
            }}
          />
          <p className="my-3 text-xs text-dim">
            {layouts[format].detail} Unit notes, preparation, rule waivers and optional rules are omitted. Check the event's submission
            requirements before sending.
          </p>
          {exported?.omittedUnitCount ? (
            <Problem className="mb-3">
              {exported.omittedUnitCount} unresolved {exported.omittedUnitCount === 1 ? 'entry is' : 'entries are'} omitted. Resolve them in
              the builder before submitting this roster.
            </Problem>
          ) : null}
          <pre className="whitespace-pre-wrap wrap-anywhere border border-edge bg-sunken p-3 text-xs select-text">{text}</pre>
          {problem ? <Problem className="mt-3">{problem}</Problem> : null}
        </DialogBody>
        <DialogFooter>
          {nativeBridgeVersion() === undefined ? (
            <Button variant="outline" onClick={download}>
              <Download />
              Download text
            </Button>
          ) : null}
          <Button onClick={() => void copy()}>
            {copied ? <Check /> : <Copy />}
            {copied ? 'Copied' : 'Copy text'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
