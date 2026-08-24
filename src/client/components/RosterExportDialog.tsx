import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import posthog from 'posthog-js'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export function RosterExportDialog({ text, onClose }: { text: string | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      posthog.capture('roster_export_copied')
      setCopied(true)
    } catch (error) {
      posthog.captureException(error, { operation: 'roster_export_copy' })
    }
  }

  return (
    <Dialog
      open={text !== null}
      onOpenChange={(open) => {
        if (!open) {
          setCopied(false)
          onClose()
        }
      }}
    >
      <DialogContent className="max-h-[85dvh] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-none border border-edge bg-panel text-bone ring-0 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="uppercase">Games Workshop text</DialogTitle>
          <DialogDescription className="text-dim">Copy this roster into a message, document, or another tool.</DialogDescription>
        </DialogHeader>
        <pre className="min-h-0 overflow-auto whitespace-pre-wrap border border-edge bg-sunken p-3 text-xs select-text">{text}</pre>
        <DialogFooter className="rounded-none border-edge bg-sunken">
          <Button onClick={() => void copy()}>
            {copied ? <Check /> : <Copy />}
            {copied ? 'Copied' : 'Copy text'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
