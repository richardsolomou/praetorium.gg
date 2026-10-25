import { Input } from '@/components/ui/input'
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
  leagueArmyPointsError,
  leagueRosterSplit,
  leagueSeatPoints,
  offeredLeagueAllowances,
  LEAGUE_DEFAULT_ROSTER_LIMIT,
  LEAGUE_TEAM_ROSTER_LIMITS,
  type LeagueAllowance,
  type LeagueAllowanceOption,
  type LeagueArmyPoints,
} from '../../../core/league'
import { TABLE_SHAPES, TABLE_SHAPE_LABELS, type TableShape } from '../../../core/tableShape'
import { Choice } from '../../components/Choice'
import { SWISS_ROUNDS_MAX } from '../../../core/swiss'
import { leagueAllowances } from './leagueEvent'
import { asSentence, countLabel } from '../../text'

/** `rounds` is the Swiss rounds the organizer pairs, or null for open play. */
type LeagueEventRuleValue = {
  format: TableShape
  rosterLimit: number
  allowances: LeagueAllowance[]
  rounds: number | null
  /** A duel's own points total under its battle size, or null for the size's full points. */
  pointsBudget: number | null
} & LeagueArmyPoints

/** Drops what a new format or size no longer offers, so the form never holds an allowance it does not show. */
const offeredAllowances = (rule: LeagueEventRuleValue): LeagueEventRuleValue => ({
  ...rule,
  allowances: offeredLeagueAllowances(rule.format, rule.rosterLimit, rule.allowances),
  // Swiss rounds and an own points total are for duels only, and points per army for team shapes.
  rounds: rule.format === '1v1' ? rule.rounds : null,
  pointsBudget: rule.format === '1v1' && allowsPointsBudget(rule.rosterLimit) ? rule.pointsBudget : null,
  soloPoints: rule.format === '2v1' ? rule.soloPoints : null,
  allyPoints: rule.format === '1v1' ? null : rule.allyPoints,
})

/** What a team shape asks of an entrant's roster; a duel's points say it all. A tournament's organizer seats entrants, a club's players seat themselves. */
export const ROSTER_RULE: Partial<Record<TableShape, string>> = {
  '2v1': 'You give each player the solo seat or a place in the pair before they seal.',
  '2v2': 'You pair players into teams of two before they seal. Team-wide limits are yours to check.',
}
export const CLUB_ROSTER_RULE: Partial<Record<TableShape, string>> = {
  '2v1': 'Players take the solo seat or a place in the pair, then seal a list for it.',
  '2v2': 'Players join one of two teams, then each seals a list. Team-wide limits are up to each team.',
}

export function LeagueEventRuleFields({
  value,
  pairing = false,
  disabled = false,
  onChange,
}: {
  value: LeagueEventRuleValue
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
    const size = GAME_SIZES.find((candidate) => candidate.limit === limit)
    return size ? battleSizeOptionLabel(size) : pointsLabel(limit)
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
            {value.format === '1v1' ? null : <ArmyPointsFields value={value} disabled={disabled} onChange={onChange} />}
          </>
        ) : (
          // One size on offer is a fact to read, not a choice to make.
          <>
            <p className="text-sm leading-none font-medium">Points</p>
            <p className="font-semibold">{label(value.rosterLimit)}</p>
          </>
        )}
        {(pairing ? ROSTER_RULE : CLUB_ROSTER_RULE)[value.format] ? (
          <p className="text-xs text-dim">{(pairing ? ROSTER_RULE : CLUB_ROSTER_RULE)[value.format]}</p>
        ) : null}
      </div>
      {pairing && value.format === '1v1' ? <Pairing value={value} disabled={disabled} onChange={onChange} /> : null}
      <HouseRules value={value} disabled={disabled} onChange={onChange} />
    </>
  )
}

/**
 * What each army may spend at a team event, typed per seat: 1,750 for the solo player against 800 for each ally, say.
 *
 * Most events play an even split, so it reads as one line until the organizer asks for the boxes or has set their own
 * numbers. A box left empty plays an even share of the battle size, which its placeholder shows.
 */
function ArmyPointsFields({
  value,
  disabled,
  onChange,
}: {
  value: LeagueEventRuleValue
  disabled: boolean
  onChange: (value: LeagueEventRuleValue) => void
}) {
  const seats: { key: keyof LeagueArmyPoints; label: string; solo: boolean }[] =
    value.format === '2v1'
      ? [
          { key: 'soloPoints', label: 'Solo player', solo: true },
          { key: 'allyPoints', label: 'Each ally', solo: false },
        ]
      : [{ key: 'allyPoints', label: 'Each player', solo: false }]
  const error = leagueArmyPointsError(value.format, value)
  const [open, setOpen] = useState(false)
  if (!open && value.soloPoints === null && value.allyPoints === null)
    return (
      <p className="text-xs text-dim">
        {leagueRosterSplit(value)}, an even split.{' '}
        <Button variant="link" size="xs" className="h-auto px-0 text-xs text-info" disabled={disabled} onClick={() => setOpen(true)}>
          Set points per army
        </Button>
      </p>
    )
  return (
    <div className="space-y-1.5 pt-2">
      <p className="text-sm leading-none font-medium">Points per army</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {seats.map((seat) => (
          <div key={seat.key} className="space-y-1">
            <Label htmlFor={`league-event-${seat.key}`} className="text-xs text-dim">
              {seat.label}
            </Label>
            <Input
              id={`league-event-${seat.key}`}
              inputMode="numeric"
              autoComplete="off"
              placeholder={String(leagueSeatPoints({ rosterLimit: value.rosterLimit }, seat.solo))}
              value={value[seat.key] === null ? '' : String(value[seat.key])}
              disabled={disabled}
              aria-invalid={Boolean(error)}
              className="h-11 text-base"
              onChange={(event) => onChange({ ...value, [seat.key]: event.target.value.trim() ? Number(event.target.value) : null })}
            />
          </div>
        ))}
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {asSentence(error)}
        </p>
      ) : null}
      <p className="text-xs text-dim">
        Lists are built at the battle size or smaller and spend up to their seat’s points. Allies bring lists saved to the same total.{' '}
        <Button
          variant="link"
          size="xs"
          className="h-auto px-0 text-xs text-info"
          disabled={disabled}
          onClick={() => {
            setOpen(false)
            onChange({ ...value, soloPoints: null, allyPoints: null })
          }}
        >
          Use an even split
        </Button>
      </p>
    </div>
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
                  {countLabel(rounds, 'round')}
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
