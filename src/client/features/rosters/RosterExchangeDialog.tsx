import { useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { posthog } from 'posthog-js'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/Dialog'
import { useQrCode } from '../../components/useQrCode'
import { useOrigin } from '../../useOrigin'
import { ROSTER_EXCHANGE_QR_MAX_LENGTH, rosterExchangeLink } from '../../../core/rosterExchange'

export type RosterExchangeCode = { name: string; code: string }

export function RosterExchangeDialog({ exchange, onClose }: { exchange: RosterExchangeCode | null; onClose: () => void }) {
  const origin = useOrigin()
  const [copied, setCopied] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const copyAttempt = useRef(0)
  const link = exchange && origin ? rosterExchangeLink(origin, exchange.code) : null
  const fits = link !== null && link.length <= ROSTER_EXCHANGE_QR_MAX_LENGTH
  const { image, failed } = useQrCode(fits ? link : null, 640, 'L')
  const copy = async () => {
    if (!exchange) return
    const attempt = ++copyAttempt.current
    setCopied(false)
    setProblem(null)
    try {
      await navigator.clipboard.writeText(exchange.code)
      posthog.capture('roster_exchange_code_copied', { code_length: exchange.code.length })
      if (attempt === copyAttempt.current) setCopied(true)
    } catch (error) {
      posthog.captureException(error, { operation: 'roster_exchange_code_copy' })
      if (attempt === copyAttempt.current) setProblem('Copy failed. Select the code to copy it.')
    }
  }

  return (
    <Dialog
      open={exchange !== null}
      onOpenChange={(open) => {
        if (open) return
        copyAttempt.current++
        setCopied(false)
        setProblem(null)
        onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Exchange code</DialogTitle>
          <DialogDescription>
            Another player can {fits ? 'scan this or paste the code' : 'paste this code'} into Import roster to review and keep their own
            copy. Your roster stays unchanged.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {!fits && link ? (
            <output className="text-sm text-discarded">
              This roster is too long for a reliable QR code. Copy the code and send it instead.
            </output>
          ) : failed ? (
            <p role="alert" className="text-sm text-destructive">
              Could not make a QR code. Copy the code and send it instead.
            </p>
          ) : image ? (
            <img src={image} alt={`Exchange QR code for ${exchange?.name}`} className="mx-auto aspect-square w-full max-w-80 bg-white" />
          ) : (
            <output className="text-sm text-dim">Preparing the QR code…</output>
          )}
          <p className="text-xs text-dim">
            Carries units, nicknames, model counts, equipment, attachments, Warlord, enhancements, setup and rules version. Unit notes,
            preparation, reminders, visibility and your account are not included.
          </p>
          <pre
            aria-label="Exchange code"
            className="max-h-40 overflow-y-auto border border-edge bg-sunken p-3 font-mono text-xs break-all whitespace-pre-wrap select-all"
          >
            {exchange?.code}
          </pre>
          {problem ? (
            <p role="alert" className="text-sm text-destructive">
              {problem}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button onClick={() => void copy()}>
            {copied ? <Check /> : <Copy />}
            {copied ? 'Copied' : 'Copy code'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
