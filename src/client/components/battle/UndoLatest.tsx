import { Undo2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { Command } from '../../../core/battle'
import { DrawUndoAlert } from './DrawUndoAlert'

type Options = {
  undoable: number | null
  undoableDraw: boolean
  send: (command: Command) => void
  beforeUndo?: () => void
}

export function useUndoLatest({ undoable, undoableDraw, send, beforeUndo }: Options) {
  const [confirming, setConfirming] = useState<number | null>(null)
  const submit = (target: number) => {
    beforeUndo?.()
    send({ kind: 'undo', target })
  }

  return {
    request: () => {
      if (undoable === null) return
      if (undoableDraw) setConfirming(undoable)
      else submit(undoable)
    },
    confirming,
    close: () => setConfirming(null),
    confirm: () => {
      if (confirming === null) return
      const target = confirming
      setConfirming(null)
      submit(target)
    },
  }
}

export function UndoLatestButton({
  disabled,
  compact = false,
  className = '',
  onClick,
}: {
  disabled: boolean
  compact?: boolean
  className?: string
  onClick: () => void
}) {
  return (
    <Button
      variant="outline"
      className={className}
      aria-label="Undo latest action"
      title="Undo latest action"
      disabled={disabled}
      onClick={onClick}
    >
      <Undo2 />
      {compact ? null : 'Undo latest action'}
    </Button>
  )
}

export function UndoLatestConfirmation({ pending, control }: { pending: boolean; control: ReturnType<typeof useUndoLatest> }) {
  return (
    <DrawUndoAlert
      open={control.confirming !== null}
      pending={pending}
      onOpenChange={(open) => !open && control.close()}
      onConfirm={control.confirm}
    />
  )
}
