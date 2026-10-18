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

export function RosterExportDialog({ exported, onClose }: { exported: RosterTextExport | null; onClose: () => void }) {
  const [format, setFormat] = useState<'readable' | 'compact'>('readable')
  const { copy: copyText, copied, problem, reset } = useCopyText()
  const text = format === 'compact' ? exported?.compactText : exported?.text
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
            columns={2}
            options={[
              { value: 'readable', name: 'Readable' },
              { value: 'compact', name: 'Compact' },
            ]}
            onChange={(next) => {
              reset()
              setFormat(next)
            }}
          />
          <p className="my-3 text-xs text-dim">
            Includes model counts, equipment, enhancements, Warlord, attachments, setup and rules-version identity for import here. Unit
            notes, preparation, rule waivers and optional rules are omitted. Check the event's submission requirements before sending.
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
