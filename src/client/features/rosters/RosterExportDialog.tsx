import { Check, Copy, Download } from 'lucide-react'
import { posthog } from 'posthog-js'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/Dialog'
import { nativeBridgeVersion } from '../../nativeBridge'
import type { exportRoster } from '../../functions'
import { Problem } from '../../components/Problem'
import { useCopyText } from '../../useCopyText'
import { downloadFile, safeFileName } from '../../downloadFile'

export type RosterTextExport = Awaited<ReturnType<typeof exportRoster>>

export function RosterExportDialog({ exported, onClose }: { exported: RosterTextExport | null; onClose: () => void }) {
  const { copy: copyText, copied, problem, reset } = useCopyText()
  const text = exported?.text
  const copy = async () => {
    if (!text) return
    if (await copyText(text, { failure: 'Copy failed. Select the text to copy it.', operation: 'roster_export_copy' }))
      posthog.capture('roster_export_copied', { format: 'readable' })
  }
  const download = () => {
    if (!text || !exported) return
    downloadFile(`${safeFileName(exported.name, 'roster')}-readable.txt`, text, 'text/plain;charset=utf-8')
    posthog.capture('roster_export_downloaded', { format: 'readable' })
  }

  return (
    <Dialog
      open={exported !== null}
      onOpenChange={(open) => {
        if (!open) {
          reset()
          onClose()
        }
      }}
    >
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Export roster</DialogTitle>
          <DialogDescription>Copy or save your roster as readable text.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <p className="mb-3 text-xs text-dim">
            Includes custom unit names, model counts, equipment, enhancements, Warlord, attachments, setup and rules version. Unit notes,
            preparation, rule waivers and optional rules are omitted.
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
