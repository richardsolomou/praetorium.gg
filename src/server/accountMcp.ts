import { battleFilterSchema } from '../core/battleFilter'
import { facetSchema } from '../core/listFilter'
import { battleOutcome } from '../core/standings'
import { READ_ONLY_TOOL, responseToolError, structured, type AgentTools } from './agentTools'
import { app } from './app'
import { agentWrites } from './mutationTelemetry'
import { rosterActions } from './rosterActions'
import { rosterSummary } from './rosterTools'
import { BATTLES_PAGE, type PraetoriumService } from './service'
import { battlesFeedSchema, playerProfileSchema, rosterIdSchema, rosterVisibilitySchema, saveRosterSchema } from '../contracts/schemas'

export const ACCOUNT_MCP_SCOPES: Record<string, 'mcp:read' | 'mcp:write'> = {
  list_my_rosters: 'mcp:read',
  get_my_roster: 'mcp:read',
  get_my_collection: 'mcp:read',
  list_my_battles: 'mcp:read',
  get_my_battle: 'mcp:read',
  get_my_stats: 'mcp:read',
  list_my_events: 'mcp:read',
  get_my_group: 'mcp:read',
  get_my_event: 'mcp:read',
  join_group: 'mcp:write',
  join_league: 'mcp:write',
  join_event: 'mcp:write',
  submit_event_roster: 'mcp:write',
  check_in_event: 'mcp:write',
  start_event_battle: 'mcp:write',
  report_table_result: 'mcp:write',
  save_roster: 'mcp:write',
  set_roster_visibility: 'mcp:write',
  copy_roster: 'mcp:write',
  delete_roster: 'mcp:write',
  set_roster_archived: 'mcp:write',
  create_battle: 'mcp:write',
  submit_battle_action: 'mcp:write',
  list_my_opponents: 'mcp:read',
  get_my_battle_report: 'mcp:read',
  delete_battle: 'mcp:write',
}

// Rosters and battles can be public, so a write may publish to other players.
export const WRITE = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true } as const

export async function resultOf(work: () => Promise<Record<string, unknown>>) {
  try {
    return structured(await agentWrites.run(true, work))
  } catch (error) {
    if (error instanceof Response && error.status < 500) return responseToolError(error)
    throw error
  }
}

const facet = (values: string) =>
  facetSchema.describe(`{in, out} lists of ${values}. A battle must carry one of in (when given) and none of out.`)

const myBattlesSchema = battlesFeedSchema.extend({
  before: battlesFeedSchema.shape.before.describe('nextCursor from the previous page; omit for the first page.'),
  filter: battleFilterSchema
    .extend({
      q: battleFilterSchema.shape.q.describe('Text matched against player, army, faction, detachment and mission names.'),
      status: facet('setup, playing, finished'),
      result: facet('won, lost, drawn, read from your seat; only finished battles have one'),
      ending: facet('completed, finished-early, conceded, reported'),
      faction: facet('faction slugs your side fielded, as list_factions gives them, such as necrons'),
      against: facet('faction slugs the opposing side fielded'),
      detachment: facet('detachment names your side fielded, exactly as shown, such as Awakened Dynasty'),
      againstDetachment: facet('detachment names the opposing side fielded'),
      player: facet('player ids, from players[].id of a listed battle'),
      size: facet('battle sizes in points as text, such as 2000'),
      pack: facet('mission pack ids, as list_reference gives them'),
      deployment: facet('deployment ids'),
      type: facet(
        'practice (played alone, every side by you), guest, team, manual (table keeps its own score), organised (counts for a group or tournament)',
      ),
      period: battleFilterSchema.shape.period.describe('Only battles from the last 7d, 30d, 90d or 1y; overrides from and to.'),
      from: battleFilterSchema.shape.from.describe('First UTC day to include, YYYY-MM-DD.'),
      to: battleFilterSchema.shape.to.describe('Last UTC day to include, YYYY-MM-DD.'),
    })
    .optional(),
  order: battlesFeedSchema.shape.order.describe('oldest for oldest first; omit for newest first.'),
})

type BattleSummary = Awaited<ReturnType<PraetoriumService['battles']>>['battles'][number]

/** A battle as an agent reads it: one entry per seat instead of parallel arrays, without images or sync versions. */
function agentBattle(battle: BattleSummary, userId: string) {
  const seat = battle.playerIds.indexOf(userId)
  return {
    url: `/battles/${encodeURIComponent(battle.token)}`,
    token: battle.token,
    createdAt: new Date(battle.createdAt).toISOString(),
    lastActivity: new Date(battle.lastActivity).toISOString(),
    status: battle.status,
    round: battle.round,
    phase: battle.phase,
    result: seat !== -1 && battle.status === 'finished' ? battleOutcome(battle, battle.sides[seat]!) : null,
    ending: battle.result?.reason ?? null,
    size: battle.settings.limit,
    missionPackId: battle.settings.missionPackId,
    mission: battle.mission ? { name: battle.mission.name, packId: battle.mission.packId } : null,
    deploymentId: battle.deploymentId,
    organised: battle.organised,
    players: battle.playerDetails.map(({ id, name, automated }, at) => {
      const faction = battle.factions[at]
      return {
        id,
        name,
        you: id === userId,
        automated,
        side: battle.sides[at],
        army: battle.armies[at],
        faction: faction ? { slug: faction.slug, name: faction.displayName } : null,
        detachments: battle.detachments[at],
        score: battle.scores[at],
        primary: battle.primaries[at],
        secondary: battle.secondaries[at],
        ratingChange: battle.ratingChanges?.[id] ?? null,
      }
    }),
  }
}

const myStatsSchema = playerProfileSchema.omit({ userId: true }).extend({
  faction: playerProfileSchema.shape.faction.describe('A faction slug you fielded, from facets.factions or list_factions.'),
  detachment: playerProfileSchema.shape.detachment.describe('A detachment name you fielded, exactly as facets.detachments lists it.'),
  opponentFaction: playerProfileSchema.shape.opponentFaction.describe('A faction slug an opponent fielded, from facets.opponentFactions.'),
  opponentDetachment: playerProfileSchema.shape.opponentDetachment.describe(
    'A detachment name an opponent fielded, from facets.opponentDetachments.',
  ),
  opponentId: playerProfileSchema.shape.opponentId.describe('An opponent player id from facets.opponents.'),
  missionPackId: playerProfileSchema.shape.missionPackId.describe('A mission pack id from facets.missionPacks.'),
  limit: playerProfileSchema.shape.limit.describe('A battle size in points, such as 2000.'),
})

type Ranking = {
  place: number
  of: number
  standing: { rating: number; battles: number; won: number; lost: number; drawn: number; points: number }
}
const ranking = ({ place, of, standing: { rating, battles, won, lost, drawn, points } }: Ranking) => ({
  place,
  of,
  rating,
  battles,
  won,
  lost,
  drawn,
  points,
})

export function registerAccountMcpTools(server: AgentTools, userId: string | null) {
  const owner = () => {
    if (!userId) throw new Response('Sign in to use this tool.', { status: 401 })
    return userId
  }

  server.registerTool(
    'list_my_rosters',
    {
      title: 'List my saved rosters',
      description: 'Lists the rosters saved to the signed-in Praetorium account. Requires mcp:read.',
      inputSchema: {},
      annotations: READ_ONLY_TOOL,
    },
    () => resultOf(async () => ({ rosters: await app().service.rosterService.savedRosterSummaries(owner()) })),
  )
  server.registerTool(
    'get_my_roster',
    {
      title: 'Read my saved roster',
      description:
        'Returns one roster owned by the signed-in player, by an id from list_my_rosters. summary names each unit with its points, models, wargear, enhancements, Warlord and attachments, and gives the total and any problems that stop the list being fielded; it is null while army data is unavailable. roster holds the saved choices by catalogue id, the shape save_roster takes. Requires mcp:read.',
      inputSchema: rosterIdSchema.shape,
      annotations: READ_ONLY_TOOL,
    },
    ({ id }) =>
      resultOf(async () => {
        const roster = await app().service.sealedEventService.ownRoster(owner(), id)
        if (!roster) throw new Response('You have no saved roster with this id. Use an id from list_my_rosters.', { status: 404 })
        return { summary: await rosterSummary(roster), roster }
      }),
  )
  server.registerTool(
    'list_my_battles',
    {
      title: 'List my battles',
      description: `Lists the signed-in player's battles, newest first, up to ${BATTLES_PAGE} a page, narrowed and ordered as the battles page is. Each battle has its url, status, your result, ending, size, mission and one entry per seat (you, side, army, faction, detachments, score with its primary and secondary halves, rating change). A filtered page can come back short or empty while nextCursor is set; keep paging until nextCursor is null. Requires mcp:read.`,
      inputSchema: myBattlesSchema,
      annotations: READ_ONLY_TOOL,
    },
    ({ before, filter, order }) =>
      resultOf(async () => {
        const instance = app()
        const player = owner()
        const [rules, factions] = await Promise.all([instance.rulesFor(), instance.battleFactionsFor()])
        const { battles, nextCursor } = await instance.service.battles(
          player,
          rules,
          { limit: BATTLES_PAGE, before: before ?? undefined, filter, order },
          factions,
        )
        return { battles: battles.map((battle) => agentBattle(battle, player)), nextCursor }
      }),
  )
  server.registerTool(
    'get_my_stats',
    {
      title: 'Read my battle statistics',
      description:
        "Returns the signed-in player's record as their profile shows it, over their latest 200 finished battles except practice games, optionally narrowed. record: battles, won, lost, drawn, rate (win rate 0 to 1, a draw counting half), going first and second, average points, streaks, command points, stratagems and secondary cards used, primary missions, opposing factions and opponents. performance: the same split per detachment, primary mission and battle size. facets: the values each filter takes, with battle counts. rankings: leaderboard places from rated public battles, overall and per faction, unaffected by the filters. List the battles themselves with list_my_battles. Requires mcp:read.",
      inputSchema: myStatsSchema,
      annotations: READ_ONLY_TOOL,
    },
    (filter) =>
      resultOf(async () => {
        const instance = app()
        const player = owner()
        const [rules, factions] = await Promise.all([instance.rulesFor(), instance.battleFactionsFor()])
        const [{ record, performance, facets }, rankings] = await Promise.all([
          instance.service.playerProfile(player, player, filter, rules, factions),
          instance.service.playerRankings(player),
        ])
        const totals = (rows: typeof performance.detachments) => rows.map(({ key, label, total }) => ({ key, label, ...total }))
        return {
          record: { ...record, opponents: record.opponents.map(({ image: _image, ...opponent }) => opponent) },
          performance: {
            detachments: totals(performance.detachments),
            missions: totals(performance.missions),
            sizes: totals(performance.sizes),
          },
          facets: Object.fromEntries(
            Object.entries(facets).map(([dimension, values]) => [
              dimension,
              values.map(({ value, label, battles }) => ({ value, label, battles })),
            ]),
          ),
          rankings: {
            overall: rankings.overall && ranking(rankings.overall),
            factions: rankings.factions.map((place) => ({
              faction: { slug: place.faction.slug, name: place.faction.displayName },
              ...ranking(place),
            })),
          },
        }
      }),
  )
  server.registerTool(
    'save_roster',
    {
      title: 'Create or edit my roster',
      description:
        'Saves a complete roster. Pass its id to edit an owned roster; omit id to create one. limit is the battle size (1000, 2000 or 3000 points, or 600 for King of the Colosseum), which sets detachment points, enhancement and unit limits. pointsBudget optionally replaces only its points total (500 to 10000, not King of the Colosseum); omit it to keep a saved budget, or send null for the standard total. Requires mcp:write.',
      inputSchema: saveRosterSchema,
      annotations: WRITE,
    },
    (data) =>
      resultOf(async () => {
        const { id, updatedAt } = await rosterActions.save(owner(), data)
        return { id, updatedAt, url: `/rosters/${encodeURIComponent(id)}` }
      }),
  )
  server.registerTool(
    'set_roster_visibility',
    {
      title: 'Change my roster visibility',
      description: 'Changes the visibility of an owned roster. Requires mcp:write.',
      inputSchema: rosterVisibilitySchema.shape,
      annotations: WRITE,
    },
    ({ id, visibility }) =>
      resultOf(async () => {
        await rosterActions.setVisibility(owner(), { id, visibility })
        return { id, visibility }
      }),
  )
}
