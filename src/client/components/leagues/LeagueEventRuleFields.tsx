import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { GAME_SIZES } from '../../../core/battle'
import {
  alliedLeagueRosterLimit,
  LEAGUE_DEFAULT_ROSTER_LIMIT,
  LEAGUE_TEAM_ROSTER_LIMITS,
  type LeagueEventFormat,
} from '../../../core/league'
import { Choice } from './LeagueForm'

export type LeagueEventRuleValue = { format: LeagueEventFormat; rosterLimit: number }

export function LeagueEventRuleFields({
  value,
  disabled = false,
  onChange,
}: {
  value: LeagueEventRuleValue
  disabled?: boolean
  onChange: (value: LeagueEventRuleValue) => void
}) {
  const limits = value.format === '2v1' ? LEAGUE_TEAM_ROSTER_LIMITS : GAME_SIZES.map((size) => size.limit)
  const label = (limit: number) => {
    if (value.format === '2v1') return `${limit.toLocaleString()} solo / ${alliedLeagueRosterLimit(limit).toLocaleString()} allied`
    const size = GAME_SIZES.find((candidate) => candidate.limit === limit)
    return size ? `${size.name} · ${limit.toLocaleString()} points` : `${limit.toLocaleString()} points per player`
  }

  return (
    <>
      <Choice
        label="Battle format"
        value={value.format}
        options={[
          { value: '1v1', title: '1 vs 1', detail: 'Every entrant uses the same roster size.' },
          { value: '2v1', title: '2 vs 1', detail: 'Assign each entrant a solo or allied roster size.' },
        ]}
        disabled={disabled}
        onChange={(format) =>
          onChange({
            format,
            rosterLimit:
              format === '2v1' && !LEAGUE_TEAM_ROSTER_LIMITS.some((limit) => limit === value.rosterLimit)
                ? LEAGUE_DEFAULT_ROSTER_LIMIT
                : value.rosterLimit,
          })
        }
      />
      <div className="space-y-1.5">
        <Label htmlFor="league-event-roster-limit">Roster size</Label>
        <Select
          value={String(value.rosterLimit)}
          disabled={disabled}
          onValueChange={(limit) => limit && onChange({ ...value, rosterLimit: Number(limit) })}
        >
          <SelectTrigger id="league-event-roster-limit" className="h-10 w-full rounded-none border-edge bg-sunken">
            <SelectValue>{() => label(value.rosterLimit)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {limits.map((limit) => (
              <SelectItem key={limit} value={String(limit)}>
                {label(limit)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-dim">
          {value.format === '2v1'
            ? 'The organizer assigns every accepted entrant to the solo or allied size before they can seal a roster.'
            : 'Every accepted entrant must seal a roster configured for this size.'}
        </p>
      </div>
    </>
  )
}
