import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import {
  isTeamFormat,
  sealedEventMinimumPlaces,
  sealedEventPlacesSeat,
  sealedEventArmyPointsError,
  sealedEventFormat,
  SEALED_EVENT_ADMIN_MAX,
  SEALED_EVENT_MEMBER_MAX,
  type SealedEventAdmission,
  type SealedEventAllowance,
  type SealedEventVisibility,
} from '../../../core/sealedEvent'
import { pointsBudgetError } from '../../../core/battle'
import type { TableShape } from '../../../core/tableShape'
import { AdminsField, type AdminPerson } from '../../components/AdminsField'
import { Choice } from '../../components/Choice'
import { inputMoment, momentFromInput } from '../../dates'
import { friendshipsQuery } from '../../queries'
import { SealedEventRuleFields, GROUP_ROSTER_RULE, ROSTER_RULE } from './SealedEventRuleFields'
import { sealedEventAllowances } from './sealedEvent'

export type SealedEventFormValue = {
  name: string
  description: string
  visibility: SealedEventVisibility
  admission: SealedEventAdmission
  playerLimit: number | null
  format: TableShape
  rosterLimit: number
  allowances: SealedEventAllowance[]
  rounds: number | null
  pointsBudget: number | null
  soloPoints: number | null
  allyPoints: number | null
  sharedPoints: boolean
  playsAt: number | null
  sealBy: number | null
}

/**
 * Every setting in one form, so an organizer never looks in two places for one.
 *
 * What an event needs to start comes first: a tournament's name, the format and points, and whether the
 * organizer plays. A tournament's details, player limit, public listing and approval fold under More options,
 * whose summary names what they are set to, so the defaults never need reading. A group's hidden-list game has none of
 * those, so its form is the format, points and schedule alone.
 */
export function SealedEventFormFields({
  idPrefix,
  value,
  seated,
  limitFormat,
  ruleLock,
  shapeLock,
  tournament,
  ownerPlays,
  optionsOpen,
  admins,
  disabled,
  onChange,
  onOwnerPlaysChange,
}: {
  idPrefix: string
  value: SealedEventFormValue
  /** Accepted entrants in the open event, who each hold a place the limit cannot drop below. */
  seated: number
  /** The shape the limit must seat, or null once the event it would constrain is revealed. */
  limitFormat: TableShape | null
  /** Why the format and points can no longer change, or null while they can. */
  ruleLock: string | null
  /** Why the format and size can no longer change while points and house rules still can, or null. */
  shapeLock: string | null
  /** Whether the form sets up a tournament rather than a group's hidden-list game. */
  tournament: boolean
  /** Whether the organizer enters as a player; omitted where their entry already stands on its own. */
  ownerPlays: boolean | undefined
  /** Whether More options starts unfolded, as it does when editing a sealed event that already has them set. */
  optionsOpen: boolean
  /** The owner's choice of admins, offered only to the owner of a sealed event that already exists. */
  admins: AdminChoice | undefined
  disabled: boolean
  onChange: (value: SealedEventFormValue) => void
  onOwnerPlaysChange: (plays: boolean) => void
}) {
  const [showOptions, setShowOptions] = useState(optionsOpen)
  const minimum = sealedEventMinimumPlaces(limitFormat, seated)
  const limitValid = sealedEventPlacesSeat(limitFormat, value.playerLimit, seated)
  const summary = [
    value.visibility === 'private' ? 'Private link' : 'Public',
    value.admission === 'automatic' ? 'anyone with it joins' : 'you approve each player',
    value.playerLimit === null ? 'no player limit' : `${value.playerLimit} places`,
  ].join(' · ')
  return (
    <>
      {/* A group's hidden-list game is labelled from what is played, so only a tournament is named. */}
      {tournament ? (
        <div data-onboarding="sealed-event-name" className="space-y-1.5">
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
      <div data-onboarding="sealed-event-format" className="space-y-4">
        {ruleLock ? (
          <div className="space-y-1.5">
            <p className="eyebrow">Format and points</p>
            <p className="font-semibold">{sealedEventFormat(value)}</p>
            <p className="text-sm text-dim">House rules: {sealedEventAllowances(value)}</p>
            <p className="text-xs text-dim">
              {[(tournament ? ROSTER_RULE : GROUP_ROSTER_RULE)[value.format], ruleLock].filter(Boolean).join(' ')}
            </p>
          </div>
        ) : (
          <SealedEventRuleFields
            value={value}
            pairing={tournament}
            shapeLock={shapeLock}
            disabled={disabled}
            onChange={(rule) =>
              // A shape the limit cannot seat starts its limit at the fewest places that do.
              onChange({
                ...value,
                ...rule,
                playerLimit: sealedEventPlacesSeat(rule.format, value.playerLimit, seated)
                  ? value.playerLimit
                  : sealedEventMinimumPlaces(rule.format, Math.max(value.playerLimit ?? 0, seated)),
              })
            }
          />
        )}
      </div>
      <ScheduleFields idPrefix={idPrefix} value={value} tournament={tournament} disabled={disabled} onChange={onChange} />
      {ownerPlays === undefined ? null : (
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
          data-onboarding="sealed-event-options"
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
                max={SEALED_EVENT_MEMBER_MAX}
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
            {admins ? <SealedEventAdminsField idPrefix={idPrefix} admins={admins} disabled={disabled} /> : null}
          </div>
        </details>
      ) : null}
    </>
  )
}

/** Whether the form can be saved: a tournament's name and a limit that seats the chosen shape and everyone already in. */
export function sealedEventFormValid(value: SealedEventFormValue, seated: number, limitFormat: TableShape | null, tournament: boolean) {
  return (
    (!tournament || (Boolean(value.name.trim()) && sealedEventPlacesSeat(limitFormat, value.playerLimit, seated))) &&
    !pointsBudgetError(value.rosterLimit, value.pointsBudget) &&
    !sealedEventArmyPointsError(value.format, value) &&
    !scheduleProblem(value)
  )
}

const scheduleProblem = ({ playsAt, sealBy }: Pick<SealedEventFormValue, 'playsAt' | 'sealBy'>) =>
  playsAt !== null && sealBy !== null && sealBy > playsAt ? 'Set the roster deadline before the date it’s played.' : null

/** When the event is played and when rosters must be sealed by, both optional and open to change until the reveal. */
function ScheduleFields({
  idPrefix,
  value,
  tournament,
  disabled,
  onChange,
}: {
  idPrefix: string
  value: SealedEventFormValue
  tournament: boolean
  disabled: boolean
  onChange: (value: SealedEventFormValue) => void
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

/** The admins being chosen: `known` names the ones already saved, so a friendship that has since ended still shows them. */
type AdminChoice = { selected: string[]; known: readonly AdminPerson[]; onChange: (ids: string[]) => void }

/** Friends the owner trusts to run the sealed event beside them: start events, change settings, and manage players. */
function SealedEventAdminsField({ idPrefix, admins, disabled }: { idPrefix: string; admins: AdminChoice; disabled: boolean }) {
  const { data: friendships } = useQuery(friendshipsQuery())
  return (
    <AdminsField
      id={`${idPrefix}-admin`}
      people={admins.known}
      candidates={friendships?.friends ?? []}
      selected={admins.selected}
      max={SEALED_EVENT_ADMIN_MAX}
      disabled={disabled}
      onChange={admins.onChange}
      labels={{
        former: 'Former friend',
        add: 'Add a friend as an admin',
        none: 'Add friends to make them admins',
        hint: 'Admins change settings and manage players. Only you can delete it.',
      }}
    />
  )
}
