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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { buttonClass } from '../../components/buttonClass'
import { BattleChooserDialog } from '../../components/BattleChooserDialog'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { PageContent, PageHeader } from '../../components/Page'
import { PageTabsList } from '../../components/PageTabs'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import { Problem } from '../../components/Problem'
import { deleteClub, joinClub, leaveClub, moderateClubMember, removeClubMember } from '../../functions'
import { clubQuery, clubSeasonQuery, clubStandingsQuery, meQuery } from '../../queries'
import { BattleShelf } from '../battles/BattleShelf'
import type { Battle } from '../battles/battle'
import { useInviteShareLabel } from '../friends/friendInvite'
import { Standings } from '../leaderboard/Standings'
import { inviteFeedbackText, useInviteShare } from '../leagues/LeagueActions'
import { SectionHeading } from '../../components/SectionHeading'
import { accessSummary, OrganizerLinks, VisibilityIcon } from '../leagues/EventAccess'
import { LeagueSettingsDialog } from '../leagues/LeagueSettingsDialog'
import { useMoment } from '../leagues/EventSchedule'
import { eventName, namesPhrase } from '../leagues/leagueEvent'
import { useClubRefresh, usePlayClubGame, type Club, type ClubTab } from './club'
import { ClubSettingsDialog } from './ClubSettingsDialog'
import { ClubSealedGame, unplayedOpponents } from './ClubSealedGame'
import { ClubSeason } from './ClubSeason'
import { clubGameOpen } from '../../../core/club'
import { seasonFixtureOverdue } from '../../../core/clubSeason'
import { leagueSealingClosed } from '../../../core/league'
import { useNow } from '../../useNow'
import { countLabel } from '../../text'

type Member = Club['members'][number]
type ClubTable = NonNullable<Awaited<ReturnType<NonNullable<ReturnType<typeof clubStandingsQuery>['queryFn']>>>>
type Season = NonNullable<Awaited<ReturnType<NonNullable<ReturnType<typeof clubSeasonQuery>['queryFn']>>>>
type Game = Club['games'][number]

export function ClubPage({ token, game, tab }: { token: string; game?: string; tab?: ClubTab }) {
  const navigate = useNavigate()
  const { data: me } = useQuery(meQuery())
  const { data: club } = useQuery(clubQuery(token))
  useEffect(() => {
    if (club === null) void navigate({ to: '/clubs' })
  }, [club, navigate])
  if (!club) return null
  return <ClubScreen club={club} viewerId={me?.id ?? null} highlight={game} tab={tab} />
}

function ClubScreen({
  club,
  viewerId,
  highlight,
  tab,
}: {
  club: Club
  viewerId: string | null
  highlight: string | undefined
  tab: ClubTab | undefined
}) {
  const navigate = useNavigate()
  const refresh = useClubRefresh(club.token)
  const { data: table } = useQuery(clubStandingsQuery(club.token))
  const { data: season } = useQuery(clubSeasonQuery(club.token))
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const isOwner = viewerId === club.ownerId
  const own = club.members.find((member) => member.userId === viewerId) ?? null
  const member = own?.status === 'accepted'
  const accepted = club.members.filter((candidate) => candidate.status === 'accepted')
  const admins = accepted.filter((candidate) => candidate.role === 'admin')
  const invite = useInviteShare(`/clubs/${club.token}`, club.name, 'club_invite_shared')
  const shareLabel = useInviteShareLabel()
  const now = useNow(club.games.map((game) => game.pastAt))
  const open = club.games.filter((game) => clubGameOpen(game, now))
  const past = club.games.filter((game) => !clubGameOpen(game, now))
  const tabs: { value: ClubTab; label: string; count?: number }[] = [
    { value: 'overview', label: 'Overview' },
    { value: 'leaderboard', label: 'Leaderboard', count: table?.table.rows.length || undefined },
    ...(season || club.organizer ? [{ value: 'season' as const, label: 'Season' }] : []),
    ...(club.games.length || club.organizer
      ? [{ value: 'sealed' as const, label: 'Sealed games', count: club.games.length || undefined }]
      : []),
  ]
  // A link to a past game opens the tab that keeps it.
  const current: ClubTab = tabs.some((candidate) => candidate.value === tab)
    ? tab!
    : past.some((game) => game.token === highlight)
      ? 'sealed'
      : 'overview'
  const showTab = (next: ClubTab, game?: string) =>
    void navigate({
      to: '/clubs/$token',
      params: { token: club.token },
      search: { tab: next === 'overview' ? undefined : next, game },
      hash: game ? `game-${game}` : undefined,
      replace: true,
    })
  // Battles outside sealed games are a season's fixtures or friendly games, and say which.
  const rounds = new Map(season?.fixtures.flatMap((fixture) => (fixture.battle ? [[fixture.battle.token, fixture.round] as const] : [])))
  const label = (battle: Battle) => {
    const round = rounds.get(battle.token)
    return round === undefined ? 'Friendly game' : `Season · Round ${round}`
  }
  const remove = useMutation({
    mutationFn: () => deleteClub({ data: { token: club.token } }),
    onSettled: refresh,
    onSuccess: () => navigate({ to: '/clubs' }),
  })
  const leave = useMutation({
    mutationFn: () => leaveClub({ data: { token: club.token } }),
    onSettled: refresh,
    onSuccess: () => setLeaving(false),
  })

  return (
    <main className="w-full">
      <PageHeader
        eyebrow="Club"
        title={club.name}
        actions={
          <>
            {member && viewerId ? <NewGame club={club} viewerId={viewerId} /> : null}
            {member ? (
              <Button variant="outline" onClick={invite.share}>
                {invite.feedback === 'shared' ? <Share2 /> : invite.feedback === 'copied' ? <Check /> : <Clipboard />} {shareLabel}
              </Button>
            ) : null}
            {member ? (
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={`More for ${club.name}`} />}>
                  <EllipsisVertical />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {club.organizer ? (
                    <DropdownMenuItem onClick={() => setEditing(true)}>
                      <Pencil /> Edit club
                    </DropdownMenuItem>
                  ) : null}
                  {isOwner ? (
                    <DropdownMenuItem variant="destructive" onClick={() => (remove.reset(), setDeleting(true))}>
                      <Trash2 /> Delete club
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem variant="destructive" onClick={() => (leave.reset(), setLeaving(true))}>
                      <LogOut /> Leave club
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </>
        }
      >
        <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-dim">
          <VisibilityIcon visibility={club.visibility} />
          {countLabel(accepted.length, 'member')} · {accessSummary(club.visibility, club.admission)}
        </p>
        {club.description ? <p className="mt-3 max-w-2xl font-rules text-sm whitespace-pre-wrap text-dim">{club.description}</p> : null}
        <OrganizerLinks
          title="Run by"
          organizers={[
            { id: club.ownerId, name: club.ownerName, image: club.ownerImage },
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
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="min-w-0 lg:col-start-2 lg:row-start-1">
            {member && viewerId ? (
              <ClubNext
                club={club}
                table={table}
                season={season}
                viewerId={viewerId}
                games={open}
                now={now}
                label={label}
                onShow={showTab}
              />
            ) : (
              <JoinClub club={club} viewerId={viewerId} own={own} onWithdraw={() => (leave.reset(), setLeaving(true))} />
            )}
          </div>
          <div className="min-w-0 space-y-8 lg:col-start-1 lg:row-span-2 lg:row-start-1">
            <JoinRequests club={club} />
            {/* The primitive's root is a flex row by default, which would sit the panel beside the tab bar. */}
            <Tabs value={current} className="flex-col gap-0" onValueChange={(value) => showTab(value as ClubTab)}>
              <PageTabsList tabs={tabs} />
              <TabsContent value="overview" className="mt-6 space-y-8">
                <UpNext club={club} games={open} table={table} viewerId={viewerId} highlight={highlight} label={label} />
                <RecentGames club={club} table={table} viewerId={viewerId} member={member} label={label} />
              </TabsContent>
              <TabsContent value="leaderboard" className="mt-6">
                <ClubLeaderboard table={table} viewerId={viewerId} />
              </TabsContent>
              <TabsContent value="season" className="mt-6 space-y-4">
                {season ? (
                  <Intro>
                    A round robin: everyone who joins plays every other player once. It keeps its own table, and its games count on the
                    leaderboard too.
                  </Intro>
                ) : null}
                <ClubSeason club={club} viewerId={viewerId} member={member} />
              </TabsContent>
              <TabsContent value="sealed" className="mt-6 space-y-8">
                <Intro>
                  Everyone seals a list in secret, the lists are revealed together, and then you play from them. Organizers start one from
                  New game. Their games count on the leaderboard too.
                </Intro>
                {open.length ? (
                  <section className="space-y-3">
                    <SectionHeading title="Now" />
                    {open.map((game) => (
                      <ClubSealedGame key={game.token} club={club} game={game} viewerId={viewerId} highlighted={game.token === highlight} />
                    ))}
                  </section>
                ) : null}
                <PastSealedGames club={club} games={past} viewerId={viewerId} highlight={highlight} />
                {club.games.length ? null : <p className="text-sm text-dim">No sealed games yet.</p>}
              </TabsContent>
            </Tabs>
          </div>
          <aside className="min-w-0 lg:col-start-2">
            <Members club={club} viewerId={viewerId} isOwner={isOwner} />
          </aside>
        </div>
      </PageContent>

      <ClubSettingsDialog club={club} ownerId={viewerId} open={editing} onOpenChange={setEditing} />
      <ConfirmDialog
        open={deleting}
        title={`Delete ${club.name}?`}
        description="This removes the club, its members, its table and its sealed games. Its battles stay."
        cancel="Keep club"
        confirm="Delete club"
        pendingLabel="Deleting…"
        destructive
        pending={remove.isPending}
        error={remove.error}
        onClose={() => setDeleting(false)}
        onConfirm={() => remove.mutate()}
      />
      <ConfirmDialog
        open={leaving}
        title={member ? `Leave ${club.name}?` : 'Withdraw your request?'}
        description={member ? 'You come off the leaderboard. Rejoin and your results come back.' : 'You can ask again later.'}
        cancel="Stay"
        confirm={member ? 'Leave club' : 'Withdraw'}
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

function NewGame({ club, viewerId }: { club: Club; viewerId: string }) {
  const play = usePlayClubGame(club.token)
  const refresh = useClubRefresh(club.token)
  const opponents = club.members.filter((member) => member.status === 'accepted' && member.userId !== viewerId)
  const [creating, setCreating] = useState<'battle' | 'sealed' | null>(null)
  const [opponentId, setOpponentId] = useState<string | null>(null)
  const chosen = opponents.find((member) => member.userId === opponentId) ?? opponents[0]
  return (
    <>
      <Button onClick={() => (play.reset(), setCreating('battle'))}>
        <Plus /> New game
      </Button>
      <BattleChooserDialog
        open={creating === 'battle'}
        title="New game"
        description="Play another member for the club leaderboard."
        pending={play.isPending}
        error={play.error}
        ready={Boolean(chosen)}
        fit
        onClose={() => setCreating(null)}
        onStart={() => chosen && play.mutate({ opponentId: chosen.userId })}
      >
        {opponents.length ? (
          <div className="space-y-1.5">
            <Label htmlFor="club-game-opponent">Opponent</Label>
            <Select value={chosen?.userId ?? ''} onValueChange={(id) => id && setOpponentId(id)} disabled={play.isPending}>
              <SelectTrigger id="club-game-opponent" aria-label="Opponent" className="w-full">
                <SelectValue className="min-w-0">
                  {() =>
                    chosen ? (
                      <>
                        <PlayerAvatar name={chosen.name} image={chosen.image} className="size-6 text-3xs" />
                        <span className="truncate">{chosen.name}</span>
                      </>
                    ) : (
                      'Choose an opponent'
                    )
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {opponents.map((member) => (
                  <SelectItem key={member.userId} value={member.userId} label={member.name}>
                    <span className="flex min-w-0 items-center gap-2">
                      <PlayerAvatar name={member.name} image={member.image} className="size-6 text-3xs" />
                      <span className="truncate">{member.name}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-dim">Each of you picks a list at setup.</p>
          </div>
        ) : (
          <p className="text-sm text-dim">Nobody else is in the club yet. Copy the invite link to bring people in.</p>
        )}
        {club.organizer ? (
          <div className="space-y-2 border-t border-edge pt-4">
            <Button variant="outline" disabled={play.isPending} onClick={() => setCreating('sealed')}>
              <FileLock2 /> New sealed game
            </Button>
            <p className="text-sm text-dim">Seal lists in secret and reveal them together before playing.</p>
          </div>
        ) : null}
      </BattleChooserDialog>
      {club.organizer ? (
        <LeagueSettingsDialog
          mode={{ kind: 'create', clubToken: club.token }}
          open={creating === 'sealed'}
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

/** For someone not in the club yet: join, or see that the request is waiting and take it back. */
function JoinClub({
  club,
  viewerId,
  own,
  onWithdraw,
}: {
  club: Club
  viewerId: string | null
  own: Member | null
  onWithdraw: () => void
}) {
  const refresh = useClubRefresh(club.token)
  const join = useMutation({ mutationFn: () => joinClub({ data: { token: club.token } }), onSettled: refresh })
  const detail = own
    ? `${club.ownerName} or an admin needs to accept you.`
    : club.admission === 'approval'
      ? 'An organizer accepts each request. Once you’re in, your games against members go on the leaderboard.'
      : 'Once you’re in, your games against members go on the leaderboard.'
  return (
    <section data-club-status aria-labelledby="club-status" className="border border-edge bg-panel p-4 sm:p-5">
      <h2 id="club-status" className="text-xl leading-tight font-bold uppercase">
        {own ? 'Request sent' : 'Join this club'}
      </h2>
      <p className="mt-1.5 text-sm text-dim">{detail}</p>
      {own ? (
        <Button variant="outline" className="mt-4 w-full pointer-coarse:h-11" onClick={onWithdraw}>
          <LogOut /> Withdraw request
        </Button>
      ) : viewerId ? (
        <Button size="lg" className="mt-4 w-full pointer-coarse:h-11" disabled={join.isPending} onClick={() => join.mutate()}>
          <UserPlus /> {club.admission === 'approval' ? 'Ask to join' : 'Join club'}
        </Button>
      ) : (
        <Link
          to="/sign-in"
          search={{ next: `/clubs/${club.token}` }}
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

/** The current game night and the reader’s unfinished club battles. */
function UpNext({
  club,
  games,
  table,
  viewerId,
  highlight,
  label,
}: {
  club: Club
  games: Game[]
  table: ClubTable | null | undefined
  viewerId: string | null
  highlight: string | undefined
  label: (battle: Battle) => string
}) {
  const active = table?.active ?? []
  if (!games.length && !active.length) return null
  return (
    <section className="space-y-3">
      <SectionHeading title="Up next" />
      {games.map((game) => (
        <ClubSealedGame key={game.token} club={club} game={game} viewerId={viewerId} highlighted={game.token === highlight} />
      ))}
      {active.length ? <BattleShelf name="Your club battles" battles={active} viewerId={viewerId ?? undefined} label={label} /> : null}
    </section>
  )
}

/**
 * The one thing waiting on the reader across the whole club, in the order it holds them up: a battle they're in the
 * middle of, a list to seal, revealed lists to play, then their next season fixture.
 */
function ClubNext({
  club,
  table,
  season,
  viewerId,
  games,
  now,
  label,
  onShow,
}: {
  club: Club
  table: ClubTable | null | undefined
  season: Season | null | undefined
  viewerId: string
  games: Game[]
  now: number
  label: (battle: Battle) => string
  onShow: (tab: ClubTab, game?: string) => void
}) {
  const play = usePlayClubGame(club.token)
  const moment = useMoment()
  const nameOf = (userId: string) => club.members.find((member) => member.userId === userId)?.name ?? 'A former member'
  const battle = table?.active[0]
  const toSeal = games.find(
    (game) =>
      game.revealedAt === null &&
      !leagueSealingClosed(game, now) &&
      !game.players.some((player) => player.userId === viewerId && player.sealed),
  )
  const toPlay = games.find((game) => game.revealedAt !== null && unplayedOpponents(game, viewerId).length)
  const fixture = season?.published
    ? season.fixtures
        .filter((candidate) => candidate.status === 'open' && candidate.key && (candidate.aId === viewerId || candidate.bId === viewerId))
        .toSorted((a, b) => a.round - b.round)[0]
    : undefined
  const joinable = season && !season.published && !season.players.some((player) => player.userId === viewerId)
  const goTo = (tab: ClubTab, game?: string, text = 'Go to the game') => (
    <Button variant="outline" className="w-full pointer-coarse:h-11" onClick={() => onShow(tab, game)}>
      <ArrowRight /> {text}
    </Button>
  )

  let next: { eyebrow?: string; title: string; detail: string; action?: ReactNode }
  if (battle) {
    next = {
      eyebrow: label(battle),
      title: 'Your battle is on',
      detail: `Against ${namesPhrase(battle.players.filter((_, index) => battle.playerIds[index] !== viewerId))}.`,
      action: (
        <Link to="/battles/$token" params={{ token: battle.token }} className={buttonClass({ className: 'w-full pointer-coarse:h-11' })}>
          <Play /> Resume battle
        </Link>
      ),
    }
  } else if (toSeal) {
    next = {
      eyebrow: 'Sealed game',
      title: 'Seal your list',
      detail: `${eventName({ ...toSeal, tournament: null, club })}. ${toSeal.sealBy ? `Lists are due ${moment(toSeal.sealBy)}.` : 'The lists are revealed together once everyone has sealed.'}`,
      action: goTo('overview', toSeal.token),
    }
  } else if (toPlay) {
    next = {
      eyebrow: 'Sealed game',
      title: 'The lists are out',
      detail: `Play ${namesPhrase(unplayedOpponents(toPlay, viewerId).map((player) => nameOf(player.userId)))} from ${eventName({ ...toPlay, tournament: null, club })}.`,
      action: goTo('overview', toPlay.token),
    }
  } else if (fixture && season) {
    const deadline = season.deadlines[fixture.round - 1] ?? null
    const opponent = fixture.aId === viewerId ? fixture.bId! : fixture.aId
    next = {
      eyebrow: `Season · Round ${fixture.round}`,
      title: `Play ${nameOf(opponent)}`,
      detail:
        deadline === null
          ? 'Your next season game. Rounds can be played in any order.'
          : seasonFixtureOverdue(fixture.status, deadline, now)
            ? `This was due ${moment(deadline)}. Nothing is scored for it until it’s played.`
            : `Due ${moment(deadline)}.`,
      action: (
        <Button
          className="w-full pointer-coarse:h-11"
          disabled={play.isPending}
          onClick={() => play.mutate({ opponentId: opponent, fixture: fixture.key! })}
        >
          <Swords /> Start battle
        </Button>
      ),
    }
  } else if (joinable) {
    next = {
      eyebrow: 'Season',
      title: 'Join the season',
      detail: 'Everyone who joins before it’s published plays every other player once.',
      action: goTo('season', undefined, 'See the season'),
    }
  } else {
    next = {
      title: 'Nothing waiting on you',
      detail: 'Play another member with New game. Every game you play for the club counts on the leaderboard.',
    }
  }
  return (
    <section data-club-next aria-labelledby="club-next" className="border border-edge bg-panel">
      <div className="space-y-3 p-4 sm:p-5">
        <p className="eyebrow text-dim">Up next for you{next.eyebrow ? ` · ${next.eyebrow}` : ''}</p>
        <div className="min-w-0">
          <h2 id="club-next" className="text-xl leading-tight font-bold break-words uppercase">
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

/** Battles played outside sealed games; a sealed game lists its own. A club with no games yet says how to start one. */
function RecentGames({
  club,
  table,
  viewerId,
  member,
  label,
}: {
  club: Club
  table: ClubTable | null | undefined
  viewerId: string | null
  member: boolean
  label: (battle: Battle) => string
}) {
  if (!table) return null
  if (table.recent.length)
    return <BattleShelf title="Recent games" name="Club games" battles={table.recent} viewerId={viewerId ?? undefined} label={label} />
  if (table.finished || table.active.length || club.games.length) return null
  return (
    <section>
      <SectionHeading title="Recent games" />
      <p className="text-sm text-dim">
        {member ? 'No games yet. Start the first with New game.' : 'No games yet. Members’ games show up here.'}
      </p>
    </section>
  )
}

function ClubLeaderboard({ table, viewerId }: { table: ClubTable | null | undefined; viewerId: string | null }) {
  if (!table) return null
  return (
    <div className="space-y-4">
      <Intro>
        Every game members play for the club counts here: friendly games, season fixtures and sealed games. Everyone starts at 1000, and
        beating a higher-rated player gains more.
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
function PastSealedGames({
  club,
  games: past,
  viewerId,
  highlight,
}: {
  club: Club
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
      <SectionHeading title="Past sealed games" count={past.length} />
      <ul className="space-y-3">
        {shown.map((game) => (
          <li key={game.token} className="border border-edge">
            <ClubSealedGame club={club} game={game} viewerId={viewerId} highlighted={game.token === highlight} embedded />
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
function JoinRequests({ club }: { club: Club }) {
  const refresh = useClubRefresh(club.token)
  const moderate = useMutation({
    mutationFn: (input: { userId: string; accept: boolean }) => moderateClubMember({ data: { token: club.token, ...input } }),
    onSettled: refresh,
  })
  // Turning a request down is asked about first, so one stray press doesn't send someone away.
  const [declining, setDeclining] = useState<Member | null>(null)
  const pending = club.members.filter((member) => member.status === 'pending')
  if (!club.organizer || !pending.length) return null
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
        description="They won’t join the club. They can ask again later."
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

function Members({ club, viewerId, isOwner }: { club: Club; viewerId: string | null; isOwner: boolean }) {
  const refresh = useClubRefresh(club.token)
  const remove = useMutation({
    mutationFn: (userId: string) => removeClubMember({ data: { token: club.token, userId } }),
    onSettled: refresh,
    onSuccess: () => setRemoving(null),
  })
  // Removing someone is asked about first: one stray press should not cost a member their place.
  const [removing, setRemoving] = useState<Member | null>(null)
  const accepted = club.members.filter((member) => member.status === 'accepted').toSorted((a, b) => rank(club, a) - rank(club, b))
  return (
    <section>
      <SectionHeading title="Members" count={accepted.length} />
      <ul className="divide-y divide-edge border border-edge bg-panel">
        {accepted.map((member) => {
          const role = member.userId === club.ownerId ? 'Owner' : member.role === 'admin' ? 'Admin' : null
          const removable =
            club.organizer && member.userId !== club.ownerId && member.userId !== viewerId && (member.role !== 'admin' || isOwner)
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
                  aria-label={`Remove ${member.name} from the club`}
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
        description="They come off the club leaderboard. They can join again later, and their results come back."
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

/** Who runs the club comes first, owner then admins. */
const rank = (club: Club, member: Member) => (member.userId === club.ownerId ? 0 : member.role === 'admin' ? 1 : 2)
