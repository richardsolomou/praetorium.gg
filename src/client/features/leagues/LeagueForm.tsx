import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import {
  isTeamFormat,
  leagueMinimumPlaces,
  leaguePlacesSeat,
  leagueArmyPointsError,
  leagueFormat,
  LEAGUE_MEMBER_MAX,
  type LeagueAdmission,
  type LeagueAllowance,
  type LeagueVisibility,
} from '../../../core/league'
import { pointsBudgetError } from '../../../core/battle'
import type { TableShape } from '../../../core/tableShape'
import { Choice } from '../../components/Choice'
import { LeagueEventRuleFields, CLUB_ROSTER_RULE, ROSTER_RULE } from './LeagueEventRuleFields'
import { LeagueAdminsField, type AdminChoice } from './LeagueAdminsField'
import { leagueAllowances } from './leagueEvent'

export type LeagueFormValue = {
  name: string
  description: string
  visibility: LeagueVisibility
  admission: LeagueAdmission
  playerLimit: number | null
  format: TableShape
  rosterLimit: number
  allowances: LeagueAllowance[]
  rounds: number | null
  pointsBudget: number | null
  soloPoints: number | null
  allyPoints: number | null
  playsAt: number | null
  sealBy: number | null
}

/**
 * Every setting in one form, so an organizer never looks in two places for one.
 *
 * What an event needs to start comes first: a tournament's name, the format and points, and whether the
 * organizer plays. A tournament's details, player limit, public listing and approval fold under More options,
 * whose summary names what they are set to, so the defaults never need reading. A club's sealed game has none of
 * those, so its form is the format, points and schedule alone.
 */
export function LeagueFormFields({
  idPrefix,
  value,
  seated = 0,
  limitFormat = value.format,
  ruleLock = null,
  tournament,
  ownerPlays,
  optionsOpen = false,
  admins,
  disabled = false,
  onChange,
  onOwnerPlaysChange,
}: {
  idPrefix: string
  value: LeagueFormValue
  /** Accepted entrants in the open event, who each hold a place the limit cannot drop below. */
  seated?: number
  /** The shape the limit must seat, or null once the event it would constrain is revealed. */
  limitFormat?: TableShape | null
  /** Why the format and points can no longer change, or null while they can. */
  ruleLock?: string | null
  /** Whether the form sets up a tournament rather than a club's sealed game. */
  tournament: boolean
  /** Whether the organizer enters as a player; omitted where their entry already stands on its own. */
  ownerPlays?: boolean
  /** Whether More options starts unfolded, as it does when editing a league that already has them set. */
  optionsOpen?: boolean
  /** The owner's choice of admins, offered only to the owner of a league that already exists. */
  admins?: AdminChoice
  disabled?: boolean
  onChange: (value: LeagueFormValue) => void
  onOwnerPlaysChange?: (plays: boolean) => void
}) {
  const [showOptions, setShowOptions] = useState(optionsOpen)
  const minimum = leagueMinimumPlaces(limitFormat, seated)
  const limitValid = leaguePlacesSeat(limitFormat, value.playerLimit, seated)
  const summary = [
    value.visibility === 'private' ? 'Private link' : 'Public',
    value.admission === 'automatic' ? 'anyone with it joins' : 'you approve each player',
    value.playerLimit === null ? 'no player limit' : `${value.playerLimit} places`,
  ].join(' · ')
  return (
    <>
      {/* A club's sealed game is labelled from what is played, so only a tournament is named. */}
      {tournament ? (
        <div data-onboarding="league-name" className="space-y-1.5">
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
      ) : null}
      <div data-onboarding="league-format" className="space-y-4">
        {ruleLock ? (
          <div className="space-y-1.5">
            <p className="eyebrow">Format and points</p>
            <p className="font-semibold">{leagueFormat(value)}</p>
            <p className="text-sm text-dim">House rules: {leagueAllowances(value)}</p>
            <p className="text-xs text-dim">
              {[(tournament ? ROSTER_RULE : CLUB_ROSTER_RULE)[value.format], ruleLock].filter(Boolean).join(' ')}
            </p>
          </div>
        ) : (
          <LeagueEventRuleFields
            value={value}
            pairing={tournament}
            disabled={disabled}
            onChange={(rule) =>
              // A shape the limit cannot seat starts its limit at the fewest places that do.
              onChange({
                ...value,
                ...rule,
                playerLimit: leaguePlacesSeat(rule.format, value.playerLimit, seated)
                  ? value.playerLimit
                  : leagueMinimumPlaces(rule.format, Math.max(value.playerLimit ?? 0, seated)),
              })
            }
          />
        )}
      </div>
      <ScheduleFields idPrefix={idPrefix} value={value} tournament={tournament} disabled={disabled} onChange={onChange} />
      {ownerPlays === undefined || !onOwnerPlaysChange ? null : (
        <div className="flex items-center gap-3">
          <Switch id={`${idPrefix}-owner-plays`} checked={ownerPlays} disabled={disabled} onCheckedChange={onOwnerPlaysChange} />
          <Label htmlFor={`${idPrefix}-owner-plays`} className="cursor-pointer text-sm font-bold uppercase">
            I’m playing too
          </Label>
        </div>
      )}
      {/* A limit that no longer fits keeps the options open, so the field that needs fixing is in view. */}
      {tournament ? (
        <details
          data-onboarding="league-options"
          className="group border-t border-edge pt-3"
          open={showOptions || !limitValid}
          onToggle={(event) => setShowOptions(event.currentTarget.open)}
        >
          <summary className="flex cursor-pointer list-none items-baseline gap-3 py-1 pointer-coarse:min-h-11 pointer-coarse:items-center">
            <span className="eyebrow text-bone">More options</span>
            <span className="min-w-0 flex-1 truncate text-xs text-dim group-open:hidden">{summary}</span>
            <ChevronDown className="ml-auto size-4 shrink-0 self-center text-dim transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <div className="mt-3 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-description`}>Details</Label>
              <Textarea
                id={`${idPrefix}-description`}
                value={value.description}
                maxLength={2000}
                rows={2}
                placeholder="Dates, venue, anything else players need to know."
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
                step={limitFormat === '2v2' ? 2 : 1}
                max={LEAGUE_MEMBER_MAX}
                value={value.playerLimit ?? ''}
                placeholder="No limit"
                disabled={disabled}
                onChange={(event) => onChange({ ...value, playerLimit: event.target.value ? Number(event.target.value) : null })}
              />
              {seated || isTeamFormat(limitFormat) ? (
                <p className="text-xs text-dim">
                  {seated
                    ? `No lower than ${minimum} while entry is open.`
                    : limitFormat === '2v2'
                      ? 'Doubles needs an even number of places, at least four.'
                      : '2v1 needs at least three places.'}
                </p>
              ) : null}
            </div>
            <Choice
              label="Who can find it"
              value={value.visibility}
              columns={2}
              options={[
                { value: 'public', name: 'Public', detail: 'Listed on the tournaments page.' },
                { value: 'private', name: 'Private link', detail: 'Only people you send it to.' },
              ]}
              disabled={disabled}
              onChange={(visibility) => onChange({ ...value, visibility })}
            />
            <Choice
              label="Who gets in"
              value={value.admission}
              columns={2}
              options={[
                { value: 'automatic', name: 'Anyone who joins' },
                { value: 'approval', name: 'You approve' },
              ]}
              disabled={disabled}
              onChange={(admission) => onChange({ ...value, admission })}
            />
            {admins ? <LeagueAdminsField idPrefix={idPrefix} admins={admins} disabled={disabled} /> : null}
          </div>
        </details>
      ) : null}
    </>
  )
}

/** Whether the form can be saved: a tournament's name and a limit that seats the chosen shape and everyone already in. */
export function leagueFormValid(value: LeagueFormValue, seated = 0, limitFormat: TableShape | null = value.format, tournament = true) {
  return (
    (!tournament || (Boolean(value.name.trim()) && leaguePlacesSeat(limitFormat, value.playerLimit, seated))) &&
    !pointsBudgetError(value.rosterLimit, value.pointsBudget) &&
    !leagueArmyPointsError(value.format, value) &&
    !scheduleProblem(value)
  )
}

const scheduleProblem = ({ playsAt, sealBy }: Pick<LeagueFormValue, 'playsAt' | 'sealBy'>) =>
  playsAt !== null && sealBy !== null && sealBy > playsAt ? 'Set the roster deadline before the date it’s played.' : null

/** A moment as a `datetime-local` field holds it, in the reader's own timezone. */
const inputMoment = (at: number | null) => {
  if (at === null) return ''
  const date = new Date(at)
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
const momentFromInput = (text: string) => (text ? new Date(text).getTime() : null)

/** When the event is played and when rosters must be sealed by, both optional and open to change until the reveal. */
function ScheduleFields({
  idPrefix,
  value,
  tournament,
  disabled,
  onChange,
}: {
  idPrefix: string
  value: LeagueFormValue
  tournament: boolean
  disabled: boolean
  onChange: (value: LeagueFormValue) => void
}) {
  const problem = scheduleProblem(value)
  return (
    <div className="space-y-1.5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-plays-at`}>Played on</Label>
          <Input
            id={`${idPrefix}-plays-at`}
            type="datetime-local"
            value={inputMoment(value.playsAt)}
            disabled={disabled}
            onChange={(event) => onChange({ ...value, playsAt: momentFromInput(event.target.value) })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-seal-by`}>{tournament ? 'Seal rosters by' : 'Lists due'}</Label>
          <Input
            id={`${idPrefix}-seal-by`}
            type="datetime-local"
            value={inputMoment(value.sealBy)}
            aria-invalid={problem ? true : undefined}
            disabled={disabled}
            onChange={(event) => onChange({ ...value, sealBy: momentFromInput(event.target.value) })}
          />
        </div>
      </div>
      <p className={`text-xs ${problem ? 'text-destructive' : 'text-dim'}`}>
        {problem ??
          (tournament
            ? 'Both optional. After the deadline nobody can seal, and anyone without a sealed roster sits the event out.'
            : 'Both optional. After the deadline nobody can seal, and anyone who hasn’t sealed doesn’t play.')}
      </p>
    </div>
  )
}
