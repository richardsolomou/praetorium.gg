import { useEffect, useState } from 'react'
import { Swords } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { alliedLeagueRosterLimit } from '../../../core/league'
import { TABLE_SHAPE_LABELS, type TableShape } from '../../../core/tableShape'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import { SearchableSelect } from '../../components/SearchableSelect'
import { SeatMatchup, SeatRows, seatLabel, seatOption } from '../../components/Seats'
import { disambiguatedPlayerLabels } from '../../playerLabels'
import { errorMessage } from '../../queryClient'
import { seatedPlayers, seatsFor, type Seat } from '../../seats'

/** One name for the button that starts a shape's battle and the dialog it opens. */
export function startBattleLabel(format: TableShape) {
  return `Start ${TABLE_SHAPE_LABELS[format].count} battle`
}

export function OneOnOneBattleChooser({
  open,
  ownUserId,
  entries,
  pending,
  error,
  onIntentChange,
  onClose,
  onStart,
}: {
  open: boolean
  ownUserId: string
  entries: { userId: string; name: string; image: string | null }[]
  pending: boolean
  error: Error | null
  onIntentChange: () => void
  onClose: () => void
  onStart: (opponentId: string) => void
}) {
  const [opponentId, setOpponentId] = useState<string | null>(null)
  useEffect(() => {
    if (!open) setOpponentId(null)
  }, [open])
  const labels = disambiguatedPlayerLabels(entries.map((entry) => ({ id: entry.userId, name: entry.name })))
  const options = entries
    .filter((entry) => entry.userId !== ownUserId)
    .map((entry) => ({
      label: labels.get(entry.userId) ?? entry.name,
      value: entry.userId,
      icon: <PlayerAvatar name={entry.name} image={entry.image} className="size-6 text-[0.65rem]" />,
    }))
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && !next && onClose()}>
      <DialogContent className="rounded-none border border-edge bg-panel text-bone sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl uppercase">{startBattleLabel('1v1')}</DialogTitle>
          <DialogDescription className="text-dim">Pick who you are playing. Both sealed lists are added for you.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="league-opponent">Opponent</Label>
          <SearchableSelect
            id="league-opponent"
            groups={[{ label: '', items: options }]}
            value={opponentId ?? ''}
            onValueChange={(id) => {
              onIntentChange()
              setOpponentId(id)
            }}
            placeholder="Choose an opponent"
            searchPlaceholder="Search entrants…"
            className="h-11 rounded-none border-edge bg-sunken"
          />
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage(error)}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!opponentId || pending} onClick={() => opponentId && onStart(opponentId)}>
            <Swords /> {pending ? 'Starting…' : 'Start battle'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function LeagueBattleChooser({
  open,
  ownUserId,
  ownRequiredLimit,
  rosterLimit,
  entries,
  pending,
  error,
  onIntentChange,
  onClose,
  onStart,
}: {
  open: boolean
  ownUserId: string
  ownRequiredLimit: number | null
  rosterLimit: number
  entries: { userId: string; name: string; image: string | null; requiredLimit: number | null }[]
  pending: boolean
  error: Error | null
  onIntentChange: () => void
  onClose: () => void
  onStart: (players: { opponentId: string; allyId?: string; secondOpponentId?: string }) => void
}) {
  const [theirIds, setTheirIds] = useState<(string | null)[]>([null, null])
  const [allyId, setAllyId] = useState<string | null>(null)
  useEffect(() => {
    if (!open) {
      setTheirIds([null, null])
      setAllyId(null)
    }
  }, [open])
  const alliedLimit = alliedLeagueRosterLimit(rosterLimit)
  // The organizer's roster assignment already says which side of the table this entrant is on.
  const isSolo = ownRequiredLimit === rosterLimit
  const seats = seatsFor('2v1', isSolo ? 'solo' : 'pair')
  const seatedIn = (seat: Seat) => (seat.side === 'yours' ? allyId : (theirIds[seat.at] ?? null))
  const labels = disambiguatedPlayerLabels(entries.map((entry) => ({ id: entry.userId, name: entry.name })))
  const candidates = entries.map((entry) => ({
    id: entry.userId,
    name: entry.name,
    image: entry.image,
    requiredLimit: entry.requiredLimit,
  }))
  // An ally seat is filled by an entrant assigned the allied size; the solo seat of a
  // pair's opponent by one assigned the full size. A seat nobody can fill offers nobody.
  const groupsFor = (seat: Seat, taken: ReadonlySet<string | null>) => {
    const wantsSolo = seat.side === 'theirs' && !isSolo
    const label = wantsSolo ? 'Solo entrants' : 'Allied entrants'
    const items = candidates
      .filter((entry) => entry.id !== ownUserId && !taken.has(entry.id))
      .filter((entry) => entry.requiredLimit === (wantsSolo ? rosterLimit : alliedLimit))
      .map((entry) => seatOption(entry, labels))
    return items.length ? [{ label, items }] : []
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && !next && onClose()}>
      <DialogContent
        aria-busy={pending}
        className="max-h-[85dvh] overflow-y-auto rounded-none border border-edge bg-panel text-bone sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle className="text-2xl uppercase">{startBattleLabel('2v1')}</DialogTitle>
          <DialogDescription className="text-dim">
            {isSolo ? 'Pick the two allied entrants you are facing.' : 'Pick your teammate and the solo entrant you are facing.'}
          </DialogDescription>
        </DialogHeader>
        <SeatRows
          idPrefix="league-battle"
          seats={seats}
          seatedIn={seatedIn}
          groupsFor={groupsFor}
          onPick={(seat, id) => {
            onIntentChange()
            if (seat.side === 'yours') return setAllyId(id)
            setTheirIds((current) => current.map((held, at) => (at === seat.at ? id : held)))
          }}
        />
        <SeatMatchup seats={seats} labelFor={(seat) => seatLabel(seatedIn(seat), labels, candidates)} />
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage(error)}
          </p>
        ) : null}
        {pending ? <output className="sr-only">Starting battle…</output> : null}
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!seats.every(seatedIn) || pending}
            onClick={() => {
              const players = seatedPlayers(seats, seatedIn)
              const [opponentId, secondOpponentId] = players.opponentIds
              if (!opponentId) return
              onStart(players.allyId ? { opponentId, allyId: players.allyId } : { opponentId, secondOpponentId })
            }}
          >
            <Swords /> {pending ? 'Starting…' : 'Start battle'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function LeagueTeamChooser({
  open,
  entrant,
  entrantName,
  entries,
  projection,
  pending,
  error,
  onIntentChange,
  onClose,
  onAssign,
}: {
  open: boolean
  entrant: DoublesEntrant
  entrantName: string
  entries: DoublesEntrant[]
  projection: DoublesTeamProjection
  pending: boolean
  error: Error | null
  onIntentChange: () => void
  onClose: () => void
  onAssign: (userIds: string[]) => void
}) {
  const [teammateId, setTeammateId] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<{ userIds: string[]; sealedNames: string[] } | null>(null)
  const labels = disambiguatedPlayerLabels(entries.map((entry) => ({ id: entry.userId, name: entry.name })))
  const candidates = entries.filter((entry) => entry.userId !== entrant.userId)
  const currentTeam = entrant.teamId ? projection.teams.find((team) => team.id === entrant.teamId) : undefined
  const currentTeammate = currentTeam?.entries.find((entry) => entry.userId !== entrant.userId)
  const requestAssignment = (userIds: string[]) => {
    const selected = entries.filter((entry) => userIds.includes(entry.userId))
    const existingTeamIds = new Set(selected.flatMap((entry) => (entry.teamId ? [entry.teamId] : [])))
    const affected = entries.filter((entry) => userIds.includes(entry.userId) || (entry.teamId && existingTeamIds.has(entry.teamId)))
    const unchanged =
      userIds.length === 2 && entrant.teamId !== null && selected.length === 2 && selected.every((entry) => entry.teamId === entrant.teamId)
    const sealedNames = unchanged ? [] : affected.filter((entry) => entry.submitted).map((entry) => labels.get(entry.userId) ?? entry.name)
    if (sealedNames.length) {
      setConfirmation({ userIds, sealedNames })
      return
    }
    onIntentChange()
    onAssign(userIds)
  }
  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !pending && !next && onClose()}>
        <DialogContent
          aria-busy={pending}
          className="max-h-[85dvh] overflow-y-auto rounded-none border border-edge bg-panel text-bone sm:max-w-lg"
        >
          <DialogHeader>
            <DialogTitle className="text-2xl uppercase">Assign {entrantName}’s team</DialogTitle>
            <DialogDescription className="text-dim">
              {currentTeam && currentTeammate
                ? `Currently paired with ${labels.get(currentTeammate.userId) ?? currentTeammate.name}. `
                : ''}
              Pick one teammate. Changing a pair clears the sealed lists of everyone it touches.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="league-team-teammate">Teammate</Label>
            <SearchableSelect
              id="league-team-teammate"
              ariaLabel={`Teammate for ${entrantName}`}
              groups={[
                {
                  label: '',
                  items: candidates.map((entry) => ({
                    label: `${labels.get(entry.userId) ?? entry.name}${
                      entry.teamId
                        ? ` · paired with ${
                            labels.get(
                              projection.members.get(entry.teamId)?.find((member) => member.userId !== entry.userId)?.userId ?? '',
                            ) ?? 'teammate'
                          }`
                        : ''
                    }`,
                    value: entry.userId,
                    icon: <PlayerAvatar name={entry.name} image={entry.image} className="size-6 text-[0.65rem]" />,
                  })),
                },
              ]}
              value={teammateId ?? ''}
              onValueChange={(id) => {
                onIntentChange()
                setTeammateId(id)
              }}
              placeholder="Choose a teammate"
              searchPlaceholder="Search entrants…"
              className="h-11 rounded-none border-edge bg-sunken"
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {errorMessage(error)}
            </p>
          ) : null}
          {pending ? <output className="sr-only">Changing doubles team…</output> : null}
          <DialogFooter>
            {entrant.teamId ? (
              <Button variant="destructive" disabled={pending} onClick={() => requestAssignment([entrant.userId])}>
                Unpair team
              </Button>
            ) : null}
            <Button variant="outline" disabled={pending} onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={!teammateId || pending} onClick={() => teammateId && requestAssignment([entrant.userId, teammateId])}>
              {pending ? 'Assigning…' : 'Assign team'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={confirmation !== null}
        onOpenChange={(next) => {
          if (!pending && !next) {
            onIntentChange()
            setConfirmation(null)
          }
        }}
      >
        <AlertDialogContent aria-busy={pending} className="rounded-none border border-edge bg-panel text-bone">
          <AlertDialogHeader>
            <AlertDialogTitle className="uppercase">Clear sealed doubles rosters?</AlertDialogTitle>
            <AlertDialogDescription className="text-dim">
              This clears the sealed {confirmation?.sealedNames.length === 1 ? 'list' : 'lists'} for{' '}
              {confirmation ? formatNames(confirmation.sealedNames) : ''}. They have to seal another before you can reveal.
            </AlertDialogDescription>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {errorMessage(error)}
              </p>
            ) : null}
            {pending ? <output className="sr-only">Changing doubles team…</output> : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Keep current teams</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={() => {
                if (!confirmation) return
                onIntentChange()
                onAssign(confirmation.userIds)
              }}
            >
              {pending ? 'Clearing…' : 'Change team and clear rosters'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export function DoublesBattleChooser({
  open,
  ownUserId,
  entries,
  projection,
  pending,
  error,
  onIntentChange,
  onClose,
  onStart,
}: {
  open: boolean
  ownUserId: string
  entries: DoublesEntrant[]
  projection: DoublesTeamProjection
  pending: boolean
  error: Error | null
  onIntentChange: () => void
  onClose: () => void
  onStart: (opponentId: string) => void
}) {
  const [opponentId, setOpponentId] = useState<string | null>(null)
  useEffect(() => {
    if (!open) setOpponentId(null)
  }, [open])
  const ownTeamId = entries.find((entry) => entry.userId === ownUserId)?.teamId
  const labels = disambiguatedPlayerLabels(entries.map((entry) => ({ id: entry.userId, name: entry.name })))
  const options = projection.teams
    .filter((team) => team.id !== ownTeamId && team.entries.length === 2 && team.entries.every((entry) => entry.submitted))
    .map((team) => ({
      label: team.entries.map((entry) => labels.get(entry.userId) ?? entry.name).join(' & '),
      value: team.entries[0]!.userId,
      icon: (
        <span className="flex shrink-0 -space-x-2">
          {team.entries.map((entry) => (
            <PlayerAvatar
              key={entry.userId}
              name={entry.name}
              image={entry.image}
              className="size-6 border-2 border-panel text-[0.65rem]"
            />
          ))}
        </span>
      ),
    }))
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && !next && onClose()}>
      <DialogContent
        aria-busy={pending}
        className="max-h-[85dvh] overflow-x-hidden overflow-y-auto rounded-none border border-edge bg-panel text-bone sm:max-w-lg [&>*]:min-w-0"
      >
        <DialogHeader>
          <DialogTitle className="text-2xl uppercase">{startBattleLabel('2v2')}</DialogTitle>
          <DialogDescription className="text-dim">
            Pick the team you are playing. Your teammate and all four sealed lists are added for you.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="league-doubles-opponents">Opposing team</Label>
          <SearchableSelect
            id="league-doubles-opponents"
            groups={[{ label: '', items: options }]}
            value={opponentId ?? ''}
            onValueChange={(id) => {
              onIntentChange()
              setOpponentId(id)
            }}
            placeholder="Choose an opposing team"
            searchPlaceholder="Search teams or entrants…"
            className="h-11 rounded-none border-edge bg-sunken"
          />
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage(error)}
          </p>
        ) : null}
        {pending ? <output className="sr-only">Starting doubles battle…</output> : null}
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!opponentId || pending} onClick={() => opponentId && onStart(opponentId)}>
            <Swords /> {pending ? 'Starting…' : 'Start battle'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export type DoublesEntrant = {
  userId: string
  name: string
  image: string | null
  teamId: string | null
  submitted: boolean
}

export type DoublesTeamProjection = {
  members: Map<string, DoublesEntrant[]>
  teams: { id: string; entries: DoublesEntrant[] }[]
}

export function projectDoublesTeams(entries: DoublesEntrant[]): DoublesTeamProjection {
  const members = new Map<string, DoublesEntrant[]>()
  for (const entry of entries) {
    if (entry.teamId) members.set(entry.teamId, [...(members.get(entry.teamId) ?? []), entry])
  }
  return {
    members,
    teams: [...members].map(([id, teamEntries]) => ({ id, entries: teamEntries })),
  }
}

export function formatNames(names: string[]) {
  if (names.length < 2) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

export function entryStatus(status: 'pending' | 'accepted' | 'rejected', submitted: boolean, revealed: boolean) {
  if (status === 'pending') return 'Waiting for approval'
  if (status === 'rejected') return 'Not accepted'
  if (revealed) return submitted ? 'List revealed' : 'No list'
  return submitted ? 'List sealed' : 'Accepted · no list yet'
}

export function missingRosterMessage(count: number) {
  return `Waiting on ${count} list${count === 1 ? '' : 's'}.`
}
