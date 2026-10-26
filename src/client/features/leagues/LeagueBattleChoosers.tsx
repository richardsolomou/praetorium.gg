import { useState } from 'react'
import { Label } from '@/components/ui/label'
import { alliedLeagueRosterLimit, type LeagueEntryStatus } from '../../../core/league'
import { TABLE_SHAPE_LABELS, type TableShape } from '../../../core/tableShape'
import { BattleChooserDialog } from '../../components/BattleChooserDialog'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import { SearchableSelect } from '../../components/SearchableSelect'
import { SeatMatchup, SeatRows, seatLabel, seatOption } from '../../components/Seats'
import { entrantLabels } from '../../playerLabels'
import { seatedPlayers, seatsFor, type Seat } from '../../seats'
import { doublesTeams } from './leagueEvent'

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
  // A closed chooser forgets its choice, so reopening it starts again.
  if (!open && opponentId !== null) setOpponentId(null)
  const labels = entrantLabels(entries)
  const options = entries
    .filter((entry) => entry.userId !== ownUserId)
    .map((entry) => ({
      label: labels.get(entry.userId) ?? entry.name,
      value: entry.userId,
      icon: <PlayerAvatar name={entry.name} image={entry.image} className="size-6 text-3xs" />,
    }))
  const chosen = opponentId ?? soleOption(options)
  return (
    <BattleChooserDialog
      open={open}
      title={startBattleLabel('1v1')}
      description="Pick who you are playing. Both sealed rosters are added for you."
      pending={pending}
      error={error}
      ready={Boolean(chosen)}
      onClose={onClose}
      onStart={() => chosen && onStart(chosen)}
    >
      <div className="space-y-1.5">
        <Label htmlFor="league-opponent">Opponent</Label>
        <SearchableSelect
          id="league-opponent"
          className="h-11"
          groups={[{ label: '', items: options }]}
          value={chosen ?? ''}
          onValueChange={(id) => {
            onIntentChange()
            setOpponentId(id)
          }}
          placeholder="Choose an opponent"
          searchPlaceholder="Search entrants…"
        />
      </div>
    </BattleChooserDialog>
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
  entries: { userId: string; name: string; image: string | null; requiredLimit: number | null; teamId: string | null }[]
  pending: boolean
  error: Error | null
  onIntentChange: () => void
  onClose: () => void
  onStart: (players: { opponentId: string; allyId?: string; secondOpponentId?: string }) => void
}) {
  const [theirIds, setTheirIds] = useState<(string | null)[]>([null, null])
  const [allyId, setAllyId] = useState<string | null>(null)
  if (!open && (theirIds.some((id) => id !== null) || allyId !== null)) {
    setTheirIds([null, null])
    setAllyId(null)
  }
  const alliedLimit = alliedLeagueRosterLimit(rosterLimit)
  // The organizer's roster assignment already says which side of the table this entrant is on.
  const isSolo = ownRequiredLimit === rosterLimit
  const seats = seatsFor('2v1', isSolo ? 'solo' : 'pair')
  // A fixed allied pair always plays together, so choosing one ally seats the other; older events paired nobody.
  const teammateOf = (userId: string) => {
    const teamId = entries.find((entry) => entry.userId === userId)?.teamId
    return teamId ? (entries.find((entry) => entry.teamId === teamId && entry.userId !== userId)?.userId ?? null) : null
  }
  const ownTeammate = teammateOf(ownUserId)
  const paired = entries.some((entry) => entry.teamId)
  const others = (limit: number) =>
    entries.filter((entry) => entry.userId !== ownUserId && entry.requiredLimit === limit).map((entry) => entry.userId)
  const allied = others(alliedLimit)
  const solos = others(rosterLimit)
  // When the sealed entrants allow only one table, it is seated for you.
  const onlyMatchup = isSolo
    ? allied.length === 2
      ? { theirIds: allied, allyId: null }
      : null
    : solos.length === 1 && (ownTeammate || allied.length === 1)
      ? { theirIds: [solos[0]!], allyId: ownTeammate ? null : allied[0]! }
      : null
  const seatedIn = (seat: Seat) =>
    seat.side === 'yours'
      ? (ownTeammate ?? allyId ?? onlyMatchup?.allyId ?? null)
      : (theirIds[seat.at] ?? onlyMatchup?.theirIds[seat.at] ?? null)
  const labels = entrantLabels(entries)
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
      .filter((entry) => seat.side !== 'yours' || !ownTeammate || entry.id === ownTeammate)
      .map((entry) => seatOption(entry, labels))
    return items.length ? [{ label, items }] : []
  }

  return (
    <BattleChooserDialog
      open={open}
      title={startBattleLabel('2v1')}
      description={
        isSolo
          ? paired
            ? 'Pick the allied pair you are facing.'
            : 'Pick the two allied entrants you are facing.'
          : ownTeammate
            ? 'Pick the solo entrant you and your ally are facing.'
            : 'Pick your teammate and the solo entrant you are facing.'
      }
      pending={pending}
      error={error}
      ready={seats.every(seatedIn)}
      onClose={onClose}
      onStart={() => {
        const players = seatedPlayers(seats, seatedIn)
        const [opponentId, secondOpponentId] = players.opponentIds
        if (!opponentId) return
        onStart(players.allyId ? { opponentId, allyId: players.allyId } : { opponentId, secondOpponentId })
      }}
    >
      <SeatRows
        idPrefix="league-battle"
        seats={seats}
        seatedIn={seatedIn}
        groupsFor={groupsFor}
        onPick={(seat, id) => {
          onIntentChange()
          if (seat.side === 'yours') return setAllyId(id)
          const partner = id ? teammateOf(id) : null
          setTheirIds((current) => current.map((held, at) => (at === seat.at ? id : partner && isSolo ? partner : held)))
        }}
      />
      <SeatMatchup seats={seats} labelFor={(seat) => seatLabel(seatedIn(seat), labels, candidates)} />
    </BattleChooserDialog>
  )
}

export function DoublesBattleChooser({
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
  entries: DoublesEntrant[]
  pending: boolean
  error: Error | null
  onIntentChange: () => void
  onClose: () => void
  onStart: (opponentId: string) => void
}) {
  const [opponentId, setOpponentId] = useState<string | null>(null)
  // A closed chooser forgets its choice, so reopening it starts again.
  if (!open && opponentId !== null) setOpponentId(null)
  const ownTeamId = entries.find((entry) => entry.userId === ownUserId)?.teamId
  const labels = entrantLabels(entries)
  const options = doublesTeams(entries)
    .filter((team) => team.id !== ownTeamId && team.members.length === 2 && team.members.every((entry) => entry.submitted))
    .map((team) => ({
      label: team.members.map((entry) => labels.get(entry.userId) ?? entry.name).join(' & '),
      value: team.members[0]!.userId,
      icon: (
        <span className="flex shrink-0 -space-x-2">
          {team.members.map((entry) => (
            <PlayerAvatar key={entry.userId} name={entry.name} image={entry.image} className="size-6 border-2 border-panel text-3xs" />
          ))}
        </span>
      ),
    }))
  const chosen = opponentId ?? soleOption(options)
  return (
    <BattleChooserDialog
      open={open}
      title={startBattleLabel('2v2')}
      description="Pick the team you are playing. Your teammate and all four sealed rosters are added for you."
      pending={pending}
      error={error}
      ready={Boolean(chosen)}
      onClose={onClose}
      onStart={() => chosen && onStart(chosen)}
    >
      <div className="space-y-1.5">
        <Label htmlFor="league-doubles-opponents">Opposing team</Label>
        <SearchableSelect
          id="league-doubles-opponents"
          className="h-11"
          groups={[{ label: '', items: options }]}
          value={chosen ?? ''}
          onValueChange={(id) => {
            onIntentChange()
            setOpponentId(id)
          }}
          placeholder="Choose an opposing team"
          searchPlaceholder="Search teams or entrants…"
        />
      </div>
    </BattleChooserDialog>
  )
}

/** The only option a picker offers, so a table with one possible opponent is ready to start. */
function soleOption(options: { value: string }[]) {
  return options.length === 1 ? options[0]!.value : null
}

type DoublesEntrant = {
  userId: string
  name: string
  image: string | null
  status: LeagueEntryStatus
  teamId: string | null
  submitted: boolean
}
