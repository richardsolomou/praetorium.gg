import { Swords } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './Dialog'
import { Problem } from './Problem'

/** Picks who a battle is against and starts it; nothing closes it while the battle is being created. */
export function BattleChooserDialog({
  open,
  title,
  description,
  pending,
  error,
  ready,
  fit = false,
  onClose,
  onStart,
  children,
}: {
  open: boolean
  title: string
  description: string
  pending: boolean
  error: Error | null
  /** Whether every seat is filled, so the battle can start. */
  ready: boolean
  fit?: boolean
  onClose: () => void
  onStart: () => void
  children: ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && !next && onClose()}>
      <DialogContent aria-busy={pending} showCloseButton={!pending} fit={fit}>
        <DialogHeader>
          <DialogTitle className="text-2xl">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          {children}
          {error ? <Problem error={error} /> : null}
          {pending ? <output className="sr-only">Starting battle…</output> : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!ready || pending} onClick={onStart}>
            <Swords /> {pending ? 'Starting…' : 'Start battle'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
