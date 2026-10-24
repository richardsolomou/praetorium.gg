import { type ReactNode, useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { UNIT_LOADOUT_NAME_MAX_LENGTH } from '../../../../core/unitLoadouts'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../../components/Dialog'
import { Problem } from '../../../components/Problem'

type Props = {
  title: string
  description?: ReactNode
  initialName: string
  submit: string
  pendingLabel: string
  /** Whether this trimmed, non-empty name may be submitted. */
  accepts: (name: string) => boolean
  pending: boolean
  error: unknown
  /** What is being named, above the name. */
  children?: ReactNode
  onSubmit: (name: string) => void
  onClose: () => void
}

/** Names a saved loadout, for both saving a unit and renaming a loadout. */
export function LoadoutNameDialog({
  title,
  description,
  initialName,
  submit,
  pendingLabel,
  accepts,
  pending,
  error,
  children,
  onSubmit,
  onClose,
}: Props) {
  const id = useId()
  const [name, setName] = useState(initialName)
  const trimmed = name.trim()
  const ready = Boolean(trimmed) && accepts(trimmed) && !pending
  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <DialogBody>
          {children}
          <form
            id={`${id}-form`}
            onSubmit={(event) => {
              event.preventDefault()
              if (ready) onSubmit(trimmed)
            }}
          >
            <Label htmlFor={`${id}-name`}>Name</Label>
            <Input
              id={`${id}-name`}
              className="mt-1.5"
              value={name}
              maxLength={UNIT_LOADOUT_NAME_MAX_LENGTH}
              onChange={(event) => setName(event.target.value)}
            />
          </form>
          {error ? <Problem className="mt-2 text-xs" error={error} /> : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={`${id}-form`} disabled={!ready}>
            {pending ? pendingLabel : submit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
