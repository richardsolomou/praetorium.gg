import { useMutation, useQuery } from '@tanstack/react-query'
import { Check, Link2, Share2, UserMinus, UserPlus, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { isTeamFormat, alliedSealedEventRosterLimit, type SealedEventEntryView } from '../../../core/sealedEvent'
import { withMember } from '../../../core/collections'
import {
  addSealedEventEntrants,
  admitSealedEventEntries,
  assignSealedEventRosterRequirement,
  assignSealedEventTeam,
  moderateSealedEventEntry,
} from '../../functions'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/Dialog'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import { entrantLabels } from '../../playerLabels'
import { groupQuery, friendshipsQuery } from '../../queries'
import { useOrigin } from '../../useOrigin'
import { inviteFeedbackText, useInviteShare } from './SealedEventActions'
import { EntrantGroup, EntrantList, sealStatus } from './SealedEventEntrants'
import { SectionHeading } from '../../components/SectionHeading'
import {
  entrantGroups,
  entryRules,
  eventFullName,
  eventPath,
  sealedEventNoun,
  soloOrAllied,
  useSealedEventRefresh,
  type SealedEvent,
} from './sealedEvent'
import { Problem } from '../../components/Problem'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { formatList, countLabel } from '../../text'
import { useNativeShare } from '../../nativeBridge'
import { shareButtonLabel } from '../../useShareLink'

/** Draws one entrant with whatever the reader may do about them; the organizer's controls ride in `controls`, and `last` closes the row. */
type EntrantRowRenderer = (entry: SealedEventEntryView, detail: ReactNode, controls?: ReactNode, last?: ReactNode) => ReactNode

/** The organizer's view of who is in an open event: requests to answer, entrants to size, pair or remove, and who was turned away. */
export function OrganizerEntrants({ sealedEvent, token, row }: { sealedEvent: SealedEvent; token: string; row: EntrantRowRenderer }) {
  const refresh = useSealedEventRefresh(token)
  const eventToken = sealedEvent.eventToken
  const [removing, setRemoving] = useState<SealedEventEntryView | null>(null)
  const [reassigning, setReassigning] = useState<{ entry: SealedEventEntryView; requiredLimit: number } | null>(null)
  const [clearing, setClearing] = useState<{ userIds: string[]; sealed: SealedEventEntryView[] } | null>(null)
  // Null until the organizer ticks a box, so the only two players left to pair start picked.
  const [picked, setPicked] = useState<string[] | null>(null)

  const moderate = useMutation({
    mutationFn: (input: { userId: string; status: 'accepted' | 'rejected' }) =>
      moderateSealedEventEntry({ data: { token, eventToken, ...input } }),
    onSuccess: async () => {
      setRemoving(null)
      await refresh()
    },
  })
  const acceptAll = useMutation({
    mutationFn: (userIds: string[]) => admitSealedEventEntries({ data: { token, eventToken, userIds } }),
    onSettled: refresh,
  })
  const assign = useMutation({
    mutationFn: (input: { userId: string; requiredLimit: number }) =>
      assignSealedEventRosterRequirement({ data: { token, eventToken, ...input } }),
    onSuccess: async () => {
      setReassigning(null)
      await refresh()
    },
  })
  const assignTeam = useMutation({
    mutationFn: (userIds: string[]) => assignSealedEventTeam({ data: { token, eventToken, userIds } }),
    onSuccess: async () => {
      setClearing(null)
      setPicked(null)
      await refresh()
    },
  })

  const labels = entrantLabels(sealedEvent.entries)
  const label = (entry: SealedEventEntryView) => labels.get(entry.userId) ?? entry.name
  const nameOf = (userId: string) => labels.get(userId) ?? 'someone'
  const byJoin = sealedEvent.entries.toSorted((left, right) => left.joinedAt - right.joinedAt)
  const accepted = byJoin.filter((entry) => entry.status === 'accepted')
  const pending = byJoin.filter((entry) => entry.status === 'pending')
  const rejected = byJoin.filter((entry) => entry.status === 'rejected')
  // Doubles pairs anyone without a team; a 2v1 pairs only the allies, since the solo player plays alone.
  const pairPool = (group: { key: string }) => group.key === 'unpaired' || (sealedEvent.format === '2v1' && group.key === 'allied')
  // Whoever still needs the organizer leads: players without a size, then players without a partner.
  const rank = (group: { key: string }) => (group.key === 'unsized' ? 0 : pairPool(group) ? 1 : 2)
  const groups = entrantGroups(sealedEvent, accepted, (members) => formatList(members.map(label))).sort(
    (one, other) => rank(one) - rank(other),
  )
  // A picked player who was paired or removed since is dropped, so the picker never holds a place for a row it no longer shows.
  const unpairedIds = new Set(groups.filter(pairPool).flatMap((group) => group.entries.map((entry) => entry.userId)))
  const pickedLive = picked ? picked.filter((id) => unpairedIds.has(id)) : unpairedIds.size === 2 ? [...unpairedIds] : []
  const { playerLimit } = entryRules(sealedEvent)
  const openPlaces = playerLimit === null ? pending.length : Math.max(0, playerLimit - accepted.length)

  const requestAssignment = (entry: SealedEventEntryView, requiredLimit: number) => {
    if (entry.requiredLimit === requiredLimit) return
    assign.reset()
    if (entry.submitted) setReassigning({ entry, requiredLimit })
    else assign.mutate({ userId: entry.userId, requiredLimit })
  }
  const requestTeam = (userIds: string[]) => {
    assignTeam.reset()
    const touched = new Set(
      accepted.filter((entry) => userIds.includes(entry.userId)).flatMap((entry) => (entry.teamId ? [entry.teamId] : [])),
    )
    const sealed = accepted.filter(
      (entry) => entry.submitted && (userIds.includes(entry.userId) || (entry.teamId && touched.has(entry.teamId))),
    )
    // Doubles teams share a Warlord, so a new pairing clears their rosters; a 2v1 ally's roster stands on its own.
    if (sealedEvent.format === '2v2' && sealed.length) setClearing({ userIds, sealed })
    else assignTeam.mutate(userIds)
  }
  // A refusal is shown on the row it came from, unless a confirmation dialog is already showing it.
  const rowError = (error: Error | null, failedId: string | undefined, entry: SealedEventEntryView) =>
    error && failedId === entry.userId ? <Problem error={error} className="w-full text-right text-xs" /> : null
  const moderateError = (entry: SealedEventEntryView) => (removing ? null : rowError(moderate.error, moderate.variables?.userId, entry))
  // Removing an entrant is rare and recedes to an icon; the confirmation says the word.
  const removeButton = (entry: SealedEventEntryView) => (
    <Button
      size="icon"
      variant="ghost"
      className="text-dim hover:text-destructive pointer-coarse:size-11"
      aria-label={`Remove ${label(entry)}`}
      disabled={moderate.isPending}
      onClick={() => {
        moderate.reset()
        setRemoving(entry)
      }}
    >
      <UserMinus />
    </Button>
  )

  const sizeToggle = (entry: SealedEventEntryView) =>
    sealedEvent.format === '2v1' && sealedEvent.rosterLimit ? (
      <SizeToggle
        label={label(entry)}
        side={soloOrAllied(sealedEvent, entry)}
        pending={assign.isPending}
        onAssign={(next) =>
          requestAssignment(entry, next === 'solo' ? sealedEvent.rosterLimit! : alliedSealedEventRosterLimit(sealedEvent.rosterLimit!))
        }
      />
    ) : null
  // Remove and the size toggle close the row, after any view icon, so the toggle lines up across rows; refusals wrap below it.
  const last = (entry: SealedEventEntryView) => (
    <>
      {removeButton(entry)}
      {sizeToggle(entry)}
      {reassigning ? null : rowError(assign.error, assign.variables?.userId, entry)}
      {moderateError(entry)}
    </>
  )
  const pickBox = (entry: SealedEventEntryView) => {
    const checked = pickedLive.includes(entry.userId)
    return (
      <label className="flex cursor-pointer items-center gap-2 px-1 text-xs font-semibold tracking-label text-dim uppercase pointer-coarse:min-h-11">
        <input
          type="checkbox"
          className="size-5 accent-parchment"
          aria-label={`Pick ${label(entry)} for a ${sealedEvent.format === '2v1' ? 'pair' : 'team'}`}
          checked={checked}
          disabled={!checked && pickedLive.length === 2}
          onChange={() => setPicked(withMember(pickedLive, entry.userId))}
        />
        Pick
      </label>
    )
  }

  const entrants = !accepted.length ? (
    <p className="text-sm text-dim">No entrants yet. Share the invite link to fill it.</p>
  ) : isTeamFormat(sealedEvent.format) ? (
    <div className="space-y-4">
      {groups.map((group) => {
        const pairing = pairPool(group)
        return (
          <EntrantGroup
            key={group.key}
            group={group.key}
            title={group.title!}
            detail={pairing ? `Tick two ${sealedEvent.format === '2v1' ? 'allies' : 'players'}, then pair them.` : group.detail}
            action={
              pairing ? (
                <Button
                  size="sm"
                  className="max-w-full pointer-coarse:h-11"
                  disabled={pickedLive.length !== 2 || assignTeam.isPending}
                  onClick={() => requestTeam(pickedLive)}
                >
                  <span className="truncate">
                    {pickedLive.length === 2 ? `Pair ${formatList(pickedLive.map(nameOf))}` : 'Pick two to pair'}
                  </span>
                </Button>
              ) : group.teamId ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="pointer-coarse:h-11"
                  disabled={assignTeam.isPending}
                  aria-label={`Unpair ${formatList(group.entries.map(label))}`}
                  onClick={() => requestTeam([group.entries[0]!.userId])}
                >
                  <X /> Unpair
                </Button>
              ) : undefined
            }
          >
            <EntrantList>
              {group.entries.map((entry) => row(entry, sealStatus(entry, false), pairing ? pickBox(entry) : undefined, last(entry)))}
            </EntrantList>
            {pairing && assignTeam.error && clearing === null ? <Problem error={assignTeam.error} className="mt-2" /> : null}
          </EntrantGroup>
        )
      })}
    </div>
  ) : (
    <EntrantList>{accepted.map((entry) => row(entry, sealStatus(entry, false), undefined, last(entry)))}</EntrantList>
  )

  return (
    <>
      {pending.length ? (
        <section>
          <SectionHeading
            title="Requests"
            count={pending.length}
            action={
              pending.length > 1 && openPlaces > 0 ? (
                <Button
                  size="sm"
                  className="pointer-coarse:h-11"
                  disabled={acceptAll.isPending || moderate.isPending}
                  onClick={() => acceptAll.mutate(pending.map((entry) => entry.userId))}
                >
                  <Check /> {openPlaces >= pending.length ? 'Accept all' : `Accept the first ${openPlaces}`}
                </Button>
              ) : null
            }
          />
          <EntrantList>
            {pending.map((entry) =>
              row(
                entry,
                'Asked to join',
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="pointer-coarse:h-11"
                    aria-label={`Accept ${label(entry)}`}
                    disabled={moderate.isPending || acceptAll.isPending}
                    onClick={() => moderate.mutate({ userId: entry.userId, status: 'accepted' })}
                  >
                    <Check /> Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-dim hover:text-destructive pointer-coarse:h-11"
                    aria-label={`Turn away ${label(entry)}`}
                    disabled={moderate.isPending || acceptAll.isPending}
                    onClick={() => {
                      moderate.reset()
                      setRemoving(entry)
                    }}
                  >
                    <X /> Turn away
                  </Button>
                  {moderateError(entry)}
                </>,
              ),
            )}
          </EntrantList>
          {acceptAll.error ? <Problem error={acceptAll.error} className="mt-2" /> : null}
        </section>
      ) : null}

      <section data-onboarding="sealed-event-entrants">
        <SectionHeading title="Entrants" count={accepted.length} action={<AddPlayers sealedEvent={sealedEvent} token={token} />} />
        {entrants}
      </section>

      {rejected.length ? (
        <details className="group">
          <summary className="rubric flex cursor-pointer list-none items-baseline gap-2 border-b border-edge pb-2 hover:text-bone">
            Turned away <span className="readout text-faint">{rejected.length}</span>
            <span className="ml-auto text-xs font-normal tracking-normal normal-case group-open:hidden">Show</span>
            <span className="ml-auto hidden text-xs font-normal tracking-normal normal-case group-open:inline">Hide</span>
          </summary>
          <div className="mt-2">
            <EntrantList>
              {rejected.map((entry) =>
                row(
                  entry,
                  'Turned away',
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="pointer-coarse:h-11"
                      aria-label={`Let ${label(entry)} in`}
                      disabled={moderate.isPending}
                      onClick={() => moderate.mutate({ userId: entry.userId, status: 'accepted' })}
                    >
                      <UserPlus /> Let in
                    </Button>
                    {moderateError(entry)}
                  </>,
                ),
              )}
            </EntrantList>
          </div>
        </details>
      ) : null}

      <ConfirmDialog
        open={removing !== null}
        {...(removing?.status === 'pending'
          ? {
              title: `Turn away ${label(removing)}?`,
              description: `They won’t be in this ${sealedEventNoun(sealedEvent).noun}. They can ask again.`,
              cancel: 'Keep request',
              confirm: 'Turn away',
              pendingLabel: 'Turning away…',
              destructive: true,
            }
          : {
              title: `Remove ${removing ? label(removing) : ''}?`,
              description: (() => {
                const teammate = removing?.teamId
                  ? accepted.find((entry) => entry.teamId === removing.teamId && entry.userId !== removing.userId)
                  : undefined
                return teammate && removing
                  ? `This also unpairs ${label(teammate)} and clears both their sealed rosters. ${label(removing)} has to join again and seal another roster to come back.`
                  : 'Their sealed roster goes with them. They have to join again and seal another to come back.'
              })(),
              cancel: 'Keep entrant',
              confirm: 'Remove entrant',
              pendingLabel: 'Removing…',
            })}
        pending={moderate.isPending}
        error={moderate.error}
        onClose={() => {
          moderate.reset()
          setRemoving(null)
        }}
        onConfirm={() => removing && moderate.mutate({ userId: removing.userId, status: 'rejected' })}
      >
        {moderate.isPending ? (
          <output className="sr-only">{removing?.status === 'pending' ? 'Turning away…' : 'Removing entrant…'}</output>
        ) : null}
      </ConfirmDialog>
      <ConfirmDialog
        open={reassigning !== null}
        title={`Change ${reassigning ? label(reassigning.entry) : ''}’s roster size?`}
        description="Their sealed roster is cleared. They have to seal one at the new size before you can reveal."
        cancel="Keep current size"
        confirm="Change size"
        pendingLabel="Changing…"
        pending={assign.isPending}
        error={assign.error}
        onClose={() => setReassigning(null)}
        onConfirm={() => reassigning && assign.mutate({ userId: reassigning.entry.userId, requiredLimit: reassigning.requiredLimit })}
      >
        {assign.isPending ? <output className="sr-only">Changing roster size…</output> : null}
      </ConfirmDialog>
      <ConfirmDialog
        open={clearing !== null}
        title="Clear sealed doubles rosters?"
        description={
          <>
            This clears the sealed {clearing?.sealed.length === 1 ? 'list' : 'lists'} for{' '}
            {clearing ? formatList(clearing.sealed.map(label)) : ''}. They have to seal another before you can reveal.
          </>
        }
        cancel="Keep current teams"
        confirm="Change team and clear rosters"
        pendingLabel="Clearing…"
        pending={assignTeam.isPending}
        error={assignTeam.error}
        onClose={() => {
          assignTeam.reset()
          setClearing(null)
        }}
        onConfirm={() => clearing && assignTeam.mutate(clearing.userIds)}
      >
        {assignTeam.isPending ? <output className="sr-only">Changing doubles team…</output> : null}
      </ConfirmDialog>
    </>
  )
}

function SizeToggle({
  label,
  side,
  pending,
  onAssign,
}: {
  label: string
  side: 'solo' | 'allied' | null
  pending: boolean
  onAssign: (side: 'solo' | 'allied') => void
}) {
  return (
    <fieldset className="inline-flex border border-edge-strong">
      <legend className="sr-only">Size for {label}</legend>
      {(['solo', 'allied'] as const).map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={side === option}
          aria-label={`Assign ${label} ${option === 'solo' ? 'a solo' : 'an allied'} roster`}
          disabled={pending}
          className={`h-8 min-w-16 px-3 text-xs font-semibold tracking-label uppercase disabled:cursor-wait disabled:opacity-60 pointer-coarse:h-11 ${side === option ? 'bg-parchment text-parchment-ink' : 'text-dim hover:bg-raised hover:text-bone'}`}
          onClick={() => onAssign(option)}
        >
          {option}
        </button>
      ))}
    </fieldset>
  )
}

export function InvitePanel({ sealedEvent }: { sealedEvent: SealedEvent }) {
  const origin = useOrigin()
  const invite = useInviteShare(eventPath(sealedEvent), eventFullName(sealedEvent), 'sealed_event_invite_shared')
  const shareLabel = shareButtonLabel(invite.feedback, useNativeShare(), 'invite')
  return (
    <section className="border border-edge bg-panel p-4">
      <SectionHeading title="Invite players" className="mb-0" />
      <p className="mt-1 text-xs text-dim">
        {sealedEvent.group
          ? 'Members also find it on the group page.'
          : sealedEvent.tournament?.visibility === 'private'
            ? 'Unlisted, so this link is the way in.'
            : 'Also listed on the tournaments page.'}
      </p>
      <button
        type="button"
        aria-label={shareLabel}
        disabled={!origin}
        className="group mt-3 block w-full border border-edge-strong bg-sunken text-left hover:border-info disabled:opacity-60"
        onClick={() => void invite.share()}
      >
        <span className="flex items-center gap-2.5 px-3 py-2.5">
          <Link2 className="size-4 shrink-0 text-info" aria-hidden />
          <span className="min-w-0">
            <span className="block truncate text-xs text-dim">
              {origin ? `${origin.replace(/^https?:\/\//, '')}${eventPath(sealedEvent).slice(0, -sealedEvent.token.length)}` : '\u00a0'}
            </span>
            <span className="block truncate text-sm font-semibold text-bone">{sealedEvent.token}</span>
          </span>
        </span>
        <span
          aria-hidden
          className={`flex items-center justify-center gap-1.5 border-t border-edge-strong px-3 py-2 text-xs font-semibold tracking-label uppercase group-hover:bg-raised pointer-coarse:min-h-11 ${invite.feedback === 'copied' || invite.feedback === 'shared' ? 'text-achieved' : 'text-parchment'}`}
        >
          {invite.feedback === 'copied' || invite.feedback === 'shared' ? <Check className="size-3.5" /> : <Share2 className="size-3.5" />}
          {shareLabel}
        </span>
      </button>
      <p aria-live="polite" className={`mt-2 text-xs ${invite.feedback === 'error' ? 'text-destructive' : 'sr-only'}`}>
        {invite.feedback ? inviteFeedbackText(invite.feedback) : ''}
      </p>
    </section>
  )
}

/**
 * Enters players in the open event directly, the way a battle seats friends, within whatever places are left: a
 * tournament's organizer adds their friends, a group game's organizers the group's members.
 */
function AddPlayers({ sealedEvent, token }: { sealedEvent: SealedEvent; token: string }) {
  const refresh = useSealedEventRefresh(token)
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  const group = sealedEvent.group
  const { data: friendships } = useQuery({ ...friendshipsQuery(), enabled: open && !group })
  const { data: groupRecord } = useQuery({ ...groupQuery(group?.token ?? ''), enabled: open && Boolean(group) })
  const people = group
    ? groupRecord?.members
        .filter((member) => member.status === 'accepted')
        .map((member) => ({ id: member.userId, name: member.name, image: member.image }))
    : friendships?.friends
  const accepted = new Set(sealedEvent.entries.filter((entry) => entry.status === 'accepted').map((entry) => entry.userId))
  const candidates = (people ?? []).filter((person) => !accepted.has(person.id))
  const { playerLimit } = entryRules(sealedEvent)
  const places = playerLimit === null ? null : Math.max(0, playerLimit - accepted.size)
  const title = group ? 'Add members' : 'Add friends'
  const add = useMutation({
    mutationFn: () => addSealedEventEntrants({ data: { token, eventToken: sealedEvent.eventToken, userIds: picked } }),
    onSuccess: async () => {
      setOpen(false)
      setPicked([])
      await refresh()
    },
  })
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="pointer-coarse:h-11"
        onClick={() => {
          add.reset()
          setPicked([])
          setOpen(true)
        }}
      >
        <UserPlus /> {title}
      </Button>
      <Dialog open={open} onOpenChange={(next) => !add.isPending && setOpen(next)}>
        <DialogContent showCloseButton={!add.isPending} aria-busy={add.isPending}>
          <DialogHeader>
            <DialogTitle className="text-2xl">{title}</DialogTitle>
            <DialogDescription>
              They are entered straight away, without asking to join.
              {places === null ? '' : ` ${countLabel(places, 'place')} left.`}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {!people ? (
              <ul aria-label={group ? 'Loading members' : 'Loading friends'} className="divide-y divide-edge border border-edge bg-panel">
                {Array.from({ length: 3 }, (_, index) => (
                  <li key={index} className="flex items-center gap-3 p-3" aria-hidden>
                    <Skeleton className="size-5" />
                    <Skeleton className="size-8 rounded-full" />
                    <Skeleton className="h-4 w-32" />
                  </li>
                ))}
              </ul>
            ) : !candidates.length ? (
              <p className="text-sm text-dim">
                {group
                  ? 'Every member is already in.'
                  : people.length
                    ? 'Every friend is already in.'
                    : 'Add friends first, then enter them here.'}
              </p>
            ) : (
              <ul className="divide-y divide-edge border border-edge bg-panel">
                {candidates.map((person) => {
                  const checked = picked.includes(person.id)
                  return (
                    <li key={person.id}>
                      <label className="flex cursor-pointer items-center gap-3 p-3 pointer-coarse:min-h-11">
                        <input
                          type="checkbox"
                          className="size-5 accent-parchment"
                          checked={checked}
                          disabled={add.isPending || (!checked && places !== null && picked.length >= places)}
                          onChange={() => setPicked(withMember(picked, person.id))}
                        />
                        <PlayerAvatar name={person.name} image={person.image} className="size-8 text-3xs" />
                        <span className="min-w-0 truncate font-bold uppercase">{person.name}</span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            )}
            {add.error ? <Problem error={add.error} /> : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={add.isPending} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={add.isPending || !picked.length} onClick={() => add.mutate()}>
              {add.isPending ? 'Adding…' : picked.length ? `Add ${countLabel(picked.length, 'player')}` : 'Add players'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
