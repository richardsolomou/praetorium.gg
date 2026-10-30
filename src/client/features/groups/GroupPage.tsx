import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  ArrowRight,
  Check,
  Clipboard,
  EllipsisVertical,
  FileLock2,
  LogOut,
  Pencil,
  Play,
  Plus,
  Share2,
  Swords,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Switch } from '@/components/ui/switch'
import { TABLE_SHAPES, TABLE_SHAPE_LABELS, type TableShape } from '../../../core/tableShape'
import { seatedPlayers, seatsFor, type Seat, type SoloPairRole } from '../../seats'
import { Choice } from '../../components/Choice'
import { SeatRows, seatOption } from '../../components/Seats'
import { disambiguatedPlayerLabels } from '../../playerLabels'
import { buttonClass } from '../../components/buttonClass'
import { BattleChooserDialog } from '../../components/BattleChooserDialog'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { PageContent, PageHeader } from '../../components/Page'
import { PageTabsList } from '../../components/PageTabs'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import { Problem } from '../../components/Problem'
import { deleteGroup, joinGroup, leaveGroup, moderateGroupMember, removeGroupMember } from '../../functions'
import { groupQuery, groupLeagueQuery, groupStandingsQuery, meQuery, type QueryData } from '../../queries'
import { useDateFormatting, useMoment } from '../../dates'
import { BattleShelf } from '../battles/BattleShelf'
import type { Battle } from '../battles/battle'
import { useNativeShare } from '../../nativeBridge'
import { shareButtonLabel } from '../../useShareLink'
import { Standings } from '../leaderboard/Standings'
import { inviteFeedbackText, useInviteShare } from '../sealedEvents/SealedEventActions'
import { SectionHeading } from '../../components/SectionHeading'
import { accessSummary, OrganizerLinks, VisibilityIcon } from '../sealedEvents/EventAccess'
import { SealedEventSettingsDialog } from '../sealedEvents/SealedEventSettingsDialog'
import { eventName, namesPhrase } from '../sealedEvents/sealedEvent'
import { memberNameOf, useGroupRefresh, usePlayGroupGame, type Group, type GroupTab } from './group'
import { GroupSettingsDialog } from './GroupSettingsDialog'
import { GroupHiddenListGame, unplayedOpponents } from './GroupHiddenListGame'
import { GroupLeague } from './GroupLeague'
import { hiddenListGameOpen } from '../../../core/group'
import { leagueFixtureOverdue } from '../../../core/groupLeague'
import { sealedEventSealingClosed } from '../../../core/sealedEvent'
import { useNow } from '../../useNow'
import { countLabel } from '../../text'

type Member = Group['members'][number]
type GroupTable = NonNullable<QueryData<typeof groupStandingsQuery>>
type League = NonNullable<QueryData<typeof groupLeagueQuery>>
type Game = Group['games'][number]

export function GroupPage({ token, game, tab }: { token: string; game?: string; tab?: GroupTab }) {
  const navigate = useNavigate()
  const { data: me } = useQuery(meQuery())
  const { data: group } = useQuery(groupQuery(token))
  useEffect(() => {
    if (group === null) void navigate({ to: '/groups' })
  }, [group, navigate])
  if (!group) return null
  return <GroupScreen group={group} viewerId={me?.id ?? null} highlight={game} tab={tab} />
}

function GroupScreen({
  group,
  viewerId,
  highlight,
  tab,
}: {
  group: Group
  viewerId: string | null
  highlight: string | undefined
  tab: GroupTab | undefined
}) {
  const navigate = useNavigate()
  const refresh = useGroupRefresh(group.token)
  const { data: table } = useQuery(groupStandingsQuery(group.token))
  const { data: league } = useQuery(groupLeagueQuery(group.token))
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const isOwner = viewerId === group.ownerId
  const own = group.members.find((member) => member.userId === viewerId) ?? null
  const member = own?.status === 'accepted'
  const accepted = group.members.filter((candidate) => candidate.status === 'accepted')
  const admins = accepted.filter((candidate) => candidate.role === 'admin')
  const invite = useInviteShare(`/groups/${group.token}`, group.name, 'group_invite_shared')
  const shareLabel = shareButtonLabel(invite.feedback, useNativeShare(), 'invite')
  const now = useNow(group.games.map((game) => game.pastAt))
  const playing = new Set(table?.playing)
  const open = group.games.filter((game) => hiddenListGameOpen(game, now))
  // A game whose day has ended still has a battle on, so it stays current, read only, until that battle ends.
  const live = group.games.filter((game) => !hiddenListGameOpen(game, now) && playing.has(game.token))
  const past = group.games.filter((game) => !hiddenListGameOpen(game, now) && !playing.has(game.token))
  const tabs: { value: GroupTab; label: string; count?: number }[] = [
    { value: 'overview', label: 'Overview' },
    { value: 'leaderboard', label: 'Leaderboard', count: table?.table.rows.length || undefined },
    ...(league || group.organizer ? [{ value: 'league' as const, label: 'League' }] : []),
  ]
  const current: GroupTab = tabs.some((candidate) => candidate.value === tab) ? tab! : 'overview'
  const showTab = (next: GroupTab, game?: string) =>
    void navigate({
      to: '/groups/$token',
      params: { token: group.token },
      search: { tab: next === 'overview' ? undefined : next, game },
      hash: game ? `game-${game}` : undefined,
      replace: true,
    })
  // Battles outside hidden-list games are a league's fixtures or friendly games, and say which.
  const { date } = useDateFormatting()
  const rounds = new Map(league?.fixtures.flatMap((fixture) => (fixture.battle ? [[fixture.battle.token, fixture.round] as const] : [])))
  const label = (battle: Battle) => {
    const game = group.games.find((candidate) => candidate.token === table?.games[battle.token])
    if (game) return `Hidden-list game · ${date(game.playsAt ?? game.revealedAt ?? game.createdAt)}`
    const round = rounds.get(battle.token)
    return round === undefined ? 'Friendly game' : `League · Round ${round}`
  }
  const remove = useMutation({
    mutationFn: () => deleteGroup({ data: { token: group.token } }),
    onSettled: refresh,
    onSuccess: () => navigate({ to: '/groups' }),
  })
  const leave = useMutation({
    mutationFn: () => leaveGroup({ data: { token: group.token } }),
    onSettled: refresh,
    onSuccess: () => setLeaving(false),
  })

  return (
    <main className="w-full">
      <PageHeader
        eyebrow="Group"
        title={group.name}
        actions={
          <>
            {member && viewerId ? <NewGame group={group} viewerId={viewerId} /> : null}
            {member ? (
              <Button variant="outline" onClick={invite.share}>
                {invite.feedback === 'shared' ? <Share2 /> : invite.feedback === 'copied' ? <Check /> : <Clipboard />} {shareLabel}
              </Button>
            ) : null}
            {member ? (
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={`More for ${group.name}`} />}>
                  <EllipsisVertical />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {group.organizer ? (
                    <DropdownMenuItem onClick={() => setEditing(true)}>
                      <Pencil /> Edit group
                    </DropdownMenuItem>
                  ) : null}
                  {isOwner ? (
                    <DropdownMenuItem variant="destructive" onClick={() => (remove.reset(), setDeleting(true))}>
                      <Trash2 /> Delete group
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem variant="destructive" onClick={() => (leave.reset(), setLeaving(true))}>
                      <LogOut /> Leave group
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </>
        }
      >
        <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-dim">
          <VisibilityIcon visibility={group.visibility} />
          {countLabel(accepted.length, 'member')} · {accessSummary(group.visibility, group.admission)}
        </p>
        {group.description ? <p className="mt-3 max-w-2xl font-rules text-sm whitespace-pre-wrap text-dim">{group.description}</p> : null}
        <OrganizerLinks
          title="Run by"
          organizers={[
            { id: group.ownerId, name: group.ownerName, image: group.ownerImage },
            ...admins.map(({ userId, name, image }) => ({ id: userId, name, image })),
          ]}
        />
        {invite.feedback ? (
          <p aria-live="polite" className="mt-2 text-xs text-dim">
            {inviteFeedbackText(invite.feedback)}
          </p>
        ) : null}
      </PageHeader>

      <PageContent>
        {/* On a phone what's waiting on the reader leads and the members close the page; on a desktop both sit beside it. */}
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:grid-rows-[auto_1fr]">
          <div className="min-w-0 lg:col-start-2 lg:row-start-1">
            {member && viewerId ? (
              <GroupNext
                group={group}
                table={table}
                league={league}
                viewerId={viewerId}
                games={open}
                now={now}
                label={label}
                onShow={showTab}
              />
            ) : (
              <JoinGroup group={group} viewerId={viewerId} own={own} onWithdraw={() => (leave.reset(), setLeaving(true))} />
            )}
          </div>
          <div className="min-w-0 space-y-8 lg:col-start-1 lg:row-span-2 lg:row-start-1">
            <JoinRequests group={group} />
            {/* The primitive's root is a flex row by default, which would sit the panel beside the tab bar. */}
            <Tabs value={current} className="flex-col gap-0" onValueChange={(value) => showTab(value as GroupTab)}>
              <PageTabsList tabs={tabs} />
              <TabsContent value="overview" className="mt-6 space-y-8">
                <UpNext group={group} open={open} live={live} table={table} viewerId={viewerId} highlight={highlight} label={label} />
                <RecentGames table={table} viewerId={viewerId} member={member} quiet={!open.length && !live.length} label={label} />
                <PastHiddenListGames group={group} games={past} viewerId={viewerId} highlight={highlight} />
              </TabsContent>
              <TabsContent value="leaderboard" className="mt-6">
                <GroupLeaderboard table={table} viewerId={viewerId} />
              </TabsContent>
              <TabsContent value="league" className="mt-6 space-y-4">
                {league ? (
                  <Intro>
                    A round robin: everyone who joins plays every other player once. It keeps its own table, and its games count on the
                    leaderboard too.
                  </Intro>
                ) : null}
                <GroupLeague group={group} viewerId={viewerId} member={member} />
              </TabsContent>
            </Tabs>
          </div>
          <aside className="min-w-0 lg:col-start-2">
            <Members group={group} viewerId={viewerId} isOwner={isOwner} />
          </aside>
        </div>
      </PageContent>

      <GroupSettingsDialog group={group} ownerId={viewerId} open={editing} onOpenChange={setEditing} />
      <ConfirmDialog
        open={deleting}
        title={`Delete ${group.name}?`}
        description="This removes the group, its members, its table and its hidden-list games. Its battles stay."
        cancel="Keep group"
        confirm="Delete group"
        pendingLabel="Deleting…"
        destructive
        pending={remove.isPending}
        error={remove.error}
        onClose={() => setDeleting(false)}
        onConfirm={() => remove.mutate()}
      />
      <ConfirmDialog
        open={leaving}
        title={member ? `Leave ${group.name}?` : 'Withdraw your request?'}
        description={member ? 'You come off the leaderboard. Rejoin and your results come back.' : 'You can ask again later.'}
        cancel="Stay"
        confirm={member ? 'Leave group' : 'Withdraw'}
        pendingLabel="Leaving…"
        destructive
        pending={leave.isPending}
        error={leave.error}
        onClose={() => setLeaving(false)}
        onConfirm={() => leave.mutate()}
      />
    </main>
  )
}

function NewGame({ group, viewerId }: { group: Group; viewerId: string }) {
  const play = usePlayGroupGame(group.token)
  const refresh = useGroupRefresh(group.token)
  const opponents = group.members.filter((member) => member.status === 'accepted' && member.userId !== viewerId)
  const [creating, setCreating] = useState<'battle' | 'hidden' | null>(null)
  const [hidden, setHidden] = useState(false)
  // A shape is offered only when the group has enough other members to fill it.
  const shapes = TABLE_SHAPES.filter((candidate) => seatsFor(candidate).length <= opponents.length)
  const [shape, setShape] = useState<TableShape>('1v1')
  const [role, setRole] = useState<SoloPairRole>('solo')
  const [picked, setPicked] = useState<Record<string, string>>({})
  const seats = seatsFor(shape, role)
  // A duel starts against the first member, as most groups have only a few.
  const seatedIn = (seat: Seat) => picked[seat.id] ?? (shape === '1v1' ? (opponents[0]?.userId ?? null) : null)
  const players = seatedPlayers(seats, seatedIn)
  const seated = seats.every(seatedIn)
  const labels = disambiguatedPlayerLabels(opponents.map((member) => ({ id: member.userId, name: member.name })))
  return (
    <>
      <Button onClick={() => (play.reset(), setHidden(false), setCreating('battle'))}>
        <Plus /> New game
      </Button>
      <BattleChooserDialog
        open={creating === 'battle'}
        title="New game"
        description="Play other members for the group leaderboard."
        pending={play.isPending}
        error={play.error}
        ready={hidden || seated}
        fit
        onClose={() => setCreating(null)}
        onStart={() =>
          hidden ? setCreating('hidden') : play.mutate({ opponentIds: players.opponentIds, allyId: players.allyId ?? undefined })
        }
        action={
          hidden ? (
            <>
              <FileLock2 /> Set up game
            </>
          ) : undefined
        }
      >
        {group.organizer ? (
          <div className="space-y-1.5">
            <label htmlFor="group-game-hidden" className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">Hide lists until everyone has sealed</span>
              <Switch id="group-game-hidden" checked={hidden} disabled={play.isPending} onCheckedChange={setHidden} />
            </label>
            <p className="text-sm text-dim">
              {hidden
                ? 'Next, choose the format, points and day. Everyone seals a list in secret, then the lists are revealed together.'
                : 'Each of you picks a list at setup, and the battle starts now.'}
            </p>
          </div>
        ) : null}
        {hidden ? null : opponents.length ? (
          <>
            {shapes.length > 1 ? (
              <Choice
                label="Battle format"
                value={shape}
                options={shapes.map((candidate) => ({ value: candidate, ...TABLE_SHAPE_LABELS[candidate] }))}
                columns={3}
                disabled={play.isPending}
                onChange={(next) => (setShape(next), setPicked({}))}
              />
            ) : null}
            {shape === '2v1' ? (
              <Choice
                label="Your role"
                value={role}
                options={[
                  { value: 'solo', name: 'I’m solo', detail: 'Face two opponents' },
                  { value: 'pair', name: 'I’m on the pair', detail: 'Bring an ally' },
                ]}
                columns={2}
                disabled={play.isPending}
                onChange={(next) => (setRole(next), setPicked({}))}
              />
            ) : null}
            <SeatRows
              idPrefix="group-game"
              seats={seats}
              seatedIn={seatedIn}
              groupsFor={(_, taken) => [
                {
                  label: 'Members',
                  items: opponents
                    .filter((member) => !taken.has(member.userId))
                    .map((member) => seatOption({ id: member.userId, name: member.name, image: member.image }, labels)),
                },
              ]}
              onPick={(seat, id) => setPicked((current) => ({ ...current, [seat.id]: id }))}
            />
            {group.organizer ? null : <p className="text-sm text-dim">Each of you picks a list at setup.</p>}
          </>
        ) : (
          <p className="text-sm text-dim">Nobody else is in the group yet. Copy the invite link to bring people in.</p>
        )}
      </BattleChooserDialog>
      {group.organizer ? (
        <SealedEventSettingsDialog
          mode={{ kind: 'create', groupToken: group.token }}
          open={creating === 'hidden'}
          onOpenChange={(open) => {
            if (!open) {
              setCreating(null)
              void refresh()
            }
          }}
        />
      ) : null}
    </>
  )
}

/** For someone not in the group yet: join, or see that the request is waiting and take it back. */
function JoinGroup({
  group,
  viewerId,
  own,
  onWithdraw,
}: {
  group: Group
  viewerId: string | null
  own: Member | null
  onWithdraw: () => void
}) {
  const refresh = useGroupRefresh(group.token)
  const join = useMutation({ mutationFn: () => joinGroup({ data: { token: group.token } }), onSettled: refresh })
  const detail = own
    ? `${group.ownerName} or an admin needs to accept you.`
    : group.admission === 'approval'
      ? 'An organizer accepts each request. Once you’re in, your games against members go on the leaderboard.'
      : 'Once you’re in, your games against members go on the leaderboard.'
  return (
    <section data-group-status aria-labelledby="group-status" className="border border-edge bg-panel p-4 sm:p-5">
      <h2 id="group-status" className="text-xl leading-tight font-bold uppercase">
        {own ? 'Request sent' : 'Join this group'}
      </h2>
      <p className="mt-1.5 text-sm text-dim">{detail}</p>
      {own ? (
        <Button variant="outline" className="mt-4 w-full pointer-coarse:h-11" onClick={onWithdraw}>
          <LogOut /> Withdraw request
        </Button>
      ) : viewerId ? (
        <Button size="lg" className="mt-4 w-full pointer-coarse:h-11" disabled={join.isPending} onClick={() => join.mutate()}>
          <UserPlus /> {group.admission === 'approval' ? 'Ask to join' : 'Join group'}
        </Button>
      ) : (
        <Link
          to="/sign-in"
          search={{ next: `/groups/${group.token}` }}
          className={buttonClass({ size: 'lg', className: 'mt-4 w-full pointer-coarse:h-11' })}
        >
          Sign in to join
        </Link>
      )}
      {join.error ? <Problem error={join.error} className="mt-2" /> : null}
    </section>
  )
}

function Intro({ children }: { children: ReactNode }) {
  return <p className="max-w-2xl text-sm text-dim">{children}</p>
}

/** The current game night and the reader’s unfinished group battles. */
function UpNext({
  group,
  open,
  live,
  table,
  viewerId,
  highlight,
  label,
}: {
  group: Group
  open: Game[]
  live: Game[]
  table: GroupTable | null | undefined
  viewerId: string | null
  highlight: string | undefined
  label: (battle: Battle) => string
}) {
  // A current game's card lists its own battles, so they aren't repeated beneath it.
  const shown = new Set([...open, ...live].map((game) => game.token))
  const active = (table?.active ?? []).filter((battle) => !shown.has(table?.games[battle.token] ?? ''))
  if (!shown.size && !active.length) return null
  return (
    <section className="space-y-3">
      <SectionHeading title="Up next" />
      <CurrentGames group={group} open={open} live={live} viewerId={viewerId} highlight={highlight} />
      {active.length ? <BattleShelf name="Your group battles" battles={active} viewerId={viewerId ?? undefined} label={label} /> : null}
    </section>
  )
}

/** The hidden-list games still on: those taking lists or being played from, then past ones with a battle not yet over. */
function CurrentGames({
  group,
  open,
  live,
  viewerId,
  highlight,
}: {
  group: Group
  open: Game[]
  live: Game[]
  viewerId: string | null
  highlight: string | undefined
}) {
  return (
    <>
      {open.map((game) => (
        <GroupHiddenListGame key={game.token} group={group} game={game} viewerId={viewerId} highlighted={game.token === highlight} />
      ))}
      {live.map((game) => (
        <div key={game.token} className="border border-edge">
          <GroupHiddenListGame group={group} game={game} viewerId={viewerId} highlighted={game.token === highlight} embedded />
        </div>
      ))}
    </>
  )
}

/**
 * The one thing waiting on the reader across the whole group, in the order it holds them up: a battle they're in the
 * middle of, a list to seal, revealed lists to play, then their next league fixture.
 */
function GroupNext({
  group,
  table,
  league,
  viewerId,
  games,
  now,
  label,
  onShow,
}: {
  group: Group
  table: GroupTable | null | undefined
  league: League | null | undefined
  viewerId: string
  games: Game[]
  now: number
  label: (battle: Battle) => string
  onShow: (tab: GroupTab, game?: string) => void
}) {
  const play = usePlayGroupGame(group.token)
  const moment = useMoment()
  const nameOf = memberNameOf(group)
  const battle = table?.active[0]
  const toSeal = games.find(
    (game) =>
      game.revealedAt === null &&
      !sealedEventSealingClosed(game, now) &&
      !game.players.some((player) => player.userId === viewerId && player.sealed),
  )
  const toPlay = games.find((game) => game.revealedAt !== null && unplayedOpponents(game, viewerId).length)
  const fixture = league?.published
    ? league.fixtures
        .filter((candidate) => candidate.status === 'open' && candidate.key && (candidate.aId === viewerId || candidate.bId === viewerId))
        .toSorted((a, b) => a.round - b.round)[0]
    : undefined
  const joinable = league && !league.published && !league.players.some((player) => player.userId === viewerId)
  const goTo = (tab: GroupTab, game?: string, text = 'Go to the game') => (
    <Button variant="outline" className="w-full pointer-coarse:h-11" onClick={() => onShow(tab, game)}>
      <ArrowRight /> {text}
    </Button>
  )

  let next: { eyebrow?: string; title: string; detail: string; action?: ReactNode }
  if (battle) {
    const side = battle.sides[battle.playerIds.indexOf(viewerId)]
    const allies = battle.players.filter((_, index) => battle.playerIds[index] !== viewerId && battle.sides[index] === side)
    const opponents = namesPhrase(battle.players.filter((_, index) => battle.sides[index] !== side))
    next = {
      eyebrow: label(battle),
      title: 'Your battle is on',
      detail: allies.length ? `With ${namesPhrase(allies)}, against ${opponents}.` : `Against ${opponents}.`,
      action: (
        <Link to="/battles/$token" params={{ token: battle.token }} className={buttonClass({ className: 'w-full pointer-coarse:h-11' })}>
          <Play /> Resume battle
        </Link>
      ),
    }
  } else if (toSeal) {
    next = {
      eyebrow: 'Hidden-list game',
      title: 'Seal your list',
      detail: `${eventName({ ...toSeal, tournament: null, group })}. ${toSeal.sealBy ? `Lists are due ${moment(toSeal.sealBy)}.` : 'The lists are revealed together once everyone has sealed.'}`,
      action: goTo('overview', toSeal.token),
    }
  } else if (toPlay) {
    next = {
      eyebrow: 'Hidden-list game',
      title: 'The lists are out',
      detail: `Play ${namesPhrase(unplayedOpponents(toPlay, viewerId).map((player) => nameOf(player.userId)))} from ${eventName({ ...toPlay, tournament: null, group })}.`,
      action: goTo('overview', toPlay.token),
    }
  } else if (fixture && league) {
    const deadline = league.deadlines[fixture.round - 1] ?? null
    const opponent = fixture.aId === viewerId ? fixture.bId! : fixture.aId
    next = {
      eyebrow: `League · Round ${fixture.round}`,
      title: `Play ${nameOf(opponent)}`,
      detail:
        deadline === null
          ? 'Your next league game. Rounds can be played in any order.'
          : leagueFixtureOverdue(fixture.status, deadline, now)
            ? `This was due ${moment(deadline)}. Nothing is scored for it until it’s played.`
            : `Due ${moment(deadline)}.`,
      action: (
        <Button
          className="w-full pointer-coarse:h-11"
          disabled={play.isPending}
          onClick={() => play.mutate({ opponentIds: [opponent], fixture: fixture.key! })}
        >
          <Swords /> Start battle
        </Button>
      ),
    }
  } else if (joinable) {
    next = {
      eyebrow: 'League',
      title: 'Join the league',
      detail: 'Everyone who joins before it’s published plays every other player once.',
      action: goTo('league', undefined, 'See the league'),
    }
  } else {
    next = {
      title: 'Nothing waiting on you',
      detail: 'Play another member with New game. Every game you play for the group counts on the leaderboard.',
    }
  }
  return (
    <section data-group-next aria-labelledby="group-next" className="border border-edge bg-panel">
      <div className="space-y-3 p-4 sm:p-5">
        <p className="eyebrow text-dim">Up next for you{next.eyebrow ? ` · ${next.eyebrow}` : ''}</p>
        <div className="min-w-0">
          <h2 id="group-next" className="text-xl leading-tight font-bold break-words uppercase">
            {next.title}
          </h2>
          <p className="mt-1.5 text-sm text-dim">{next.detail}</p>
        </div>
        {next.action}
        {play.error ? <Problem error={play.error} /> : null}
      </div>
    </section>
  )
}

/** The group's latest finished battles of every kind; a group with nothing on and nothing played says how to start. */
function RecentGames({
  table,
  viewerId,
  member,
  quiet,
  label,
}: {
  table: GroupTable | null | undefined
  viewerId: string | null
  member: boolean
  /** Whether nothing else is on, with no open hidden-list game to show above. */
  quiet: boolean
  label: (battle: Battle) => string
}) {
  if (!table) return null
  if (table.recent.length)
    return <BattleShelf title="Recent games" name="Group games" battles={table.recent} viewerId={viewerId ?? undefined} label={label} />
  if (!quiet || table.active.length) return null
  return (
    <section>
      <SectionHeading title="Recent games" />
      <p className="text-sm text-dim">
        {member ? 'No games yet. Start the first with New game.' : 'No games yet. Members’ games show up here.'}
      </p>
    </section>
  )
}

function GroupLeaderboard({ table, viewerId }: { table: GroupTable | null | undefined; viewerId: string | null }) {
  if (!table) return null
  return (
    <div className="space-y-4">
      <Intro>
        Every game members play for the group counts here: friendly games, league fixtures and hidden-list games. Everyone starts at 1000,
        and beating a higher-rated player gains more.
      </Intro>
      <Standings table={table.table} viewerId={viewerId ?? undefined} title="Leaderboard" empty="No games finished yet." />
      <p className="text-sm text-faint">
        Guest, practice and manually tracked games don’t count.
        {table.partial ? ' Only the latest 10,000 games are counted.' : ''}
      </p>
    </div>
  )
}

const PAST_GAMES_SHOWN = 3

/** Past game nights, newest first, with their battles and frozen lists. */
function PastHiddenListGames({
  group,
  games: past,
  viewerId,
  highlight,
}: {
  group: Group
  games: Game[]
  viewerId: string | null
  highlight: string | undefined
}) {
  const [all, setAll] = useState(false)
  if (!past.length) return null
  // A link to an older game shows the whole list, so the game it names is there to open.
  const shown = all || past.findIndex((game) => game.token === highlight) >= PAST_GAMES_SHOWN ? past : past.slice(0, PAST_GAMES_SHOWN)
  return (
    <section>
      <SectionHeading title="Past hidden-list games" count={past.length} />
      <ul className="space-y-3">
        {shown.map((game) => (
          <li key={game.token} className="border border-edge">
            <GroupHiddenListGame group={group} game={game} viewerId={viewerId} highlighted={game.token === highlight} embedded />
          </li>
        ))}
      </ul>
      {past.length > shown.length ? (
        <Button variant="ghost" size="sm" className="mt-2" onClick={() => setAll(true)}>
          Show {past.length - shown.length} more
        </Button>
      ) : null}
    </section>
  )
}

/** People asking to join, for an organizer to answer before anything else on the page. */
function JoinRequests({ group }: { group: Group }) {
  const refresh = useGroupRefresh(group.token)
  const moderate = useMutation({
    mutationFn: (input: { userId: string; accept: boolean }) => moderateGroupMember({ data: { token: group.token, ...input } }),
    onSettled: refresh,
  })
  // Turning a request down is asked about first, so one stray press doesn't send someone away.
  const [declining, setDeclining] = useState<Member | null>(null)
  const pending = group.members.filter((member) => member.status === 'pending')
  if (!group.organizer || !pending.length) return null
  return (
    <section>
      <SectionHeading title="Asking to join" count={pending.length} />
      <ul className="divide-y divide-edge border border-edge bg-panel">
        {pending.map((member) => (
          <li key={member.userId} data-person={member.name} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 p-3">
            <Link to="/users/$userId" params={{ userId: member.userId }} className="group flex min-w-0 flex-1 items-center gap-2.5">
              <PlayerAvatar name={member.name} image={member.image} className="size-8 text-xs" />
              <span className="truncate font-semibold group-hover:underline">{member.name}</span>
            </Link>
            <div className="flex shrink-0 gap-2">
              <Button
                size="sm"
                variant="outline"
                className="pointer-coarse:h-11"
                disabled={moderate.isPending}
                onClick={() => moderate.mutate({ userId: member.userId, accept: true })}
              >
                <Check /> Let in
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="pointer-coarse:h-11"
                disabled={moderate.isPending}
                onClick={() => (moderate.reset(), setDeclining(member))}
              >
                <X /> Decline
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {moderate.error && !declining ? <Problem error={moderate.error} className="mt-2" /> : null}
      <ConfirmDialog
        open={declining !== null}
        title={`Decline ${declining?.name ?? ''}?`}
        description="They won’t join the group. They can ask again later."
        cancel="Keep"
        confirm="Decline"
        pendingLabel="Declining…"
        destructive
        pending={moderate.isPending}
        error={moderate.error}
        onClose={() => setDeclining(null)}
        onConfirm={() => declining && moderate.mutate({ userId: declining.userId, accept: false }, { onSuccess: () => setDeclining(null) })}
      />
    </section>
  )
}

function Members({ group, viewerId, isOwner }: { group: Group; viewerId: string | null; isOwner: boolean }) {
  const refresh = useGroupRefresh(group.token)
  const remove = useMutation({
    mutationFn: (userId: string) => removeGroupMember({ data: { token: group.token, userId } }),
    onSettled: refresh,
    onSuccess: () => setRemoving(null),
  })
  // Removing someone is asked about first: one stray press should not cost a member their place.
  const [removing, setRemoving] = useState<Member | null>(null)
  const accepted = group.members.filter((member) => member.status === 'accepted').toSorted((a, b) => rank(group, a) - rank(group, b))
  return (
    <section>
      <SectionHeading title="Members" count={accepted.length} />
      <ul className="divide-y divide-edge border border-edge bg-panel">
        {accepted.map((member) => {
          const role = member.userId === group.ownerId ? 'Owner' : member.role === 'admin' ? 'Admin' : null
          const removable =
            group.organizer && member.userId !== group.ownerId && member.userId !== viewerId && (member.role !== 'admin' || isOwner)
          return (
            <li key={member.userId} data-person={member.name} className="flex min-h-12 min-w-0 items-center gap-2 py-1.5 pr-1.5 pl-3">
              <Link to="/users/$userId" params={{ userId: member.userId }} className="group flex min-w-0 flex-1 items-center gap-2.5">
                <PlayerAvatar name={member.name} image={member.image} className="size-8 text-xs" />
                <span className="truncate font-semibold group-hover:underline">{member.name}</span>
                {member.userId === viewerId ? <span className="shrink-0 text-xs text-dim">you</span> : null}
              </Link>
              {role ? <span className="chip shrink-0">{role}</span> : null}
              {removable ? (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="text-faint hover:text-destructive pointer-coarse:size-11"
                  aria-label={`Remove ${member.name} from the group`}
                  disabled={remove.isPending}
                  onClick={() => (remove.reset(), setRemoving(member))}
                >
                  <X />
                </Button>
              ) : null}
            </li>
          )
        })}
      </ul>
      <ConfirmDialog
        open={removing !== null}
        title={`Remove ${removing?.name ?? ''}?`}
        description="They come off the group leaderboard. They can join again later, and their results come back."
        cancel="Keep"
        confirm="Remove"
        pendingLabel="Removing…"
        destructive
        pending={remove.isPending}
        error={remove.error}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && remove.mutate(removing.userId)}
      />
    </section>
  )
}

/** Who runs the group comes first, owner then admins. */
const rank = (group: Group, member: Member) => (member.userId === group.ownerId ? 0 : member.role === 'admin' ? 1 : 2)
