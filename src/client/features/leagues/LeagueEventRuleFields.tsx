import { Label } from '@/components/ui/label'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { battleSizeOptionLabel, GAME_SIZES, pointsLabel } from '../../../core/battle'
import {
  leagueAllowanceOptions,
  leagueRosterSplit,
  LEAGUE_DEFAULT_ROSTER_LIMIT,
  LEAGUE_TEAM_ROSTER_LIMITS,
  type LeagueAllowance,
  type LeagueAllowanceOption,
} from '../../../core/league'
import { TABLE_SHAPES, TABLE_SHAPE_LABELS, type TableShape } from '../../../core/tableShape'
import { Choice } from '../../components/Choice'
import { leagueAllowances } from './leagueEvent'

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
      <HouseRules value={value} disabled={disabled} onChange={onChange} />
    </>
  )
}

const isDatasheetAllowance = (id: LeagueAllowance) => id === 'legends' || id === 'crucible'

/**
 * The event's restrictions read as the roster picker's menu does, ticked while enforced, so an organizer unticks what
 * lists may switch off. Legends and Crucible are the other way round: ticked is what lists may bring.
 */
function HouseRules({
  value,
  disabled,
  onChange,
}: {
  value: LeagueEventRuleValue
  disabled: boolean
  onChange: (value: LeagueEventRuleValue) => void
}) {
  const options = leagueAllowanceOptions(value.format, value.rosterLimit)
  const allowed = (id: LeagueAllowance) => value.allowances.includes(id)
  const toggle = (id: LeagueAllowance) =>
    onChange({ ...value, allowances: allowed(id) ? value.allowances.filter((other) => other !== id) : [...value.allowances, id] })
  const item = (option: LeagueAllowanceOption, checked: boolean) => (
    <DropdownMenuCheckboxItem key={option.id} className="items-start py-1.5" checked={checked} onCheckedChange={() => toggle(option.id)}>
      <span className="min-w-0">
        <span className="block text-xs font-semibold uppercase">{option.label}</span>
        <span className="mt-0.5 block text-2xs leading-tight text-wrap text-dim">{option.hint}</span>
      </span>
    </DropdownMenuCheckboxItem>
  )
  return (
    <div className="space-y-1.5">
      <Label htmlFor="league-event-house-rules">House rules</Label>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              id="league-event-house-rules"
              variant="outline"
              disabled={disabled}
              className="h-11 w-full justify-between font-normal"
            />
          }
        >
          {leagueAllowances(value)}
          <ChevronDown className="text-dim" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="eyebrow text-faint">Format restrictions</DropdownMenuLabel>
            {options.filter((option) => !isDatasheetAllowance(option.id)).map((option) => item(option, !allowed(option.id)))}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel className="eyebrow text-faint">Lists may include</DropdownMenuLabel>
            {options.filter((option) => isDatasheetAllowance(option.id)).map((option) => item(option, allowed(option.id)))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <p className="text-xs text-dim">A list that breaks a ticked restriction or brings an unticked datasheet can’t be sealed.</p>
    </div>
  )
}
