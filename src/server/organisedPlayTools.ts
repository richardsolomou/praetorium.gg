import { z } from 'zod'
import {
  isTeamFormat,
  effectiveSealedEventAllowances,
  sealedEventAllowanceOptions,
  sealedEventPairShares,
  sealedEventTableShape,
} from '../core/sealedEvent'
import { leagueFixtureOverdue } from '../core/groupLeague'
import { tokenSchema } from '../contracts/schemas'
import { gameReferencesFor } from '../shared/gameReferences'
import { READ_ONLY_TOOL, structured, type AgentTools } from './agentTools'
import { app } from './app'
import { agentWrites, captureMutation } from './mutationTelemetry'
import { productActions } from './productActions'
import type { PraetoriumService } from './service'
import { BATTLES_PAGE } from './services/battleFeedService'

// Other players see each write, and a reseal or reported score replaces what stood before.
const WRITE = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true } as const

const tokenField = tokenSchema.shape.token
const eventInput = {
  token: tokenField.describe('The tournament or hidden-list game token, from list_my_events or its invite link.'),
  eventToken: tokenField.optional().describe('eventToken from list_my_events; only an old link needs it.'),
}
const missionPackId = z
  .string()
  .min(1)
  .max(128)
  .optional()
  .describe('A mission pack id from list_reference; omit for the current pack, as the site does.')

const iso = (time: number | null | undefined) => (time == null ? null : new Date(time).toISOString())
const eventUrl = (event: { kind: 'tournament' | 'group'; token: string; group: { token: string } | null }) =>
  event.kind === 'group' && event.group
    ? `/groups/${encodeURIComponent(event.group.token)}/games/${encodeURIComponent(event.token)}`
    : `/tournaments/${encodeURIComponent(event.token)}`
const battleUrl = (battleToken: string) => `/battles/${encodeURIComponent(battleToken)}`

async function currentPackId() {
  const rules = await app().rulesFor()
  return rules ? (gameReferencesFor(rules).packs[0]?.id ?? null) : null
}

type Battle = Awaited<ReturnType<PraetoriumService['battleFeedService']['battles']>>['battles'][number]

/** A battle as an organised-play answer needs it: who sits where and the score, without armies or images. */
const tableBattle = (battle: Battle) => ({
  token: battle.token,
  url: battleUrl(battle.token),
  status: battle.status,
  players: battle.playerDetails.map(({ id, name }, at) => ({ id, name, side: battle.sides[at], score: battle.scores[at] })),
})

type SealedEvent = NonNullable<Awaited<ReturnType<PraetoriumService['sealedEventService']['sealedEvent']>>>

/** The event as this player may read it; `sealedEvent` already holds back every list and pair choice before the reveal. */
export async function readEvent(token: string, eventToken: string | undefined, userId: string) {
  const sealedEvent = await app().service.sealedEventService.sealedEvent(token, userId, eventToken, await app().battleFactionsFor())
  if (!sealedEvent) throw new Response('No tournament or hidden-list game has this token.', { status: 404 })
  return sealedEvent
}

function currentRound(sealedEvent: SealedEvent) {
  return Math.max(0, ...sealedEvent.pairings.map((pairing) => pairing.round))
}

export function ownTable(sealedEvent: SealedEvent, userId: string, round = currentRound(sealedEvent)) {
  return sealedEvent.pairings.find((pairing) => pairing.round === round && (pairing.aId === userId || pairing.bId === userId))
}

/** What the player still has to do, in the order the event asks it. */
function eventTodo(sealedEvent: SealedEvent, userId: string, battles: ReadonlyMap<string, Battle>) {
  const entry = sealedEvent.entries.find((candidate) => candidate.userId === userId)
  const revealed = sealedEvent.revealedAt !== null
  const page = 'on its page (url)'
  if (!entry) return revealed ? [] : ['Join with join_event.']
  if (entry.status === 'pending') return ['Wait for the organizer to let you in.']
  if (entry.status === 'rejected') return []
  if (!revealed) {
    if (!entry.submitted) {
      if (isTeamFormat(sealedEvent.format) && entry.requiredLimit === null)
        return [
          sealedEvent.kind === 'group'
            ? `Choose your side ${page}, then seal a list.`
            : 'Wait for the organizer to give you a size or team.',
        ]
      const by = sealedEvent.sealBy ? ` before ${iso(sealedEvent.sealBy)}` : ''
      return [`Seal a roster with submit_event_roster${by}.`]
    }
    const pair = [
      ...(entry.dispositionOwed ? [`Your pair chooses the Force Disposition it plays ${page}.`] : []),
      ...(entry.warlordOwed ? [`Your pair chooses whose Warlord leads ${page}.`] : []),
    ]
    return pair.length ? pair : ['Wait for the reveal. You can replace your sealed list with submit_event_roster until then.']
  }
  if (!entry.submitted) return []
  if (entry.dropped) return []
  if (sealedEvent.rounds === null) return ['Start a battle against another entrant with start_event_battle.']
  const round = currentRound(sealedEvent)
  if (!round)
    return [
      ...(entry.checkedIn ? [] : ['Check in with check_in_event before round 1 is paired.']),
      'Wait for the organizer to pair round 1.',
    ]
  const table = ownTable(sealedEvent, userId, round)
  const waitNext = round < sealedEvent.rounds ? `Wait for the organizer to pair round ${round + 1}.` : 'Every round is played.'
  const battle = table?.battleToken ? battles.get(table.battleToken) : undefined
  const opponentId = table && (table.aId === userId ? table.bId : table.aId)
  // An opponent who withdrew before the table finished leaves it as a bye.
  const forfeit = battle?.status !== 'finished' && sealedEvent.entries.some((other) => other.userId === opponentId && other.dropped)
  if (!table || !table.bId || forfeit) return [table ? `You have a bye in round ${round}.` : '', waitNext].filter(Boolean)
  if (!table.battleToken)
    return [
      `Start your round ${round} battle with start_event_battle, or after an untracked game report the score both players agree with report_table_result.`,
    ]
  if (battle?.status === 'finished') return [waitNext]
  return [
    `Play your round ${round} battle at rounds.yourTable.battle.url. Finish it there, or report the score both players agree with report_table_result.`,
  ]
}

export function registerOrganisedPlayTools(server: AgentTools, userId: string | null) {
  const player = () => {
    if (!userId) throw new Response('Sign in to use this tool.', { status: 401 })
    return userId
  }
  const write = (work: (owner: string) => Promise<Record<string, unknown>>) =>
    agentWrites.run(true, async () => structured(await work(player())))

  server.registerTool(
    'list_my_events',
    {
      title: 'List my groups and tournaments',
      description:
        "Lists the signed-in player's groups, tournaments and hidden-list games (a group's game where everyone seals a list in secret before the reveal), each with its token, url, dates and your place in it: membership, entry status, whether you sealed a list, and the size you seal at. Pass includeOpen to also list public groups and tournaments you could join. Read one with get_my_group or get_my_event. Requires mcp:read.",
      inputSchema: { includeOpen: z.boolean().default(false).describe('Also list public groups and tournaments you are not in.') },
      annotations: READ_ONLY_TOOL,
    },
    async ({ includeOpen }) => {
      const me = player()
      const { groupService, sealedEventService } = app().service
      const [groups, events] = await Promise.all([groupService.groups(me), sealedEventService.sealedEvents(me)])
      const group = (row: (typeof groups)[number]) => ({
        token: row.token,
        name: row.name,
        url: `/groups/${encodeURIComponent(row.token)}`,
        visibility: row.visibility,
        admission: row.admission,
        ownerName: row.ownerName,
        members: row.memberCount,
        battles: row.battleCount,
        lastBattleAt: iso(row.lastBattleAt),
        you: row.ownMember && {
          status: row.ownMember.status,
          role: row.ownerId === me ? 'owner' : row.ownMember.role,
        },
      })
      const event = (row: (typeof events)[number]) => ({
        token: row.token,
        eventToken: row.eventToken,
        name: row.tournament?.name ?? null,
        group: row.group,
        url: eventUrl(row),
        format: sealedEventTableShape(row.format),
        size: row.rosterLimit,
        pointsBudget: row.pointsBudget,
        playsAt: iso(row.playsAt),
        sealBy: iso(row.sealBy),
        revealed: row.revealedAt !== null,
        past: row.pastAt !== null,
        entrants: row.entrantCount,
        playerLimit: row.tournament?.playerLimit ?? null,
        organizer: row.tournament ? row.tournament.ownerId === me || row.tournament.adminIds.includes(me) : null,
        you: row.ownEntry && {
          status: row.ownEntry.status,
          sealed: row.ownEntry.submitted,
          rosterName: row.ownEntry.rosterName,
          sealAt: row.ownEntry.requiredLimit,
        },
      })
      const mine = events.filter((row) => row.personal)
      return structured({
        groups: groups.filter((row) => row.ownMember).map(group),
        tournaments: mine.filter((row) => row.kind === 'tournament').map(event),
        hiddenListGames: mine.filter((row) => row.kind === 'group').map(event),
        ...(includeOpen
          ? {
              open: {
                groups: groups.filter((row) => !row.ownMember).map(group),
                tournaments: events.filter((row) => !row.personal && row.kind === 'tournament').map(event),
              },
            }
          : {}),
      })
    },
  )

  server.registerTool(
    'get_my_group',
    {
      title: 'Read one of my groups',
      description:
        "Returns a group as its page shows it to the signed-in player: members (ids for create_battle's opponentIds), the leaderboard, recent finished games and your unfinished ones, its current hidden-list games, and its league with the table and your fixtures. An open fixture's start is the create_battle input that plays it for the league. A private group shows only its name until you are a member. Requires mcp:read.",
      inputSchema: { token: tokenField.describe('The group token, from list_my_events or its invite link.') },
      annotations: READ_ONLY_TOOL,
    },
    async ({ token: groupToken }) => {
      const me = player()
      const instance = app()
      const factions = await instance.battleFactionsFor()
      const [found, standings, league] = await Promise.all([
        instance.service.groupService.group(groupToken, me),
        instance.service.groupResultsService.groupStandings(groupToken, me, factions),
        instance.service.groupResultsService.groupLeague(groupToken, me, factions),
      ])
      if (!found) throw new Response('No group has this token.', { status: 404 })
      const own = found.members.find((member) => member.userId === me)
      const header = {
        token: found.token,
        name: found.name,
        description: found.description,
        url: `/groups/${encodeURIComponent(found.token)}`,
        visibility: found.visibility,
        admission: found.admission,
        ownerName: found.ownerName,
        you: own ? { status: own.status, role: found.ownerId === me ? 'owner' : own.role, organizer: found.organizer } : null,
      }
      // A private group's table, league and games are its members' alone, which groupStandings decides.
      if (!standings) return structured({ group: header, hidden: true, todo: own ? [] : ['Join with join_group.'] })
      const names = new Map(found.members.map((member) => [member.userId, member.name]))
      const named = (id: string | null) => (id ? { id, name: names.get(id) ?? 'A player' } : null)
      const now = Date.now()
      const games = found.games.filter((game) => game.pastAt === null)
      const myFixtures =
        league?.published === true
          ? league.fixtures
              .filter((fixture) => fixture.aId === me || fixture.bId === me)
              .map((fixture) => {
                const opponent = fixture.aId === me ? fixture.bId : fixture.aId
                return {
                  round: fixture.round,
                  opponent: named(opponent),
                  status: fixture.status,
                  deadline: iso(league.deadlines[fixture.round - 1]),
                  overdue: leagueFixtureOverdue(fixture.status, league.deadlines[fixture.round - 1] ?? null, now),
                  battle: fixture.battle && {
                    token: fixture.battle.token,
                    url: battleUrl(fixture.battle.token),
                    status: fixture.battle.status,
                  },
                  start:
                    fixture.status === 'open' && opponent && fixture.key
                      ? { opponentIds: [opponent], groupToken: found.token, fixture: fixture.key }
                      : null,
                }
              })
          : []
      const inLeague = league?.players.some((entry) => entry.userId === me && !entry.withdrawn) ?? false
      return structured({
        group: header,
        members: found.members
          .filter((member) => member.status === 'accepted')
          .map((member) => ({ id: member.userId, name: member.name, role: member.userId === found.ownerId ? 'owner' : member.role })),
        leaderboard: standings.table.rows.map((row, at) => ({
          place: at + 1,
          id: row.id,
          name: row.name,
          rating: row.rating,
          battles: row.battles,
          won: row.won,
          lost: row.lost,
          drawn: row.drawn,
        })),
        finishedBattles: standings.finished,
        recent: standings.recent.map(tableBattle),
        yourUnfinished: standings.active.map(tableBattle),
        partial: standings.partial,
        hiddenListGames: games.map((game) => ({
          token: game.token,
          url: `/groups/${encodeURIComponent(found.token)}/games/${encodeURIComponent(game.token)}`,
          format: sealedEventTableShape(game.format),
          size: game.rosterLimit,
          playsAt: iso(game.playsAt),
          sealBy: iso(game.sealBy),
          revealed: game.revealedAt !== null,
          players: game.players.map((entry) => ({ ...named(entry.userId)!, sealed: entry.sealed })),
        })),
        league: league && {
          published: league.published,
          players: league.players.map((entry) => ({ id: entry.userId, name: entry.name, withdrawn: entry.withdrawn })),
          table: league.table.map((row, at) => ({
            place: at + 1,
            ...named(row.userId)!,
            points: row.points,
            won: row.won,
            drawn: row.drawn,
            lost: row.lost,
            vp: row.vp,
          })),
          yourFixtures: myFixtures,
        },
        todo: [
          ...(own?.status === 'pending' ? ['Wait for an organizer to let you in.'] : []),
          ...(!own ? ['Join with join_group.'] : []),
          ...(league && !league.published && own?.status === 'accepted' && !inLeague ? ['Join the draft league with join_league.'] : []),
          ...games.flatMap((game) =>
            game.revealedAt === null && game.players.some((entry) => entry.userId === me && !entry.sealed)
              ? [`Seal a list for hidden-list game ${game.token}: read it with get_my_event.`]
              : [],
          ),
          ...myFixtures.flatMap((fixture) =>
            fixture.start
              ? [`Play your round ${fixture.round} league game against ${fixture.opponent?.name} with create_battle and its start.`]
              : [],
          ),
        ],
      })
    },
  )

  server.registerTool(
    'get_my_event',
    {
      title: 'Read a tournament or hidden-list game',
      description:
        "Returns a tournament or hidden-list game as the signed-in player may see it: rules (format, size, points, what lists may break), dates, entrants with whether each sealed, your entry, Swiss rounds with your table and opponent, standings once lists are revealed, your battles in it, and todo: what you still need to do. Before the reveal nobody's list is shown but your own name for it. Requires mcp:read.",
      inputSchema: eventInput,
      annotations: READ_ONLY_TOOL,
    },
    async ({ token: hostToken, eventToken }) => {
      const me = player()
      const instance = app()
      const sealedEvent = await readEvent(hostToken, eventToken, me)
      const revealed = sealedEvent.revealedAt !== null
      const [rules, factions] = await Promise.all([instance.rulesFor(), instance.battleFactionsFor()])
      const [results, mine] = revealed
        ? await Promise.all([
            instance.service.sealedEventResultsService.sealedEventResults(sealedEvent.token, sealedEvent.eventToken, rules, factions, me),
            instance.service.sealedEventResultsService.sealedEventBattles(
              sealedEvent.token,
              sealedEvent.eventToken,
              { limit: BATTLES_PAGE, filter: { player: { in: [me], out: [] } } },
              rules,
              factions,
              me,
            ),
          ])
        : [null, { battles: [] }]
      const battles = new Map(mine.battles.map((battle) => [battle.token, battle]))
      const names = new Map(sealedEvent.entries.map((entry) => [entry.userId, entry.name]))
      const named = (id: string | null) => (id ? { id, name: names.get(id) ?? 'A player' } : null)
      const entry = sealedEvent.entries.find((candidate) => candidate.userId === me)
      const format = sealedEventTableShape(sealedEvent.format)
      const allows = sealedEvent.rosterLimit
        ? sealedEventAllowanceOptions(format, sealedEvent.rosterLimit).filter((option) =>
            effectiveSealedEventAllowances(format, sealedEvent.rosterLimit!, sealedEvent.allowances).includes(option.id),
          )
        : []
      const round = currentRound(sealedEvent)
      const table = (pairing: SealedEvent['pairings'][number]) => {
        const battle = pairing.battleToken ? battles.get(pairing.battleToken) : undefined
        return {
          round: pairing.round,
          table: pairing.table,
          opponent: named(pairing.aId === me ? pairing.bId : pairing.aId),
          bye: pairing.bId === null,
          battle: pairing.battleToken
            ? battle
              ? tableBattle(battle)
              : { token: pairing.battleToken, url: battleUrl(pairing.battleToken), status: null }
            : null,
        }
      }
      const current = ownTable(sealedEvent, me, round)
      const standings:
        | readonly { userId: string; played: number; won: number; drawn: number; lost: number; points: number; vp?: number }[]
        | null = results && (results.swiss ?? results.rows)
      return structured({
        token: sealedEvent.token,
        eventToken: sealedEvent.eventToken,
        kind: sealedEvent.kind === 'group' ? 'hidden-list game' : 'tournament',
        name: sealedEvent.tournament?.name ?? null,
        description: sealedEvent.tournament?.description ?? null,
        group: sealedEvent.group,
        url: eventUrl(sealedEvent),
        organizer: sealedEvent.organizer,
        rules: {
          format,
          size: sealedEvent.rosterLimit,
          pointsBudget: sealedEvent.pointsBudget,
          soloPoints: sealedEvent.soloPoints,
          allyPoints: sealedEvent.allyPoints,
          alliesSplitPoints: sealedEventPairShares(sealedEvent),
          allows: allows.map((option) => option.label),
          swissRounds: sealedEvent.rounds,
        },
        playsAt: iso(sealedEvent.playsAt),
        sealBy: iso(sealedEvent.sealBy),
        revealedAt: iso(sealedEvent.revealedAt),
        roundEndsAt: iso(sealedEvent.roundEndsAt),
        you: entry
          ? {
              status: entry.status,
              sealed: entry.submitted,
              rosterName: entry.rosterName,
              sealAt: entry.requiredLimit,
              teamId: entry.teamId,
              checkedIn: entry.checkedIn,
              withdrawn: entry.dropped,
              // Only your own pair's choices reach you before the reveal.
              team: entry.team && { disposition: entry.team.disposition, warlord: named(entry.team.warlord) },
            }
          : null,
        entrants: sealedEvent.entries.map((other) => ({
          id: other.userId,
          name: other.name,
          status: other.status,
          sealed: other.submitted,
          teamId: other.teamId,
          withdrawn: other.dropped,
          // Repeated here, not trusted from upstream alone: a list's army is never shown before the reveal.
          army:
            revealed && other.army
              ? {
                  name: other.army.name,
                  faction: other.armyFaction ? { slug: other.armyFaction.slug, name: other.armyFaction.displayName } : null,
                  detachments: other.army.detachments.map((detachment) => detachment.name),
                  disposition: other.army.disposition,
                  points: other.army.points,
                }
              : null,
        })),
        rounds:
          sealedEvent.rounds === null
            ? null
            : {
                total: sealedEvent.rounds,
                current: round,
                tablesThisRound: sealedEvent.pairings.filter((pairing) => pairing.round === round).length,
                yourTable: current ? table(current) : null,
                yourEarlierTables: sealedEvent.pairings
                  .filter((pairing) => pairing.round < round && (pairing.aId === me || pairing.bId === me))
                  .map(table),
              },
        standings:
          standings &&
          standings.map((row, at) => ({
            place: at + 1,
            ...named(row.userId)!,
            played: row.played,
            won: row.won,
            drawn: row.drawn,
            lost: row.lost,
            points: row.points,
            vp: row.vp ?? null,
          })),
        standingsPartial: results?.partial ?? false,
        yourBattles: mine.battles.map(tableBattle),
        todo: eventTodo(sealedEvent, me, battles),
      })
    },
  )

  server.registerTool(
    'join_group',
    {
      title: 'Join a group',
      description:
        'Joins a group by its token, as its invite link does. A group whose organizers approve each member answers pending until they let you in. Requires mcp:write.',
      inputSchema: { token: tokenField.describe('The group token, from its invite link or list_my_events open groups.') },
      annotations: WRITE,
    },
    ({ token: groupToken }) =>
      write(async (owner) => {
        const status = await app().service.groupService.joinGroup(groupToken, owner)
        await captureMutation(owner, 'group_joined', { status })
        return { status, url: `/groups/${encodeURIComponent(groupToken)}` }
      }),
  )

  server.registerTool(
    'join_league',
    {
      title: "Join a group's league",
      description:
        'Joins the draft league of a group you are a member of. Nobody can join once an organizer publishes its fixtures. Requires mcp:write.',
      inputSchema: { token: tokenField.describe('The group token.') },
      annotations: WRITE,
    },
    ({ token: groupToken }) =>
      write(async (owner) => {
        await app().service.groupService.joinLeague(groupToken, owner)
        await captureMutation(owner, 'group_league_joined')
        return { joined: true, url: `/groups/${encodeURIComponent(groupToken)}` }
      }),
  )

  server.registerTool(
    'join_event',
    {
      title: 'Join a tournament or hidden-list game',
      description:
        'Enters the signed-in player in a tournament by its token, as its invite link does, or in a hidden-list game of a group they belong to. A tournament whose organizer approves each player answers pending until they let you in. Closed once lists are revealed or the roster deadline passes. Requires mcp:write.',
      inputSchema: eventInput,
      annotations: WRITE,
    },
    ({ token: hostToken, eventToken }) =>
      write(async (owner) => {
        const status = await productActions.joinSealedEvent(owner, { token: hostToken, eventToken })
        return { status }
      }),
  )

  server.registerTool(
    'submit_event_roster',
    {
      title: 'Seal my roster for a tournament',
      description:
        "Seals one of the signed-in player's saved rosters for a tournament or hidden-list game, or replaces the list sealed before, with the site's checks: battle size, points, the event's house rules, a Warlord, and the roster deadline. Sealing stores a copy; later edits to the saved roster don't change it. Before the reveal only you and an assigned ally can read it. Check the roster with get_my_roster first, and seal only after the player confirms. Requires mcp:write.",
      inputSchema: { ...eventInput, rosterId: z.string().min(1).max(128).describe('A roster id from list_my_rosters.') },
      annotations: WRITE,
    },
    ({ token: hostToken, eventToken, rosterId }) =>
      write(async (owner) => {
        await productActions.submitSealedEventRoster(owner, { token: hostToken, eventToken, rosterId })
        return { sealed: true, rosterId }
      }),
  )

  server.registerTool(
    'check_in_event',
    {
      title: 'Check in to a tournament',
      description:
        "Marks the signed-in player as arrived at a Swiss tournament, or not, before round 1 is paired; an organizer may drop players who haven't checked in. Requires mcp:write.",
      inputSchema: { ...eventInput, checkedIn: z.boolean().default(true).describe('false to undo a check-in.') },
      annotations: WRITE,
    },
    ({ token: hostToken, eventToken, checkedIn }) =>
      write(async (owner) => {
        // Always the player's own seat: checking in someone else is the organizer's.
        await app().service.sealedEventService.checkIn(hostToken, eventToken ?? hostToken, owner, owner, checkedIn)
        return { checkedIn }
      }),
  )

  server.registerTool(
    'start_event_battle',
    {
      title: 'Start my tournament battle',
      description:
        "Starts the battle for a revealed tournament or hidden-list game with both sealed lists attached, as Start battle on its page does, and returns its token for get_my_battle and submit_battle_action. In Swiss rounds omit opponentId to play your current table; Swiss refuses anyone else. Otherwise name the opponent from get_my_event's entrants, and for a team game the ally and second opponent too. For a league fixture use create_battle with the fixture's start instead. Requires mcp:write.",
      inputSchema: {
        ...eventInput,
        opponentId: z.string().min(1).max(128).optional().describe('An entrant id; omit in Swiss rounds for your paired opponent.'),
        allyId: z.string().min(1).max(128).optional().describe('Your ally in a 2v1 or 2v2 game.'),
        secondOpponentId: z.string().min(1).max(128).optional().describe('The second opposing player in a 2v1 or 2v2 game.'),
        missionPackId,
      },
      annotations: WRITE,
    },
    ({ token: hostToken, eventToken, opponentId, allyId, secondOpponentId, missionPackId: packId }) =>
      write(async (owner) => {
        let opponent = opponentId
        if (!opponent) {
          const sealedEvent = await readEvent(hostToken, eventToken, owner)
          const table = sealedEvent.rounds === null ? undefined : ownTable(sealedEvent, owner)
          if (!table) throw new Response('Name the opponentId to play, from get_my_event entrants.', { status: 400 })
          if (!table.bId) throw new Response('You have a bye this round, so there is no battle to start.', { status: 409 })
          opponent = table.aId === owner ? table.bId : table.aId
        }
        const { token: battleToken } = await productActions.createSealedEventBattle(owner, {
          token: hostToken,
          eventToken,
          opponentId: opponent,
          allyId,
          secondOpponentId,
          missionPackId: packId ?? (await currentPackId()),
        })
        return { token: battleToken, url: battleUrl(battleToken) }
      }),
  )

  server.registerTool(
    'report_table_result',
    {
      title: 'Report my table’s score',
      description:
        "Records the final score of the signed-in player's Swiss table, for a game not tracked on Praetorium, and finishes its battle; it counts for the tournament's standings but not the leaderboard. Report only a score both players agree. Defaults to your table this round. A result locks once the next round is paired; then only the organizer can reopen it. Requires mcp:write.",
      inputSchema: {
        ...eventInput,
        round: z.number().int().min(1).max(64).optional().describe('Omit for the current round.'),
        yourScore: z.number().int().min(0).max(999).describe('Your victory points.'),
        opponentScore: z.number().int().min(0).max(999).describe("Your opponent's victory points."),
        missionPackId,
      },
      annotations: WRITE,
    },
    ({ token: hostToken, eventToken, round, yourScore, opponentScore, missionPackId: packId }) =>
      write(async (owner) => {
        const sealedEvent = await readEvent(hostToken, eventToken, owner)
        const table = ownTable(sealedEvent, owner, round)
        // Reporting another table is the organizer's, which the assistant leaves to the page.
        if (!table) throw new Response('You have no table in that round. Read get_my_event for your table.', { status: 404 })
        if (!table.bId) throw new Response('A bye has no score to report.', { status: 409 })
        const vp: [number, number] = table.aId === owner ? [yourScore, opponentScore] : [opponentScore, yourScore]
        await app().service.sealedEventResultsService.reportTableResult(
          sealedEvent.token,
          sealedEvent.eventToken,
          table.round,
          table.table,
          vp,
          packId ?? (await currentPackId()),
          owner,
        )
        await captureMutation(owner, 'sealed_event_result_reported', { round: table.round })
        return { round: table.round, table: table.table, yourScore, opponentScore }
      }),
  )
}
