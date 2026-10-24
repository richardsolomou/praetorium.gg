import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { UNIT_NICKNAME_MAX_LENGTH, UNIT_NOTE_MAX_LENGTH } from '../../../../core/unitNotes'

type Props = {
  nickname?: string
  note?: string
  onChange: (field: 'nickname' | 'note', value: string) => void
}

/** The player's own name for one unit, which every reader sees, and their private note. */
export function UnitAnnotations({ nickname, note, onChange }: Props) {
  return (
    <section className="space-y-2.5 border-b border-edge pb-3" aria-label="Custom name and note">
      <div className="space-y-1">
        <Label htmlFor="unit-custom-name">Custom name</Label>
        <Input
          id="unit-custom-name"
          value={nickname ?? ''}
          maxLength={UNIT_NICKNAME_MAX_LENGTH}
          autoComplete="off"
          placeholder="Optional"
          onChange={(event) => onChange('nickname', event.target.value)}
        />
      </div>
      <div className="ph-no-capture space-y-1">
        <Label htmlFor="unit-note">Note</Label>
        <Textarea
          id="unit-note"
          value={note ?? ''}
          maxLength={UNIT_NOTE_MAX_LENGTH}
          rows={2}
          placeholder="Only you can see notes"
          onChange={(event) => onChange('note', event.target.value)}
        />
      </div>
    </section>
  )
}
