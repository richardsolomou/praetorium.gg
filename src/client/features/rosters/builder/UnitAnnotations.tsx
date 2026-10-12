import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { UNIT_NICKNAME_MAX_LENGTH, UNIT_NOTE_MAX_LENGTH } from '../../../../core/unitNotes'

type Props = {
  nickname?: string
  note?: string
  onChange: (field: 'nickname' | 'note', value: string) => void
  /** Absent for a visitor's draft, which has no link anybody else could read. */
  shareNotes?: { shared: boolean; onChange: (shared: boolean) => void }
}

/** The player's own name and note for one unit in the roster. */
export function UnitAnnotations({ nickname, note, onChange, shareNotes }: Props) {
  return (
    <section className="space-y-2.5 border-b border-edge pb-3" aria-label="Nickname and note">
      <div className="space-y-1">
        <Label htmlFor="unit-nickname">Nickname</Label>
        <Input
          id="unit-nickname"
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
          placeholder={shareNotes?.shared ? 'Shared with anyone who can open this roster' : 'Only you can see notes'}
          onChange={(event) => onChange('note', event.target.value)}
        />
      </div>
      {shareNotes ? (
        <div className="flex items-start gap-3">
          <Switch id="share-unit-notes" className="mt-0.5" checked={shareNotes.shared} onCheckedChange={shareNotes.onChange} />
          <Label htmlFor="share-unit-notes" className="block cursor-pointer">
            <span className="block text-xs font-bold uppercase">Share unit notes</span>
            <span className="block text-xs font-normal tracking-normal text-dim normal-case">
              Lets anyone who can open this roster read every unit’s notes. Battles, text exports and exchange codes never include them.
            </span>
          </Label>
        </div>
      ) : null}
    </section>
  )
}
