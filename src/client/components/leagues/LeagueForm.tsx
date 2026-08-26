import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { LeagueAdmission, LeagueVisibility } from '../../../core/league'
import { Choice } from '../Choice'

export type LeagueFormValue = {
  name: string
  description: string
  visibility: LeagueVisibility
  admission: LeagueAdmission
  playerLimit: number | null
}

export function LeagueFormFields({
  idPrefix,
  value,
  admissionLocked = false,
  minimumPlayerLimit = 2,
  acceptedCount = 0,
  evenPlayerLimit = false,
  disabled = false,
  onChange,
}: {
  idPrefix: string
  value: LeagueFormValue
  admissionLocked?: boolean
  minimumPlayerLimit?: number
  acceptedCount?: number
  evenPlayerLimit?: boolean
  disabled?: boolean
  onChange: (value: LeagueFormValue) => void
}) {
  const minimum = evenPlayerLimit
    ? Math.ceil(Math.max(minimumPlayerLimit, acceptedCount) / 2) * 2
    : Math.max(minimumPlayerLimit, acceptedCount)
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-name`}>Name</Label>
        <Input
          id={`${idPrefix}-name`}
          value={value.name}
          maxLength={100}
          required
          disabled={disabled}
          onChange={(event) => onChange({ ...value, name: event.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-description`}>Details</Label>
        <Textarea
          id={`${idPrefix}-description`}
          value={value.description}
          maxLength={2000}
          rows={4}
          placeholder="Format, dates, venue, and anything entrants need to know."
          disabled={disabled}
          onChange={(event) => onChange({ ...value, description: event.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-player-limit`}>Player limit</Label>
        <Input
          id={`${idPrefix}-player-limit`}
          type="number"
          min={minimum}
          step={evenPlayerLimit ? 2 : 1}
          max={128}
          value={value.playerLimit ?? ''}
          placeholder="No fixed limit"
          disabled={disabled}
          onChange={(event) => onChange({ ...value, playerLimit: event.target.value ? Number(event.target.value) : null })}
        />
        <p className="text-xs text-dim">
          {acceptedCount
            ? `Cannot be lower than ${minimum} for this event.`
            : evenPlayerLimit
              ? 'A 2v2 event needs an even number of at least four places.'
              : minimumPlayerLimit === 3
                ? 'A 2v1 event needs at least three places.'
                : 'If set, every place must be accepted and sealed before reveal.'}
        </p>
      </div>
      <Choice
        label="Visibility"
        value={value.visibility}
        options={[
          { value: 'private', name: 'Private link', detail: 'Only people with the link can find it.' },
          { value: 'public', name: 'Public', detail: 'Listed on the leagues page for everyone.' },
        ]}
        disabled={disabled}
        onChange={(visibility) => onChange({ ...value, visibility })}
      />
      <Choice
        label="Joining"
        value={value.admission}
        options={[
          { value: 'approval', name: 'Require approval', detail: 'You approve each request.' },
          { value: 'automatic', name: 'Automatic', detail: 'Anyone who joins is accepted.' },
        ]}
        disabled={disabled || admissionLocked}
        onChange={(admission) => onChange({ ...value, admission })}
      />
      {admissionLocked ? <p className="-mt-2 text-xs text-dim">Locked because someone has joined the current event.</p> : null}
    </>
  )
}
