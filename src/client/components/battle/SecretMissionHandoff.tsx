import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { type Side, sideName } from '../../sides'

type Props = {
  side: Side
  pending: boolean
  onReveal: () => void
  onCancel: () => void
}

export function SecretMissionHandoff({ side, pending, onReveal, onCancel }: Props) {
  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="rounded-none border border-edge bg-panel text-bone sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="uppercase">Secret Mission action · {sideName(side)}</DialogTitle>
          <DialogDescription className="text-dim">
            {side.played
              ? 'Reveal the face-down mission to continue.'
              : `Hand this device to ${sideName(side)}. When they are ready, revealing the mission opens its scoring prompt.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={onCancel}>
            Back
          </Button>
          <Button disabled={pending} onClick={onReveal}>
            Reveal and continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
