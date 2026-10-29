import { READ_ONLY_TOOL, responseToolError, structured, type AgentTools } from './agentTools'
import { app } from './app'
import { submitBattleCommand } from './battleSubmission'
import { agentWrites } from './mutationTelemetry'
import { productActions } from './productActions'
import { rosterActions } from './rosterActions'
import { BATTLES_PAGE } from './service'
import {
  battlesPageSchema,
  createBattleSchema,
  rosterIdSchema,
  rosterVisibilitySchema,
  saveRosterSchema,
  submitSchema,
  tokenSchema,
} from '../contracts/schemas'

export const ACCOUNT_MCP_SCOPES: Record<string, 'mcp:read' | 'mcp:write'> = {
  list_my_rosters: 'mcp:read',
  get_my_roster: 'mcp:read',
  list_my_battles: 'mcp:read',
  get_my_battle: 'mcp:read',
  save_roster: 'mcp:write',
  set_roster_visibility: 'mcp:write',
  create_battle: 'mcp:write',
  submit_battle_action: 'mcp:write',
}

// Rosters and battles can be public, so a write may publish to other players.
const WRITE = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true } as const

async function resultOf(work: () => Promise<Record<string, unknown>>) {
  try {
    return structured(await agentWrites.run(true, work))
  } catch (error) {
    if (error instanceof Response && error.status < 500) return responseToolError(error)
    throw error
  }
}

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
        'Returns the saved choices for one roster owned by the signed-in player, by an id from list_my_rosters. Requires mcp:read.',
      inputSchema: rosterIdSchema.shape,
      annotations: READ_ONLY_TOOL,
    },
    ({ id }) =>
      resultOf(async () => {
        const roster = await app().service.leagueService.ownRoster(owner(), id)
        if (!roster) throw new Response('You have no saved roster with this id. Use an id from list_my_rosters.', { status: 404 })
        return { roster }
      }),
  )
  server.registerTool(
    'list_my_battles',
    {
      title: 'List my battles',
      description: `Lists up to ${BATTLES_PAGE} battles with a cursor for the next page. Requires mcp:read.`,
      inputSchema: battlesPageSchema.shape,
      annotations: READ_ONLY_TOOL,
    },
    ({ before }) =>
      resultOf(async () => {
        const instance = app()
        const [rules, factions] = await Promise.all([instance.battleMissionRulesFor(), instance.factionIndexFor()])
        return instance.service.battles(owner(), rules, { limit: BATTLES_PAGE, before: before ?? undefined }, factions?.factions ?? [])
      }),
  )
  server.registerTool(
    'get_my_battle',
    {
      title: 'Read one of my battles',
      description: 'Returns the current seated view of a battle for the signed-in player. Requires mcp:read.',
      inputSchema: tokenSchema.shape,
      annotations: READ_ONLY_TOOL,
    },
    ({ token }) =>
      resultOf(async () => {
        const instance = app()
        await instance.service.userBattleId(token, owner())
        return { battle: await instance.service.screen(token, owner(), await instance.battleReadRulesFor()) }
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
  server.registerTool(
    'create_battle',
    {
      title: 'Create a battle',
      description: 'Creates a battle with named player seats, using the same rules as the site. Requires mcp:write.',
      inputSchema: createBattleSchema,
      annotations: WRITE,
    },
    (data) => resultOf(async () => ({ battle: await productActions.createBattle(owner(), data) })),
  )
  server.registerTool(
    'submit_battle_action',
    {
      title: 'Record a battle action',
      description: 'Appends a legal battle command only when expectedSeq matches the current log. Requires mcp:write.',
      inputSchema: submitSchema.shape,
      annotations: WRITE,
    },
    ({ token, expectedSeq, command }) => resultOf(async () => submitBattleCommand(owner(), { token, expectedSeq, command })),
  )
}
