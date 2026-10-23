import { Check, Copy } from 'lucide-react'
import { posthog } from 'posthog-js'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/Dialog'
import { useQrCode } from '../../components/useQrCode'
import { useOrigin } from '../../useOrigin'
import { ROSTER_EXCHANGE_QR_MAX_LENGTH, rosterExchangeLink } from '../../../core/rosterExchange'
import { Problem } from '../../components/Problem'
import { useCopyText } from '../../useCopyText'

export type RosterExchangeCode = { name: string; code: string }

export function RosterExchangeDialog({ exchange, onClose }: { exchange: RosterExchangeCode | null; onClose: () => void }) {
  const origin = useOrigin()
  const { copy: copyText, copied, problem, reset } = useCopyText()
  const link = exchange && origin ? rosterExchangeLink(origin, exchange.code) : null
  const fits = link !== null && link.length <= ROSTER_EXCHANGE_QR_MAX_LENGTH
  const { image, failed } = useQrCode(fits ? link : null, 640, 'L')
  const copy = async () => {
    if (!exchange) return
    if (await copyText(exchange.code, { failure: 'Copy failed. Select the code to copy it.', operation: 'roster_exchange_code_copy' }))
      posthog.capture('roster_exchange_code_copied', { code_length: exchange.code.length })
  }

  return (
    <Dialog
      open={exchange !== null}
      onOpenChange={(open) => {
        if (open) return
        reset()
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
            <Problem>Could not make a QR code. Copy the code and send it instead.</Problem>
          ) : image ? (
            <img src={image} alt={`Exchange QR code for ${exchange?.name}`} className="mx-auto aspect-square w-full max-w-80 bg-white" />
          ) : (
            <output className="text-sm text-dim">Preparing the QR code…</output>
          )}
          <p className="text-xs text-dim">
            Carries units, custom names, model counts, equipment, attachments, starting embarks, Warlord, enhancements, setup and rules
            version. Unit notes, preparation, reminders, visibility and your account are not included.
          </p>
          <pre
            aria-label="Exchange code"
            className="max-h-40 overflow-y-auto border border-edge bg-sunken p-3 font-mono text-xs break-all whitespace-pre-wrap select-all"
          >
            {exchange?.code}
          </pre>
          {problem ? <Problem>{problem}</Problem> : null}
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
