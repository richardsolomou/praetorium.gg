import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { type Command, NOTE_MAX_LENGTH } from '../../../core/battle'

/** A line of the table's own record, added to the battle events every reader of the battle sees. */
export function BattleNote({ pending, send }: { pending: boolean; send: (command: Command) => void }) {
  const [text, setText] = useState('')
  return (
    <form
      className="space-y-1.5"
      onSubmit={(event) => {
        event.preventDefault()
        if (!text.trim()) return
        send({ kind: 'add-note', text })
        setText('')
      }}
    >
      <Label htmlFor="battle-note" className="eyebrow">
        Battle note
      </Label>
      <Textarea
        id="battle-note"
        value={text}
        maxLength={NOTE_MAX_LENGTH}
        rows={2}
        placeholder="A mission card scored, a rules call, a house rule…"
        onChange={(event) => setText(event.target.value)}
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-2xs text-dim">Anyone who can watch this battle reads its notes.</p>
        <Button type="submit" variant="outline" size="sm" className="shrink-0" disabled={pending || !text.trim()}>
          Add note
        </Button>
      </div>
    </form>
  )
}
