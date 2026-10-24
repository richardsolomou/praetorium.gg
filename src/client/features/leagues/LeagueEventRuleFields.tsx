import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { battleSizeOptionLabel, GAME_SIZES, pointsLabel } from '../../../core/battle'
import {
  leagueAllowanceOptions,
  leagueRosterSplit,
  LEAGUE_DEFAULT_ROSTER_LIMIT,
  LEAGUE_TEAM_ROSTER_LIMITS,
  type LeagueAllowance,
} from '../../../core/league'
import { TABLE_SHAPES, TABLE_SHAPE_LABELS, type TableShape } from '../../../core/tableShape'
import { Choice } from '../../components/Choice'
import { allowanceLabel } from './leagueEvent'

type LeagueEventRuleValue = { format: TableShape; rosterLimit: number; allowances: LeagueAllowance[] }

/** Drops what a new format or size no longer offers, so the form never holds an allowance it does not show. */
const offeredAllowances = (rule: LeagueEventRuleValue): LeagueEventRuleValue => {
  const offered = new Set(leagueAllowanceOptions(rule.format, rule.rosterLimit).map((option) => option.id))
  return { ...rule, allowances: rule.allowances.filter((id) => offered.has(id)) }
}

/** What a team shape asks of an entrant's roster; a duel's points say it all. */
export const ROSTER_RULE: Partial<Record<TableShape, string>> = {
  '2v1': 'You give each player a solo or allied size before they seal.',
  '2v2': 'You pair players into teams of two, and each seals a half-size roster. Team-wide limits are yours to check.',
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
    return size ? battleSizeOptionLabel(size) : `${pointsLabel(limit)} per player`
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
          onChange(
            offeredAllowances({
              ...value,
              format,
              rosterLimit:
                format !== '1v1' && !LEAGUE_TEAM_ROSTER_LIMITS.some((limit) => limit === value.rosterLimit)
                  ? LEAGUE_DEFAULT_ROSTER_LIMIT
                  : value.rosterLimit,
            }),
          )
        }
      />
      <div className="space-y-1.5">
        {limits.length > 1 ? (
          <>
            <Label htmlFor="league-event-roster-limit">Points</Label>
            <Select
              value={String(value.rosterLimit)}
              disabled={disabled}
              onValueChange={(limit) => limit && onChange(offeredAllowances({ ...value, rosterLimit: Number(limit) }))}
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
          </>
        ) : (
          // One size on offer is a fact to read, not a choice to make.
          <>
            <p className="text-sm leading-none font-medium">Points</p>
            <p className="font-semibold">{label(value.rosterLimit)}</p>
          </>
        )}
        {ROSTER_RULE[value.format] ? <p className="text-xs text-dim">{ROSTER_RULE[value.format]}</p> : null}
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm leading-none font-medium">House rules</legend>
        <p className="text-xs text-dim">All off is matched play. A list that needs anything left off can’t be sealed.</p>
        {/* Rules the battle size imposes come first, then the datasheets matched play leaves out on rows of their own. */}
        {[false, true].map((datasheets) => {
          const options = leagueAllowanceOptions(value.format, value.rosterLimit).filter(
            (option) => (option.id === 'legends' || option.id === 'crucible') === datasheets,
          )
          return (
            <div key={String(datasheets)} className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
              {options.map((option) => {
                const id = `league-allowance-${option.id}`
                return (
                  <div key={option.id} className="flex items-start gap-3">
                    <Switch
                      id={id}
                      aria-describedby={`${id}-hint`}
                      checked={value.allowances.includes(option.id)}
                      disabled={disabled}
                      onCheckedChange={(checked) =>
                        onChange({
                          ...value,
                          allowances: checked
                            ? [...value.allowances, option.id]
                            : value.allowances.filter((allowed) => allowed !== option.id),
                        })
                      }
                    />
                    <div>
                      <Label htmlFor={id} className="cursor-pointer text-sm font-semibold">
                        {allowanceLabel(option)}
                      </Label>
                      <p id={`${id}-hint`} className="text-xs text-dim">
                        {option.hint}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </fieldset>
    </>
  )
}
