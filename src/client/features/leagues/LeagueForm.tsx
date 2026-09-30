import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  leagueMinimumPlaces,
  leaguePlacesSeat,
  leagueRosterSplit,
  LEAGUE_MEMBER_MAX,
  type LeagueAdmission,
  type LeagueVisibility,
} from '../../../core/league'
import { TABLE_SHAPE_LABELS, type TableShape } from '../../../core/tableShape'
import { Choice } from '../../components/Choice'
import { LeagueEventRuleFields, ROSTER_RULE } from './LeagueEventRuleFields'

export type LeagueFormValue = {
  name: string
  description: string
  visibility: LeagueVisibility
  admission: LeagueAdmission
  playerLimit: number | null
  format: TableShape
  rosterLimit: number
}

/**
 * Every setting in one form, so an organizer never looks in two places for one: the league's own,
 * which carry from event to event, then the one event's format and whether the organizer plays in it.
 */
export function LeagueFormFields({
  idPrefix,
  eventLabel,
  value,
  seated = 0,
  limitFormat = value.format,
  ruleLock = null,
  ownerPlays,
  disabled = false,
  onChange,
  onOwnerPlaysChange,
}: {
  idPrefix: string
  /** Which event the format belongs to, such as "Event 2". */
  eventLabel: string
  value: LeagueFormValue
  /** Accepted entrants in the open event, who each hold a place the limit cannot drop below. */
  seated?: number
  /** The shape the limit must seat, or null once the event it would constrain is revealed. */
  limitFormat?: TableShape | null
  /** Why the format and points can no longer change, or null while they can. */
  ruleLock?: string | null
  /** Whether the organizer enters as a player; omitted where their entry already stands on its own. */
  ownerPlays?: boolean
  disabled?: boolean
  onChange: (value: LeagueFormValue) => void
  onOwnerPlaysChange?: (plays: boolean) => void
}) {
  const minimum = leagueMinimumPlaces(limitFormat, seated)
  return (
    <>
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
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-description`}>Details</Label>
        <Textarea
          id={`${idPrefix}-description`}
          value={value.description}
          maxLength={2000}
          rows={3}
          placeholder="Dates, venue, house rules, anything players need to know."
          disabled={disabled}
          onChange={(event) => onChange({ ...value, description: event.target.value })}
        />
      </div>
      <div data-onboarding="league-limit" className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-player-limit`}>Player limit</Label>
        <Input
          id={`${idPrefix}-player-limit`}
          type="number"
          min={minimum}
          step={limitFormat === '2v2' ? 2 : 1}
          max={LEAGUE_MEMBER_MAX}
          value={value.playerLimit ?? ''}
          placeholder="No fixed limit"
          disabled={disabled}
          onChange={(event) => onChange({ ...value, playerLimit: event.target.value ? Number(event.target.value) : null })}
        />
        <p className="text-xs text-dim">
          {seated
            ? `No lower than ${minimum} while this event is open.`
            : limitFormat === '2v2'
              ? 'Doubles needs an even number of places, at least four.'
              : limitFormat === '2v1'
                ? 'A 2v1 event needs at least three places.'
                : 'Leave it empty for no limit. Set it, and every place must be filled before you can reveal.'}
        </p>
      </div>
      <Choice
        onboarding="league-visibility"
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
        onboarding="league-joining"
        label="Joining"
        value={value.admission}
        options={[
          { value: 'approval', name: 'Require approval', detail: 'You let each player in.' },
          { value: 'automatic', name: 'Automatic', detail: 'Anyone who joins is in.' },
        ]}
        disabled={disabled}
        onChange={(admission) => onChange({ ...value, admission })}
      />
      <section aria-labelledby={`${idPrefix}-event`} className="space-y-4 border-t border-edge pt-4">
        <div>
          <h3 id={`${idPrefix}-event`} className="eyebrow text-parchment">
            {eventLabel}
          </h3>
          <p className="text-xs text-dim">Set for this event alone. The next one can play a different format.</p>
        </div>
        <div data-onboarding="league-format" className="space-y-4">
          {ruleLock ? (
            <div className="space-y-1.5">
              <p className="eyebrow">Format and points</p>
              <p className="font-semibold">
                {TABLE_SHAPE_LABELS[value.format].name} ·{' '}
                {leagueRosterSplit(value.format, value.rosterLimit) ?? `${value.rosterLimit.toLocaleString()} points`}
              </p>
              <p className="text-xs text-dim">
                {ROSTER_RULE[value.format]} {ruleLock}
              </p>
            </div>
          ) : (
            <LeagueEventRuleFields
              value={value}
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
        {ownerPlays === undefined || !onOwnerPlaysChange ? null : (
          <div className="flex items-start gap-3 border border-edge bg-sunken p-3">
            <Switch
              id={`${idPrefix}-owner-plays`}
              className="mt-0.5"
              checked={ownerPlays}
              disabled={disabled}
              onCheckedChange={onOwnerPlaysChange}
            />
            <Label htmlFor={`${idPrefix}-owner-plays`} className="block cursor-pointer">
              <span className="block text-sm font-bold uppercase">I’m playing too</span>
              <span className="block text-xs font-normal tracking-normal text-dim normal-case">
                Takes one of the places, so you can seal your own list straight away.
              </span>
            </Label>
          </div>
        )}
      </section>
    </>
  )
}

/** Whether the form can be saved: a name, and a limit that seats the chosen shape and everyone already in. */
export function leagueFormValid(value: LeagueFormValue, seated = 0, limitFormat: TableShape | null = value.format) {
  return Boolean(value.name.trim()) && leaguePlacesSeat(limitFormat, value.playerLimit, seated)
}
