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
import { allowsPointsBudget, battleSizeOptionLabel, GAME_SIZES, pointsBudgetError, pointsLabel } from '../../../core/battle'
import { useState } from 'react'
import { PointsTotalError, PointsTotalInput } from '../../components/PointsTotalInput'
import {
  isNonMatchedPlayAllowance,
  leagueAllowanceOptions,
  leagueRosterSplit,
  offeredLeagueAllowances,
  LEAGUE_DEFAULT_ROSTER_LIMIT,
  LEAGUE_TEAM_ROSTER_LIMITS,
  type LeagueAllowance,
  type LeagueAllowanceOption,
} from '../../../core/league'
import { TABLE_SHAPES, TABLE_SHAPE_LABELS, type TableShape } from '../../../core/tableShape'
import { Choice } from '../../components/Choice'
import { SWISS_ROUNDS_MAX } from '../../../core/swiss'
import { leagueAllowances } from './leagueEvent'

/** `rounds` is the Swiss rounds the organizer pairs, or null for open play. */
type LeagueEventRuleValue = {
  format: TableShape
  rosterLimit: number
  allowances: LeagueAllowance[]
  rounds: number | null
  /** A duel's own points total under its battle size, or null for the size's full points. */
  pointsBudget: number | null
}

/** Drops what a new format or size no longer offers, so the form never holds an allowance it does not show. */
const offeredAllowances = (rule: LeagueEventRuleValue): LeagueEventRuleValue => ({
  ...rule,
  allowances: offeredLeagueAllowances(rule.format, rule.rosterLimit, rule.allowances),
  // Swiss rounds and an own points total are for duels only.
  rounds: rule.format === '1v1' ? rule.rounds : null,
  pointsBudget: rule.format === '1v1' && allowsPointsBudget(rule.rosterLimit) ? rule.pointsBudget : null,
})

/** What a team shape asks of an entrant's roster; a duel's points say it all. */
export const ROSTER_RULE: Partial<Record<TableShape, string>> = {
  '2v1': 'You give each player a solo or allied size before they seal.',
  '2v2': 'You pair players into teams of two, and each seals a half-size roster. Team-wide limits are yours to check.',
}

export function LeagueEventRuleFields({
  value,
  pairing = false,
  duelOnly = false,
  disabled = false,
  onChange,
}: {
  value: LeagueEventRuleValue
  /** A club's sealed game is a round of duels, so it offers no other format. */
  duelOnly?: boolean
  /** Whether the organizer may choose Swiss rounds, which a club's sealed game never plays. */
  pairing?: boolean
  disabled?: boolean
  onChange: (value: LeagueEventRuleValue) => void
}) {
  const limits = value.format === '1v1' ? GAME_SIZES.map((size) => size.limit) : LEAGUE_TEAM_ROSTER_LIMITS
  // A duel may play its size at its own total, typed beside the size; the text is kept so a half-typed total stays as typed.
  const budgeted = value.format === '1v1' && allowsPointsBudget(value.rosterLimit)
  const [budgetText, setBudgetText] = useState(value.pointsBudget === null ? '' : String(value.pointsBudget))
  const budgetError = budgetText.trim() ? pointsBudgetError(value.rosterLimit, Number(budgetText)) : null
  const label = (limit: number) => {
    const split = leagueRosterSplit(value.format, limit)
    if (split) return split
    const size = GAME_SIZES.find((candidate) => candidate.limit === limit)
    return size ? battleSizeOptionLabel(size) : `${pointsLabel(limit)} per player`
  }

  return (
    <>
      {duelOnly ? null : (
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
      )}
      <div className="space-y-1.5">
        {limits.length > 1 ? (
          <>
            <Label htmlFor="league-event-roster-limit">Points</Label>
            <div className="flex items-stretch gap-2">
              <Select
                value={String(value.rosterLimit)}
                disabled={disabled}
                onValueChange={(limit) => limit && onChange(offeredAllowances({ ...value, rosterLimit: Number(limit) }))}
              >
                <SelectTrigger id="league-event-roster-limit" className="h-11 min-w-0 flex-1">
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
              {budgeted ? (
                <PointsTotalInput
                  id="league-event-points-budget"
                  className="h-auto"
                  limit={value.rosterLimit}
                  value={budgetText}
                  error={budgetError}
                  disabled={disabled}
                  onChange={(text) => {
                    setBudgetText(text)
                    onChange({ ...value, pointsBudget: text.trim() ? Number(text) : null })
                  }}
                />
              ) : null}
            </div>
            <PointsTotalError id="league-event-points-budget" error={budgetError} />
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
      {pairing && value.format === '1v1' ? <Pairing value={value} disabled={disabled} onChange={onChange} /> : null}
      <HouseRules value={value} disabled={disabled} onChange={onChange} />
    </>
  )
}

/** Open play lets entrants choose their opponents; Swiss rounds have the organizer pair each round on the scores so far. */
function Pairing({
  value,
  disabled,
  onChange,
}: {
  value: LeagueEventRuleValue
  disabled: boolean
  onChange: (value: LeagueEventRuleValue) => void
}) {
  return (
    <div className="space-y-3">
      <Choice
        label="Pairing"
        value={value.rounds === null ? 'open' : 'swiss'}
        options={[
          { value: 'open', name: 'Open play', detail: 'Players choose who to play, as often as they like.' },
          { value: 'swiss', name: 'Swiss rounds', detail: 'You pair each round on the scores so far, without rematches.' },
        ]}
        columns={2}
        disabled={disabled}
        onChange={(pairing) => onChange({ ...value, rounds: pairing === 'open' ? null : (value.rounds ?? SWISS_DEFAULT_ROUNDS) })}
      />
      {value.rounds === null ? null : (
        <div className="space-y-1.5">
          <Label htmlFor="league-event-rounds">Rounds</Label>
          <Select
            value={String(value.rounds)}
            disabled={disabled}
            onValueChange={(rounds) => rounds && onChange({ ...value, rounds: Number(rounds) })}
          >
            <SelectTrigger id="league-event-rounds" className="h-11 w-full">
              <SelectValue>{() => `${value.rounds} rounds`}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: SWISS_ROUNDS_MAX }, (_, index) => index + 1).map((rounds) => (
                <SelectItem key={rounds} value={String(rounds)}>
                  {rounds === 1 ? '1 round' : `${rounds} rounds`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-dim">Three suits up to eight players, four up to sixteen.</p>
        </div>
      )}
    </div>
  )
}

const SWISS_DEFAULT_ROUNDS = 3

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
              aria-describedby="league-event-house-rules-summary"
              variant="outline"
              disabled={disabled}
              className="h-11 w-full justify-between font-normal"
            />
          }
        >
          <span id="league-event-house-rules-summary" className="min-w-0 truncate">
            {leagueAllowances(value)}
          </span>
          <ChevronDown className="text-dim" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="eyebrow text-faint">Format restrictions</DropdownMenuLabel>
            {options.filter((option) => !isNonMatchedPlayAllowance(option.id)).map((option) => item(option, !allowed(option.id)))}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel className="eyebrow text-faint">Lists may include</DropdownMenuLabel>
            {options.filter((option) => isNonMatchedPlayAllowance(option.id)).map((option) => item(option, allowed(option.id)))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <p className="text-xs text-dim">A list that breaks a ticked restriction or brings an unticked datasheet can’t be sealed.</p>
    </div>
  )
}
