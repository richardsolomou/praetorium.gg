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
  minimumPlayerLimit = 2,
  acceptedCount = 0,
  evenPlayerLimit = false,
  disabled = false,
  onChange,
}: {
  idPrefix: string
  value: LeagueFormValue
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
          placeholder="Dates, venue, house rules, anything players need to know."
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
            ? `No lower than ${minimum} while this event is open.`
            : evenPlayerLimit
              ? 'Doubles needs an even number of places, at least four.'
              : minimumPlayerLimit === 3
                ? 'A 2v1 event needs at least three places.'
                : 'Leave it empty for no limit. Set it, and every place must be filled before you can reveal.'}
        </p>
      </div>
      <Choice
        label="Visibility"
        value={value.visibility}
        options={[
          { value: 'private', name: 'Private link', detail: 'Only people you send the link to.' },
          { value: 'public', name: 'Public', detail: 'Listed on the leagues page.' },
        ]}
        disabled={disabled}
        onChange={(visibility) => onChange({ ...value, visibility })}
      />
      <Choice
        label="Joining"
        value={value.admission}
        options={[
          { value: 'approval', name: 'Require approval', detail: 'You let each player in.' },
          { value: 'automatic', name: 'Automatic', detail: 'Anyone who joins is in.' },
        ]}
        disabled={disabled}
        onChange={(admission) => onChange({ ...value, admission })}
      />
    </>
  )
}
