import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { GAME_SIZES } from '../../../core/battle'
import { leagueRosterSplit, LEAGUE_DEFAULT_ROSTER_LIMIT, LEAGUE_TEAM_ROSTER_LIMITS } from '../../../core/league'
import { TABLE_SHAPES, TABLE_SHAPE_LABELS, type TableShape } from '../../../core/tableShape'
import { Choice } from '../../components/Choice'

export type LeagueEventRuleValue = { format: TableShape; rosterLimit: number }

/** What each shape asks of an entrant's roster, which is the whole reason an event fixes one. */
export const ROSTER_RULE: Record<TableShape, string> = {
  '1v1': 'Everyone seals a list built to this size.',
  '2v1': 'You give each player a solo or allied size before they seal.',
  '2v2': 'You pair players into teams of two, and each seals a half-size list. Team-wide limits are yours to check.',
}

export function LeagueEventRuleFields({
  value,
  disabled = false,
  onChange,
}: {
  value: LeagueEventRuleValue
  disabled?: boolean
  onChange: (value: LeagueEventRuleValue) => void
}) {
  const limits = value.format === '1v1' ? GAME_SIZES.map((size) => size.limit) : LEAGUE_TEAM_ROSTER_LIMITS
  const label = (limit: number) => {
    const split = leagueRosterSplit(value.format, limit)
    if (split) return split
    const size = GAME_SIZES.find((candidate) => candidate.limit === limit)
    return size ? `${size.name} · ${limit.toLocaleString()} points` : `${limit.toLocaleString()} points per player`
  }

  return (
    <>
      <Choice
        label="Battle format"
        value={value.format}
        options={TABLE_SHAPES.map((shape) => ({ value: shape, ...TABLE_SHAPE_LABELS[shape] }))}
        columns={3}
        disabled={disabled}
        onChange={(format) =>
          onChange({
            format,
            rosterLimit:
              format !== '1v1' && !LEAGUE_TEAM_ROSTER_LIMITS.some((limit) => limit === value.rosterLimit)
                ? LEAGUE_DEFAULT_ROSTER_LIMIT
                : value.rosterLimit,
          })
        }
      />
      <div className="space-y-1.5">
        <Label htmlFor="league-event-roster-limit">Points</Label>
        <Select
          value={String(value.rosterLimit)}
          disabled={disabled}
          onValueChange={(limit) => limit && onChange({ ...value, rosterLimit: Number(limit) })}
        >
          <SelectTrigger id="league-event-roster-limit" className="h-11 w-full">
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
        <p className="text-xs text-dim">{ROSTER_RULE[value.format]}</p>
      </div>
    </>
  )
}
