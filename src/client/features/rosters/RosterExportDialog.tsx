import { useRef, useState } from 'react'
import { Check, Copy, Download } from 'lucide-react'
import { posthog } from 'posthog-js'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/Dialog'
import { Choice } from '../../components/Choice'
import { nativeBridgeVersion } from '../../nativeBridge'
import type { exportRoster } from '../../functions'

export type RosterTextExport = Awaited<ReturnType<typeof exportRoster>>

export function RosterExportDialog({ exported, onClose }: { exported: RosterTextExport | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const [format, setFormat] = useState<'readable' | 'compact'>('readable')
  const [problem, setProblem] = useState<string | null>(null)
  const copyAttempt = useRef(0)
  const text = format === 'compact' ? exported?.compactText : exported?.text
  const copy = async () => {
    if (!text) return
    const attempt = ++copyAttempt.current
    setCopied(false)
    setProblem(null)
    try {
      await navigator.clipboard.writeText(text)
      posthog.capture('roster_export_copied', { format })
      if (attempt === copyAttempt.current) setCopied(true)
    } catch (error) {
      posthog.captureException(error, { operation: 'roster_export_copy' })
      if (attempt === copyAttempt.current) setProblem('Copy failed. Select the text to copy it.')
    }
  }
  const download = () => {
    if (!text || !exported) return
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${exported.name.replaceAll(/[^\p{L}\p{N} ._-]/gu, '_').slice(0, 100) || 'roster'}-${format}.txt`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1_000)
    posthog.capture('roster_export_downloaded', { format })
  }

  return (
    <Dialog
      open={exported !== null}
      onOpenChange={(open) => {
        if (!open) {
          setCopied(false)
          copyAttempt.current++
          setFormat('readable')
          setProblem(null)
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
              copyAttempt.current++
              setFormat(next)
              setCopied(false)
              setProblem(null)
            }}
          />
          <p className="my-3 text-xs text-dim">
            Includes model counts, equipment, enhancements, Warlord, attachments, setup and rules-version identity for import here.
            Preparation, rule waivers and optional rules are omitted. Check the event's submission requirements before sending.
          </p>
          {exported?.omittedUnitCount ? (
            <p role="alert" className="mb-3 text-sm text-destructive">
              {exported.omittedUnitCount} unresolved {exported.omittedUnitCount === 1 ? 'entry is' : 'entries are'} omitted. Resolve them in
              the builder before submitting this roster.
            </p>
          ) : null}
          <pre className="whitespace-pre-wrap border border-edge bg-sunken p-3 text-xs select-text">{text}</pre>
          {problem ? (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {problem}
            </p>
          ) : null}
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
