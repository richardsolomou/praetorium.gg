import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Calculator, Check, ChevronRight, EllipsisVertical, Eye, FileLock2, LogOut, Pencil, Swords, Trash2, UserPlus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { LeagueSide } from '../../../contracts/schemas'
import {
  isTeamFormat,
  leagueEntryPoints,
  leagueRevealChecklist,
  leagueSharesPoints,
  leagueSealingClosed,
  requiredLeagueRosterLimit,
} from '../../../core/league'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import { Problem } from '../../components/Problem'
import { chooseLeagueSide, createLeagueBattle, deleteLeague, revealLeague, submitLeagueRoster } from '../../functions'
import { battlesFrom, leagueBattlesQuery, leagueQuery } from '../../queries'
import { useDateFormatting, useMoment } from '../../dates'
import { countLabel } from '../../text'
import { useNow } from '../../useNow'
import { IconAction, ViewRosterButton } from '../leagues/LeagueEntrants'
import { LeagueCombatDialog } from '../leagues/LeagueCombatDialog'
import { RosterChooser } from '../leagues/LeagueRosterChooser'
import { RemindEntrants } from '../leagues/LeagueReadiness'
import { LeagueSettingsDialog } from '../leagues/LeagueSettingsDialog'
import { TeamDispositionPanel } from '../leagues/LeagueTeamDisposition'
import { TeamWarlordPanel } from '../leagues/LeagueTeamWarlord'
import { eventName, namesPhrase, useLeagueRefresh } from '../leagues/leagueEvent'
import { sideLost, viewerStage } from '../../battleStage'
import { summarySides } from '../../battleSummary'
import type { Battle } from '../battles/battle'
import { memberNameOf, useClubRefresh, type Club } from './club'
import { useStartBattle } from '../battles/useStartBattle'
import { warmLocalConstruction } from '../../offline/construction'
import { afterPaint } from '../../afterPaint'

type Game = Club['games'][number]
type Player = Game['players'][number]
type Side = { key: string; title: string; side: LeagueSide | null; places: number; players: Player[] }

/**
 * The sides of a team game: a solo seat against a pair, or two teams of two. Before the reveal every seat a player may
 * take shows, empty or not; a game carried over from a league names its pairs by id instead.
 */
function gameSides(game: Game): Side[] {
  const open = game.revealedAt === null
  const fixed = game.format === '2v1' ? ['pair'] : ['team-1', 'team-2']
  const teamIds = [...new Set([...(open ? fixed : []), ...game.players.flatMap((player) => (player.teamId ? [player.teamId] : []))])]
  const label = game.format === '2v1' ? 'Pair' : 'Team'
  const teams = teamIds.map((teamId, index) => ({
    key: teamId,
    title: game.format === '2v1' && teamIds.length === 1 ? label : `${label} ${index + 1}`,
    side: fixed.includes(teamId) ? (teamId as LeagueSide) : null,
    places: 2,
    players: game.players.filter((player) => player.teamId === teamId),
  }))
  if (game.format !== '2v1') return teams
  const solo = game.players.filter((player) => player.teamId === null && player.requiredLimit === game.rosterLimit)
  return [{ key: 'solo', title: 'Solo', side: 'solo', places: open ? 1 : solo.length, players: solo }, ...teams]
}

/**
 * A club's sealed game where the club plays it: who is in, sealing your own list, opening them together, then the
 * battles. A duel plays everyone else who sealed; a team game seats its players on sides and plays as one battle.
 */
export function ClubSealedGame({
  club,
  game,
  viewerId,
  highlighted = false,
  embedded = false,
}: {
  club: Club
  game: Game
  viewerId: string | null
  highlighted?: boolean
  /** A past game's row in a list, read for the battles it produced. */
  embedded?: boolean
}) {
  const { defaultMissionPackId, openBattle } = useStartBattle()
  // Sealing a roster and starting a battle price lists with the rules on this device, which take a moment to prepare.
  useEffect(() => warmLocalConstruction(), [])
  const moment = useMoment()
  const { date } = useDateFormatting()
  const now = useNow(game.sealBy)
  const refreshGame = useLeagueRefresh(game.token)
  const refreshClub = useClubRefresh(club.token)
  // Who sits where and who has sealed come with the club, the lists and team picks with the game.
  const refresh = () => Promise.all([refreshGame(), refreshClub()])
  const { data: record } = useQuery(leagueQuery(game.token))
  const battleHistory = useInfiniteQuery({ ...leagueBattlesQuery(game.token, game.token), enabled: game.revealedAt !== null })
  const battles = battlesFrom(battleHistory.data)
  const [choosing, setChoosing] = useState(false)
  const [revealing, setRevealing] = useState(false)
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [simulating, setSimulating] = useState<string | null>(null)
  // A side to move to, or null to step out, held while a sealed player confirms losing their list.
  const [moving, setMoving] = useState<LeagueSide | null | undefined>(undefined)

  const gameName = eventName({ ...game, tournament: null, club })
  const member = club.members.some((candidate) => candidate.userId === viewerId && candidate.status === 'accepted')
  const people = new Map(club.members.map((candidate) => [candidate.userId, candidate]))
  const nameOf = memberNameOf(club)
  const team = isTeamFormat(game.format)
  const revealed = game.revealedAt !== null
  const closed = !revealed && leagueSealingClosed(game, now)
  // Past the deadline only those who sealed in time are playing.
  const players = game.players.filter((player) => !closed || player.sealed)
  const own = players.find((player) => player.userId === viewerId)
  const ownEntry = record?.entries.find((entry) => entry.userId === viewerId)
  const sealed = players.filter((player) => player.sealed)
  const checks = record ? leagueRevealChecklist(record, record.entries, now) : []
  const ready =
    !revealed && (team ? checks.length > 0 && checks.every((check) => check.done) : sealed.length >= 2 && sealed.length === players.length)
  const havePlayed = playedIn(game)
  const hasPlayed = (userId: string) => havePlayed(viewerId ?? '', userId)
  const toPlay = unplayedOpponents(game, viewerId)
  const listName = (userId: string) => record?.entries.find((entry) => entry.userId === userId)?.rosterName ?? null
  const sides = team ? gameSides(game) : []
  const seatedIds = new Set(sides.flatMap((entry) => entry.players.map((player) => player.userId)))
  // In from before the game was a team game, or from a format change, without a seat yet.
  const picking = team ? players.filter((player) => !seatedIds.has(player.userId)) : []
  const ownLimit = team
    ? requiredLeagueRosterLimit(game.format, game.rosterLimit, ownEntry?.requiredLimit ?? null, ownEntry?.teamId ?? null) === null
      ? null
      : game.rosterLimit
    : game.rosterLimit
  const seatPoints = team && ownEntry ? leagueEntryPoints(game, ownEntry) : null

  const mayTakeSeat = member && !revealed && !closed

  const seal = useMutation({
    mutationFn: async (rosterId: string) => {
      await afterPaint()
      return submitLeagueRoster({ data: { token: game.token, rosterId } })
    },
    onSuccess: async () => {
      setChoosing(false)
      await refresh()
    },
  })
  const side = useMutation({
    mutationFn: (next: LeagueSide | null) => chooseLeagueSide({ data: { token: game.token, side: next } }),
    onSuccess: async () => {
      setMoving(undefined)
      await refresh()
    },
  })
  const reveal = useMutation({
    mutationFn: () => revealLeague({ data: { token: game.token } }),
    onSuccess: async () => {
      setRevealing(false)
      await refresh()
    },
  })
  const play = useMutation({
    mutationFn: async (opponentId: string) =>
      createLeagueBattle({ data: { token: game.token, opponentId, missionPackId: await defaultMissionPackId() } }),
    onSuccess: ({ token: battleToken }) => openBattle(battleToken),
  })
  const remove = useMutation({
    mutationFn: () => deleteLeague({ data: { token: game.token } }),
    onSuccess: async () => {
      setDeleting(false)
      await refresh()
    },
  })
  const move = (next: LeagueSide | null) => {
    side.reset()
    if (own?.sealed) setMoving(next)
    else side.mutate(next)
  }

  const when = !revealed && game.sealBy ? `Lists due ${moment(game.sealBy)}` : game.playsAt ? `Played ${moment(game.playsAt)}` : null
  const waiting = (step: 'lists' | 'dispositions' | 'warlords') => {
    const check = checks.find((candidate) => candidate.step === step)
    return check && 'waiting' in check && !check.done ? namesPhrase(check.waiting.map(nameOf)) : ''
  }
  const openSeats = sides.reduce((count, entry) => count + (entry.side ? Math.max(0, entry.places - entry.players.length) : 0), 0)
  const hint = closed
    ? 'The deadline has passed.'
    : ready
      ? 'Everyone has sealed. Reveal when you’re ready.'
      : !team
        ? 'Lists stay hidden until they’re revealed together.'
        : openSeats
          ? `${countLabel(openSeats, 'seat')} still open. Lists stay hidden until they’re revealed together.`
          : waiting('lists')
            ? `Waiting on ${waiting('lists')} to seal.`
            : waiting('dispositions')
              ? `Waiting on ${waiting('dispositions')} to choose a Force Disposition.`
              : waiting('warlords')
                ? `Waiting on ${waiting('warlords')} to choose a Warlord.`
                : 'Lists stay hidden until they’re revealed together.'

  const row = (player: Player) => {
    const person = people.get(player.userId)
    const name = nameOf(player.userId)
    const list = revealed || player.userId === viewerId ? listName(player.userId) : null
    return (
      <li key={player.userId} data-person={name} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2">
        <PlayerAvatar name={name} image={person?.image ?? null} className="size-8 text-2xs" />
        <span className="min-w-0 flex-1 basis-24">
          <span className="flex min-w-0 items-baseline gap-1.5">
            <span className="truncate text-sm leading-tight font-bold uppercase">{name}</span>
            {player.userId === viewerId ? <span className="eyebrow shrink-0 text-parchment">You</span> : null}
          </span>
          {list ? <span className="mt-0.5 block truncate text-xs text-dim uppercase">{list}</span> : null}
        </span>
        <span className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1">
          {revealed ? (
            <>
              {!embedded && !team && own?.sealed && player.userId !== viewerId && player.sealed ? (
                hasPlayed(player.userId) ? (
                  game.playing.includes(player.userId) && game.playing.includes(viewerId ?? '') ? (
                    <span className="chip shrink-0">Playing</span>
                  ) : (
                    <span className="chip shrink-0 text-achieved">Played</span>
                  )
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label={`Play ${name}`}
                    disabled={play.isPending}
                    onClick={() => play.mutate(player.userId)}
                  >
                    <Swords /> Play
                  </Button>
                )
              ) : null}
              {member && own?.sealed && player.sealed && player.userId !== viewerId ? (
                <IconAction
                  tooltip="Simulate"
                  trigger={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Simulate against ${name}`}
                      className="text-dim hover:text-info pointer-coarse:size-11"
                      onClick={() => setSimulating(player.userId)}
                    />
                  }
                >
                  <Calculator aria-hidden />
                </IconAction>
              ) : null}
              <ViewRosterButton token={game.token} eventToken={game.token} userId={player.userId} label={name} />
            </>
          ) : player.sealed ? (
            <span className="flex shrink-0 items-center gap-1 text-sm text-achieved">
              <Check className="size-4" aria-hidden /> Sealed
            </span>
          ) : (
            <span className="shrink-0 text-sm text-faint">Choosing</span>
          )}
        </span>
      </li>
    )
  }

  const canSeal = member && !closed && ownLimit !== null && (!team || own !== undefined)
  const canReveal = ready && (own?.sealed === true || club.organizer)
  const canLeave = team && own !== undefined && !closed
  const menu = club.organizer ? (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Sealed game options" />}>
        <EllipsisVertical />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {revealed || embedded ? null : (
          <DropdownMenuItem onClick={() => setEditing(true)}>
            <Pencil /> Edit
          </DropdownMenuItem>
        )}
        <DropdownMenuItem variant="destructive" onClick={() => (remove.reset(), setDeleting(true))}>
          <Trash2 /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null
  const lists = team ? (
    <div className="border-t border-edge">
      <div className={`grid grid-cols-1 gap-px bg-edge ${sides.length > 1 ? 'sm:grid-cols-2' : ''}`}>
        {sides.map((entry) => {
          const seated = entry.players.some((player) => player.userId === viewerId)
          return (
            <section key={entry.key} data-side={entry.title} aria-label={entry.title} className="min-w-0 bg-panel">
              <h4 className="eyebrow px-4 pt-3 pb-1 text-dim">{entry.title}</h4>
              <ul className="divide-y divide-edge">
                {entry.players.map(row)}
                {!revealed && entry.side
                  ? Array.from({ length: Math.max(0, entry.places - entry.players.length) }, (_, index) => (
                      <li key={`open-${index}`} className="flex min-w-0 items-center gap-3 px-4 py-1.5">
                        <span aria-hidden className="size-8 shrink-0 rounded-full border border-dashed border-edge-strong" />
                        <span className="min-w-0 flex-1 text-sm text-faint">Open seat</span>
                        {index === 0 && mayTakeSeat && !seated ? (
                          <Button
                            size="sm"
                            variant="outline"
                            aria-label={`Join ${entry.title}`}
                            disabled={side.isPending}
                            onClick={() => move(entry.side)}
                          >
                            <UserPlus /> Join
                          </Button>
                        ) : null}
                      </li>
                    ))
                  : null}
              </ul>
            </section>
          )
        })}
      </div>
      {picking.length ? (
        <p className="border-t border-edge px-4 py-2.5 text-sm text-dim">
          Picking a side: {namesPhrase(picking.map((player) => (player.userId === viewerId ? 'you' : nameOf(player.userId))))}
        </p>
      ) : null}
    </div>
  ) : (
    <ul className="divide-y divide-edge border-t border-edge">
      {players.map(row)}
      {!players.length ? <li className="px-4 py-2.5 text-sm text-dim">Nobody has sealed a list yet.</li> : null}
    </ul>
  )
  const gameBattles = battles.length ? (
    <div className={embedded ? '' : 'border-t border-edge'}>
      {embedded ? null : <p className="eyebrow px-4 pt-3 pb-1 text-dim">Battles</p>}
      <ul aria-label={`Battles of ${gameName}`} className="divide-y divide-edge">
        {battles.map((battle) => (
          <BattleResult key={battle.token} battle={battle} viewerId={viewerId} />
        ))}
      </ul>
    </div>
  ) : null

  return (
    <section
      id={`game-${game.token}`}
      data-sealed-game={game.token}
      aria-label={`Sealed game: ${gameName}`}
      className={embedded ? 'bg-panel' : `border bg-panel ${highlighted ? 'border-parchment' : 'border-edge'}`}
    >
      {embedded ? (
        <>
          <div className="flex min-w-0 items-center gap-3 border-b border-edge py-2 pr-2 pl-4">
            <span className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-baseline sm:gap-3">
              <span className="min-w-0 truncate font-semibold sm:flex-1">{gameName}</span>
              <span className="text-sm text-dim sm:shrink-0">
                {[
                  countLabel(sealed.length, 'player'),
                  countLabel(game.battles, 'battle'),
                  date(game.playsAt ?? game.revealedAt ?? game.createdAt),
                ].join(' · ')}
              </span>
            </span>
            {menu}
          </div>
          {gameBattles}
          {sealed.length ? (
            <div className="border-t border-edge">
              <p className="px-4 py-2 text-sm text-dim">Lists · {countLabel(sealed.length, 'player')}</p>
              <ul className="divide-y divide-edge border-t border-edge">{sealed.map(row)}</ul>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <div className="flex min-w-0 items-start gap-3 p-4 pb-3">
            <div className="min-w-0 flex-1">
              <p className="eyebrow text-discarded">Sealed game</p>
              <h3 className="mt-1 font-bold break-words uppercase">{gameName}</h3>
              {when ? <p className="mt-0.5 text-sm text-dim">{when}</p> : null}
            </div>
            {menu}
          </div>
          {lists}
          {revealed ? (
            team && toPlay.length ? (
              <div className="flex flex-wrap items-center gap-2 border-t border-edge p-4">
                <Button disabled={play.isPending} onClick={() => play.mutate(toPlay[0]!.userId)}>
                  <Swords /> Start battle
                </Button>
                <p className="min-w-0 flex-1 text-xs text-dim">Against {namesPhrase(toPlay.map((player) => nameOf(player.userId)))}.</p>
              </div>
            ) : null
          ) : (
            <div className="space-y-3 border-t border-edge p-4">
              {canSeal || canReveal || canLeave ? (
                <div className="flex flex-wrap items-center gap-2">
                  {canSeal ? (
                    <Button variant={own?.sealed ? 'outline' : 'default'} onClick={() => (seal.reset(), setChoosing(true))}>
                      <FileLock2 /> {own?.sealed ? 'Swap your list' : 'Seal your list'}
                    </Button>
                  ) : null}
                  {canReveal ? (
                    <Button variant="outline" onClick={() => (reveal.reset(), setRevealing(true))}>
                      <Eye /> Reveal lists
                    </Button>
                  ) : null}
                  {canLeave ? (
                    <Button variant="ghost" disabled={side.isPending} onClick={() => move(null)}>
                      <LogOut /> Leave
                    </Button>
                  ) : null}
                </div>
              ) : null}
              <p className="text-xs text-dim">{hint}</p>
              {club.organizer && record ? <RemindEntrants token={game.token} league={record} viewerId={viewerId} /> : null}
              {side.error && moving === undefined ? <Problem error={side.error} /> : null}
              {viewerId && ownEntry?.team && ownEntry.team.choices.length > 1 ? (
                <TeamDispositionPanel token={game.token} eventToken={game.token} team={ownEntry.team} />
              ) : null}
              {viewerId && ownEntry?.team && ownEntry.team.warlordChoices.length > 1 ? (
                <TeamWarlordPanel token={game.token} eventToken={game.token} viewerId={viewerId} team={ownEntry.team} nameOf={nameOf} />
              ) : null}
            </div>
          )}
          {gameBattles}
        </>
      )}
      {play.error ? <Problem error={play.error} className="px-4 pb-3" /> : null}

      {simulating && revealed && member && own?.sealed && viewerId ? (
        <LeagueCombatDialog
          token={game.token}
          eventToken={game.token}
          viewerId={viewerId}
          opponentId={simulating}
          entries={sealed.map((player) => ({
            userId: player.userId,
            label: nameOf(player.userId),
            owner: { name: nameOf(player.userId), image: people.get(player.userId)?.image },
          }))}
          teams={sides.flatMap((entry) =>
            entry.players.length > 1 && entry.players.every((player) => player.sealed)
              ? [
                  {
                    id: `team:${entry.key}`,
                    label: `${entry.title}: ${namesPhrase(entry.players.map((player) => nameOf(player.userId)))}`,
                    userIds: entry.players.map((player) => player.userId),
                  },
                ]
              : [],
          )}
          onClose={() => setSimulating(null)}
        />
      ) : null}

      <RosterChooser
        open={choosing}
        pending={seal.isPending}
        error={seal.error}
        failedRosterId={seal.variables ?? null}
        requiredLimit={team && seatPoints === null ? null : ownLimit}
        pointsBudget={game.pointsBudget}
        seatPoints={seatPoints}
        shared={ownEntry ? leagueSharesPoints(game, ownEntry) : false}
        onClose={() => !seal.isPending && setChoosing(false)}
        onChoose={(roster) => seal.mutate(roster.id)}
      />
      <ConfirmDialog
        open={moving !== undefined}
        title={moving === null ? 'Leave this game?' : 'Change sides?'}
        description={
          moving === null
            ? 'Your sealed list goes with you. You can join again until the lists are revealed.'
            : 'Your sealed list is unsealed, so you seal one for your new side.'
        }
        cancel="Stay"
        confirm={moving === null ? 'Leave' : 'Change sides'}
        pendingLabel={moving === null ? 'Leaving…' : 'Changing…'}
        pending={side.isPending}
        error={side.error}
        onClose={() => setMoving(undefined)}
        onConfirm={() => moving !== undefined && side.mutate(moving)}
      />
      <ConfirmDialog
        open={revealing}
        title="Reveal every list?"
        description={`The ${sealed.length} sealed lists open for everyone, and nobody else can seal one. You can’t undo this.`}
        cancel="Keep them sealed"
        confirm="Reveal lists"
        pendingLabel="Revealing…"
        pending={reveal.isPending}
        error={reveal.error}
        onClose={() => setRevealing(false)}
        onConfirm={() => reveal.mutate()}
      />
      <ConfirmDialog
        open={deleting}
        title="Delete this sealed game?"
        description="Its sealed lists go with it. Battles already played stay on the club leaderboard."
        cancel="Keep it"
        confirm="Delete"
        pendingLabel="Deleting…"
        destructive
        pending={remove.isPending}
        error={remove.error}
        onClose={() => setDeleting(false)}
        onConfirm={() => remove.mutate()}
      />
      {editing ? <LeagueSettingsDialog mode={{ kind: 'edit', token: game.token }} open={editing} onOpenChange={setEditing} /> : null}
    </section>
  )
}

/** One battle of a sealed game as a row, the names on a line of their own on a phone: how it stands, who met whom, and the score, opening the battle. */
function BattleResult({ battle, viewerId }: { battle: Battle; viewerId: string | null }) {
  const seat = viewerId ? battle.playerIds.indexOf(viewerId) : -1
  const sides = summarySides(battle)
  const stage = viewerStage(battle, viewerId)
  const label = sides.map((side) => side.players.join(' and ')).join(' versus ')
  return (
    <li>
      <Link
        to="/battles/$token"
        params={{ token: battle.token }}
        aria-label={`${seat === -1 ? 'Watch' : 'Open'} ${label}`}
        className="group flex min-h-12 min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2 hover:bg-raised"
      >
        <span data-battle-status={battle.status} className={`chip w-20 shrink-0 justify-center text-center max-sm:mr-auto ${stage.tint}`}>
          {stage.name}
        </span>
        <span className="min-w-0 flex-1 text-sm wrap-break-word max-sm:order-last max-sm:basis-full">
          {sides.map((side, at) => (
            <span key={side.index} className={`uppercase ${sideLost(battle, side.index) ? 'text-faint' : 'font-bold'}`}>
              {at ? <span className="px-1.5 font-normal text-faint normal-case">vs</span> : null}
              {side.seats.map(({ player }, index) => (
                <span key={player.id || player.name}>
                  {index ? <span className="font-normal text-faint"> &amp; </span> : null}
                  {player.name}
                  {player.id === viewerId ? <span className="eyebrow ml-1.5 text-parchment">You</span> : null}
                </span>
              ))}
            </span>
          ))}
        </span>
        {battle.status === 'setup' ? null : (
          <span className="figure shrink-0 text-base font-bold">
            {sides.map((side, at) => (
              <span key={side.index}>
                {at ? <span className="px-1 text-faint">–</span> : null}
                <span className={`${at ? 'text-side-b' : 'text-side-a'} ${sideLost(battle, side.index) ? 'opacity-50' : ''}`}>
                  {side.score}
                </span>
              </span>
            ))}
          </span>
        )}
        <ChevronRight aria-hidden className="size-4 shrink-0 text-faint group-hover:text-bone" />
      </Link>
    </li>
  )
}

/** Whether two players have already met in this game, in either order. */
function playedIn(game: Game) {
  const played = new Set(game.played.map((pair) => pair.join('|')))
  return (one: string, other: string) => played.has([one, other].toSorted().join('|'))
}

/**
 * Who the reader has sealed against and not yet played: everyone else in a duel, the other side in a team game. A
 * 2v1's solo player faces the paired players; two solo players or two pairs never meet.
 */
export function unplayedOpponents(game: Game, viewerId: string | null) {
  const own = game.players.find((player) => player.userId === viewerId && player.sealed)
  if (!own) return []
  const havePlayed = playedIn(game)
  return game.players.filter(
    (player) =>
      player.sealed &&
      player.userId !== own.userId &&
      (game.format === '2v1'
        ? (player.teamId === null) !== (own.teamId === null)
        : game.format === '2v2'
          ? player.teamId !== own.teamId
          : true) &&
      !havePlayed(own.userId, player.userId),
  )
}
