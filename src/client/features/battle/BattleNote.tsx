import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { type Command, NOTE_MAX_LENGTH } from '../../../core/battle'

/**
 * A line of the table's own record, added to the battle events every reader of the battle sees.
 *
 * Notes are rare, so the box opens from the battle's options rather than sitting above the log all game.
 */
export function BattleNote({ onClose, pending, send }: { onClose: () => void; pending: boolean; send: (command: Command) => void }) {
  const [text, setText] = useState('')
  const box = useRef<HTMLTextAreaElement>(null)
  // Opened to write, so the cursor goes straight into the box.
  useEffect(() => box.current?.focus(), [])
  return (
    <form
      className="space-y-1.5"
      onSubmit={(event) => {
        event.preventDefault()
        if (!text.trim()) return
        send({ kind: 'add-note', text })
        setText('')
        onClose()
      }}
    >
      <Label htmlFor="battle-note" className="text-sm font-medium text-dim">
        Battle note
      </Label>
      <Textarea
        id="battle-note"
        ref={box}
        value={text}
        maxLength={NOTE_MAX_LENGTH}
        rows={2}
        placeholder="A mission card scored, a rules call, a house rule…"
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !text) onClose()
        }}
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-2xs text-dim">Anyone who can watch this battle reads its notes.</p>
        <span className="flex shrink-0 gap-1">
          <Button type="button" variant="ghost" size="sm" onClick={() => (setText(''), onClose())}>
            Cancel
          </Button>
          <Button type="submit" variant="outline" size="sm" disabled={pending || !text.trim()}>
            Add note
          </Button>
        </span>
      </div>
    </form>
  )
}
