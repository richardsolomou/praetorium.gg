import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { GAME_SIZES } from '../../../core/battle'
import { leagueRosterSplit, LEAGUE_DEFAULT_ROSTER_LIMIT, LEAGUE_TEAM_ROSTER_LIMITS } from '../../../core/league'
import { TABLE_SHAPES, TABLE_SHAPE_LABELS, type TableShape } from '../../../core/tableShape'
import { Choice } from '../Choice'

export type LeagueEventRuleValue = { format: TableShape; rosterLimit: number }

/** What each shape asks of an entrant's roster, which is the whole reason an event fixes one. */
const ROSTER_RULE: Record<TableShape, string> = {
  '1v1': 'Everyone builds to the same points.',
  '2v1': 'You give each entrant a solo or allied size.',
  '2v2': 'You pair entrants into fixed teams of two.',
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
        options={TABLE_SHAPES.map((shape) => ({ value: shape, ...TABLE_SHAPE_LABELS[shape], detail: ROSTER_RULE[shape] }))}
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
            ? 'Nobody can seal a list until you give them a size.'
            : value.format === '2v2'
              ? 'Each player seals their own legal half-size list. Team-wide restrictions are yours to check.'
              : 'Everyone seals a list built for this size.'}
        </p>
      </div>
    </>
  )
}
