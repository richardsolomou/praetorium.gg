import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export function RosterExportDialog({ text, onClose }: { text: string | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    if (!text) return
    await navigator.clipboard.writeText(text)
    setCopied(true)
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
      <DialogContent className="max-h-[85dvh] rounded-none border border-edge bg-panel text-bone ring-0 sm:max-w-2xl">
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
