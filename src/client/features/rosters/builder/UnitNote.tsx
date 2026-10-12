import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { UNIT_NOTE_MAX_LENGTH } from '../../../../core/unitNotes'

/** The owner's private note for one unit in the roster. */
export function UnitNote({ note, onChange }: { note?: string; onChange: (note: string) => void }) {
  return (
    <section className="ph-no-capture space-y-1 border-b border-edge pb-3" aria-label="Note">
      <Label htmlFor="unit-note">Note</Label>
      <Textarea
        id="unit-note"
        value={note ?? ''}
        maxLength={UNIT_NOTE_MAX_LENGTH}
        rows={2}
        placeholder="Only you can see notes"
        onChange={(event) => onChange(event.target.value)}
      />
    </section>
  )
}
